/**
 * School-scoped report export API.
 *
 * POST /api/school/reports/export
 * Body: {
 *   schoolId: string
 *   format: "csv"                  // pdf to be added later
 *   reportType: "attempts" | "assignments" | "progress"
 *   classroomId?: string           // optional classroom filter
 *   subject?: string               // optional subject filter
 *   days?: number                  // lookback window (1–365, default 30)
 * }
 *
 * Security:
 *   - Requires teacher+ role via requireTeacher()
 *   - Students resolved through getAccessibleStudents() — teachers see only their classrooms
 *   - schoolId never taken from student records; always from verified guard context
 *   - Output rows include schoolId as first column so logs are self-describing
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTeacher } from "@/lib/schools/guards";
import { getAccessibleStudents } from "@/lib/schools/scoping";
import { csvEscape } from "@/lib/csv_escape";

function buildCsv(rows: Array<Array<string | number | boolean | null>>): string {
  return rows.map((row) => row.map((cell) => csvEscape(cell ?? "")).join(",")).join("\r\n");
}

type ExportBody = {
  schoolId: string;
  format?: string;
  reportType?: string;
  classroomId?: string;
  subject?: string;
  days?: number;
};

export async function POST(request: Request) {
  let body: ExportBody;
  try {
    body = (await request.json()) as ExportBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { schoolId, classroomId, subject } = body;
  const format = body.format ?? "csv";
  const reportType = body.reportType ?? "attempts";
  const days = Math.min(365, Math.max(1, body.days ?? 30));

  if (typeof schoolId !== "string" || !schoolId) {
    return NextResponse.json({ error: "schoolId is required" }, { status: 400 });
  }

  if (format !== "csv") {
    return NextResponse.json({ error: "Only format=csv is supported" }, { status: 400 });
  }

  if (!["attempts", "assignments", "progress"].includes(reportType)) {
    return NextResponse.json(
      { error: "reportType must be one of: attempts, assignments, progress" },
      { status: 400 }
    );
  }

  const access = await requireTeacher(schoolId, {
    method: "POST",
    route: "/api/school/reports/export",
    resourceType: "report",
    resourceId: reportType,
  });
  if (access.response) return access.response;

  const { context } = access;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Resolve accessible students — enforces school + classroom scope
  const students = await getAccessibleStudents(
    schoolId,
    context.schoolTeacherId,
    context.role,
    classroomId
  );

  if (students.length === 0) {
    const csv = buildCsv([["schoolId", "message"], [schoolId, "No students found for this scope"]]);
    return new NextResponse(csv, {
      status: 200,
      headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${reportType}-empty.csv"` },
    });
  }

  const childIds = students.map((s) => s.childId);
  const studentMeta = new Map(
    students.map((s) => [s.childId, { name: s.child.name, classroom: s.classroom?.name ?? "" }])
  );

  const today = new Date().toISOString().slice(0, 10);
  let csv = "";

  // ── Attempts report ──────────────────────────────────────────────────────
  if (reportType === "attempts") {
    const attempts = await prisma.attempt.findMany({
      where: {
        studentId: { in: childIds },
        createdAt: { gte: since },
        ...(subject ? { subject } : {}),
      },
      select: {
        id: true,
        studentId: true,
        subject: true,
        spellingMode: true,
        keyStage: true,
        yearGroup: true,
        skillFocus: true,
        correct: true,
        responseTimeMs: true,
        difficulty: true,
        skills: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const rows: Array<Array<string | number | boolean | null>> = [
      [
        "schoolId", "studentId", "studentName", "classroom",
        "subject", "spellingMode", "keyStage", "yearGroup",
        "skillFocus", "correct", "responseTimeMs", "difficulty", "skills", "attemptAt",
      ],
    ];
    for (const a of attempts) {
      const meta = studentMeta.get(a.studentId);
      rows.push([
        schoolId,
        a.studentId,
        meta?.name ?? "",
        meta?.classroom ?? "",
        a.subject,
        a.spellingMode ?? "",
        a.keyStage ?? "",
        a.yearGroup ?? "",
        a.skillFocus,
        a.correct,
        a.responseTimeMs,
        a.difficulty,
        a.skills ?? "",
        a.createdAt.toISOString(),
      ]);
    }
    csv = buildCsv(rows);
  }

  // ── Assignments report ───────────────────────────────────────────────────
  if (reportType === "assignments") {
    const assignments = await prisma.assignment.findMany({
      where: { studentId: { in: childIds } },
      include: {
        content: { select: { contentType: true, level: true, topic: true, keyStage: true, yearGroup: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const rows: Array<Array<string | number | boolean | null>> = [
      [
        "schoolId", "assignmentId", "studentId", "studentName", "classroom",
        "contentType", "level", "topic", "keyStage", "yearGroup", "status", "assignedAt", "updatedAt",
      ],
    ];
    for (const a of assignments) {
      const meta = studentMeta.get(a.studentId);
      rows.push([
        schoolId,
        a.id,
        a.studentId,
        meta?.name ?? "",
        meta?.classroom ?? "",
        a.content.contentType,
        a.content.level,
        a.content.topic,
        a.content.keyStage ?? "",
        a.content.yearGroup ?? "",
        a.status,
        a.createdAt.toISOString(),
        a.updatedAt.toISOString(),
      ]);
    }
    csv = buildCsv(rows);
  }

  // ── Progress report ──────────────────────────────────────────────────────
  if (reportType === "progress") {
    const skills = await prisma.studentSkill.findMany({
      where: { studentId: { in: childIds } },
      select: {
        studentId: true,
        skill: true,
        accuracy: true,
        attempts: true,
        correct: true,
        status: true,
        updatedAt: true,
      },
      orderBy: [{ studentId: "asc" }, { accuracy: "asc" }],
    });

    const rows: Array<Array<string | number | boolean | null>> = [
      ["schoolId", "studentId", "studentName", "classroom", "skill", "accuracy", "attempts", "correct", "status", "updatedAt"],
    ];
    for (const s of skills) {
      const meta = studentMeta.get(s.studentId);
      rows.push([
        schoolId,
        s.studentId,
        meta?.name ?? "",
        meta?.classroom ?? "",
        s.skill,
        Math.round(s.accuracy * 100) / 100,
        s.attempts,
        s.correct,
        s.status,
        s.updatedAt.toISOString(),
      ]);
    }
    csv = buildCsv(rows);
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reportType}-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
