/**
 * School-scoped assignments API.
 *
 * GET  /api/school/assignments?schoolId=...&classroomId=...&status=...&page=1
 *   → List assignments for students in the caller's accessible classrooms
 *
 * POST /api/school/assignments
 *   → Issue a new assignment to a school student (teacher+ role required)
 *   Body: { schoolId, studentId, contentId }
 *
 * Tenant safety: every query verifies studentId belongs to schoolId before
 * returning or creating data, preventing cross-tenant leakage.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTeacher } from "@/lib/schools/guards";
import { getAccessibleStudents } from "@/lib/schools/scoping";

// ─── GET ──────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const url = new URL(request.url);
  const schoolId = url.searchParams.get("schoolId");

  if (!schoolId) {
    return NextResponse.json({ error: "schoolId is required" }, { status: 400 });
  }

  const access = await requireTeacher(schoolId, {
    method: "GET",
    route: "/api/school/assignments",
    resourceType: "assignment",
  });
  if (access.response) return access.response;

  const { context } = access;

  const classroomId = url.searchParams.get("classroomId") ?? undefined;
  const statusFilter = url.searchParams.get("status") ?? undefined;
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = 50;

  // Resolve students accessible to this user, scoped to their classrooms
  const students = await getAccessibleStudents(
    schoolId,
    context.schoolTeacherId,
    context.role,
    classroomId
  );
  const studentIds = students.map((s) => s.childId);

  if (studentIds.length === 0) {
    return NextResponse.json({ assignments: [], pagination: { page, pageSize, total: 0, totalPages: 0 } });
  }

  const where = {
    studentId: { in: studentIds },
    ...(statusFilter ? { status: statusFilter } : {}),
  };

  const [assignments, total] = await Promise.all([
    prisma.assignment.findMany({
      where,
      include: {
        student: { select: { id: true, name: true } },
        content: {
          select: { id: true, contentType: true, level: true, topic: true, keyStage: true, yearGroup: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.assignment.count({ where }),
  ]);

  return NextResponse.json({
    assignments: assignments.map((a) => ({
      id: a.id,
      status: a.status,
      student: a.student,
      content: a.content,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

// ─── POST ─────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { schoolId, studentId, contentId } = body as Record<string, unknown>;

  if (typeof schoolId !== "string" || typeof studentId !== "string" || typeof contentId !== "string") {
    return NextResponse.json({ error: "schoolId, studentId, contentId are required" }, { status: 400 });
  }

  const access = await requireTeacher(schoolId, {
    method: "POST",
    route: "/api/school/assignments",
    resourceType: "assignment",
  });
  if (access.response) return access.response;

  // ── Tenant check: verify the student belongs to this school ──
  const schoolStudent = await prisma.schoolStudent.findUnique({
    where: { schoolId_childId: { schoolId, childId: studentId } },
    select: { id: true, status: true, classroomId: true },
  });

  if (!schoolStudent || schoolStudent.status !== "active") {
    return NextResponse.json(
      { error: "Student not found or not active in this school" },
      { status: 404 }
    );
  }

  // ── Teacher scope check: teacher can only assign to their own classrooms ──
  if (access.context.role === "teacher" && schoolStudent.classroomId) {
    const teacherClassrooms = await prisma.classroom.findMany({
      where: { schoolId, teacherId: access.context.schoolTeacherId, status: "active" },
      select: { id: true },
    });
    const allowed = teacherClassrooms.map((c) => c.id);
    if (!allowed.includes(schoolStudent.classroomId)) {
      return NextResponse.json(
        { error: "Forbidden: student is not in one of your classrooms" },
        { status: 403 }
      );
    }
  }

  // ── Verify content exists and is approved/published ──
  const content = await prisma.aIContentCache.findUnique({
    where: { id: contentId },
    select: { id: true, status: true, contentType: true, level: true, topic: true },
  });

  if (!content || !["approved", "published"].includes(content.status)) {
    return NextResponse.json(
      { error: "Content not found or not approved for assignment" },
      { status: 404 }
    );
  }

  const assignment = await prisma.assignment.upsert({
    where: { studentId_contentId: { studentId, contentId } },
    update: { status: "assigned", updatedAt: new Date() },
    create: { studentId, contentId, status: "assigned" },
    select: { id: true, status: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json({ assignment }, { status: 201 });
}
