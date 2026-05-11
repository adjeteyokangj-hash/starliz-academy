/**
 * School-scoped analytics API.
 *
 * GET /api/school/analytics?schoolId=...&classroomId=...&subject=...&days=30
 *
 * Returns aggregated attempt metrics for students accessible to the caller.
 * All data is strictly scoped to the school — students are resolved via
 * getAccessibleStudents() so teachers only see their own classrooms.
 *
 * Response shape:
 * {
 *   summary: { totalAttempts, correctAttempts, accuracy, avgResponseMs, activeStudents }
 *   bySubject: [{ subject, attempts, correct, accuracy }]
 *   byStudent: [{ studentId, name, classroomName, attempts, correct, accuracy, avgDifficulty }]
 *   weakAreas:  [{ skill, count }]
 * }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTeacher } from "@/lib/schools/guards";
import { getAccessibleStudents } from "@/lib/schools/scoping";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const schoolId = url.searchParams.get("schoolId");

  if (!schoolId) {
    return NextResponse.json({ error: "schoolId is required" }, { status: 400 });
  }

  const access = await requireTeacher(schoolId, {
    method: "GET",
    route: "/api/school/analytics",
    resourceType: "analytics",
  });
  if (access.response) return access.response;

  const { context } = access;

  const classroomId = url.searchParams.get("classroomId") ?? undefined;
  const subject = url.searchParams.get("subject") ?? undefined;
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days") ?? "30", 10)));

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Resolve accessible students — teachers scoped to their classrooms
  const students = await getAccessibleStudents(
    schoolId,
    context.schoolTeacherId,
    context.role,
    classroomId
  );

  if (students.length === 0) {
    return NextResponse.json({
      summary: { totalAttempts: 0, correctAttempts: 0, accuracy: 0, avgResponseMs: 0, activeStudents: 0 },
      bySubject: [],
      byStudent: [],
      weakAreas: [],
    });
  }

  const childIds = students.map((s) => s.childId);

  // Build attempt where clause — schoolId is enforced via childIds (which come from school-scoped student list)
  const attemptWhere = {
    studentId: { in: childIds },
    createdAt: { gte: since },
    ...(subject ? { subject } : {}),
  };

  const attempts = await prisma.attempt.findMany({
    where: attemptWhere,
    select: {
      studentId: true,
      subject: true,
      correct: true,
      responseTimeMs: true,
      difficulty: true,
      skills: true,
    },
  });

  // ── Aggregate summary ──
  const totalAttempts = attempts.length;
  const correctAttempts = attempts.filter((a) => a.correct).length;
  const accuracy = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;
  const avgResponseMs =
    totalAttempts > 0
      ? Math.round(attempts.reduce((sum, a) => sum + a.responseTimeMs, 0) / totalAttempts)
      : 0;
  const activeStudents = new Set(attempts.map((a) => a.studentId)).size;

  // ── By subject ──
  const subjectMap = new Map<string, { attempts: number; correct: number }>();
  for (const a of attempts) {
    const entry = subjectMap.get(a.subject) ?? { attempts: 0, correct: 0 };
    entry.attempts += 1;
    if (a.correct) entry.correct += 1;
    subjectMap.set(a.subject, entry);
  }
  const bySubject = Array.from(subjectMap.entries()).map(([subj, data]) => ({
    subject: subj,
    attempts: data.attempts,
    correct: data.correct,
    accuracy: Math.round((data.correct / data.attempts) * 100),
  }));

  // ── By student ──
  const studentMeta = new Map(
    students.map((s) => [
      s.childId,
      { name: s.child.name, classroomName: s.classroom?.name ?? null },
    ])
  );
  const studentMap = new Map<string, { attempts: number; correct: number; difficultySum: number }>();
  for (const a of attempts) {
    const entry = studentMap.get(a.studentId) ?? { attempts: 0, correct: 0, difficultySum: 0 };
    entry.attempts += 1;
    if (a.correct) entry.correct += 1;
    entry.difficultySum += a.difficulty;
    studentMap.set(a.studentId, entry);
  }
  const byStudent = Array.from(studentMap.entries()).map(([sid, data]) => {
    const meta = studentMeta.get(sid);
    return {
      studentId: sid,
      name: meta?.name ?? "Unknown",
      classroomName: meta?.classroomName ?? null,
      attempts: data.attempts,
      correct: data.correct,
      accuracy: Math.round((data.correct / data.attempts) * 100),
      avgDifficulty: Math.round((data.difficultySum / data.attempts) * 10) / 10,
    };
  });
  byStudent.sort((a, b) => a.accuracy - b.accuracy); // weakest first

  // ── Weak areas (skill codes) ──
  const skillCount = new Map<string, number>();
  for (const a of attempts.filter((x) => !x.correct && x.skills)) {
    for (const skill of (a.skills as string).split(",").map((s) => s.trim()).filter(Boolean)) {
      skillCount.set(skill, (skillCount.get(skill) ?? 0) + 1);
    }
  }
  const weakAreas = Array.from(skillCount.entries())
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return NextResponse.json({
    meta: { schoolId, days, since: since.toISOString(), classroomId: classroomId ?? null, subject: subject ?? null },
    summary: { totalAttempts, correctAttempts, accuracy, avgResponseMs, activeStudents },
    bySubject,
    byStudent,
    weakAreas,
  });
}
