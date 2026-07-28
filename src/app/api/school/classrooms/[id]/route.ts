import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import { isAssignableClassroomTeacher } from "@/lib/schools/classroom-eligibility";
import { keyStageForYearGroup } from "@/lib/curriculum";
import { requireSchoolPermission } from "@/lib/schools/guards";
import { getSchoolRoleLabel } from "@/lib/schools/permissions";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  schoolId: z.string().min(1),
  action: z.enum([
    "update",
    "archive",
    "reactivate",
    "assignTeacher",
    "unassignTeacher",
    "assignStudents",
    "removeStudent",
    "moveStudent",
  ]),
  name: z.string().trim().min(1).max(120).optional(),
  yearGroup: z.string().trim().max(40).optional().nullable(),
  academicYear: z.string().trim().max(40).optional().nullable(),
  teacherId: z.string().min(1).optional().nullable(),
  schoolStudentIds: z.array(z.string().min(1)).optional(),
  schoolStudentId: z.string().min(1).optional(),
  targetClassroomId: z.string().min(1).optional(),
});

const DAY_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

async function loadClassroom(id: string, schoolId: string) {
  return prisma.classroom.findFirst({
    where: { id, schoolId },
    include: {
      teacher: { include: { user: { select: { id: true, name: true, email: true } } } },
      students: {
        where: { status: "active" },
        include: {
          child: { select: { id: true, name: true, yearGroup: true } },
          parentLinks: {
            where: { status: "active" },
            take: 2,
            include: { parent: { select: { id: true, name: true, email: true } } },
          },
        },
        orderBy: { child: { name: "asc" } },
      },
      dayLessons: {
        orderBy: [{ dayOfWeek: "asc" }, { periodIndex: "asc" }],
        include: {
          teacher: { include: { user: { select: { name: true, email: true } } } },
        },
        take: 100,
      },
      _count: { select: { students: { where: { status: "active" } }, dayLessons: true } },
    },
  });
}

function serializeDetail(classroom: NonNullable<Awaited<ReturnType<typeof loadClassroom>>>) {
  return {
    id: classroom.id,
    schoolId: classroom.schoolId,
    name: classroom.name,
    yearGroup: classroom.yearGroup,
    keyStage: classroom.yearGroup ? keyStageForYearGroup(classroom.yearGroup) : null,
    academicYear: classroom.academicYear,
    status: classroom.status,
    teacherId: classroom.teacherId,
    teacher: classroom.teacher
      ? {
          id: classroom.teacher.id,
          role: classroom.teacher.role,
          roleLabel: getSchoolRoleLabel(classroom.teacher.role),
          status: classroom.teacher.status,
          user: classroom.teacher.user,
        }
      : null,
    additionalTeachers: [] as Array<never>,
    studentCount: classroom._count.students,
    teacherCount: classroom.teacherId ? 1 : 0,
    timetablePeriodCount: classroom._count.dayLessons,
    capacity: null as number | null,
    createdAt: classroom.createdAt.toISOString(),
    updatedAt: classroom.updatedAt.toISOString(),
    students: classroom.students.map((student) => ({
      id: student.id,
      status: student.status,
      joinedAt: student.joinedAt.toISOString(),
      child: student.child,
      parents: student.parentLinks.map((link) => ({
        id: link.parent.id,
        name: link.parent.name,
        email: link.parent.email,
      })),
    })),
    timetable: classroom.dayLessons.map((lesson) => ({
      id: lesson.id,
      dayOfWeek: lesson.dayOfWeek,
      dayLabel: DAY_LABELS[lesson.dayOfWeek] ?? String(lesson.dayOfWeek),
      subject: lesson.subject,
      title: lesson.title,
      startsAt: lesson.startsAt,
      endsAt: lesson.endsAt,
      room: lesson.room,
      status: lesson.status,
      teacherName: lesson.teacher?.user.name ?? lesson.teacher?.user.email ?? null,
    })),
  };
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const schoolId = new URL(request.url).searchParams.get("schoolId");
  if (!schoolId) return NextResponse.json({ error: "schoolId is required" }, { status: 400 });

  const { response } = await requireSchoolPermission(schoolId, "manageClassrooms", {
    method: "GET",
    route: "/api/school/classrooms/[id]",
    resourceType: "classroom",
    resourceId: id,
  });
  if (response) return response;

  const classroom = await loadClassroom(id, schoolId);
  if (!classroom) return NextResponse.json({ error: "Class not found." }, { status: 404 });

  const [eligibleTeachers, unassignedStudents, auditLogs] = await Promise.all([
    prisma.schoolTeacher.findMany({
      where: { schoolId, status: "active", role: { in: ["owner", "admin", "teacher"] } },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.schoolStudent.findMany({
      where: { schoolId, status: "active", OR: [{ classroomId: null }, { classroomId: { not: id } }] },
      include: {
        child: { select: { id: true, name: true, yearGroup: true } },
        classroom: { select: { id: true, name: true } },
      },
      orderBy: { child: { name: "asc" } },
      take: 500,
    }),
    prisma.schoolAuditLog.findMany({
      where: { schoolId, entityType: "classroom", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return NextResponse.json({
    item: serializeDetail(classroom),
    eligibleTeachers: eligibleTeachers.map((t) => ({
      id: t.id,
      role: t.role,
      roleLabel: getSchoolRoleLabel(t.role),
      user: t.user,
    })),
    assignableStudents: unassignedStudents.map((s) => ({
      id: s.id,
      child: s.child,
      currentClassroom: s.classroom,
    })),
    auditLogs: auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      createdAt: log.createdAt.toISOString(),
      metadata: log.metadataJson ? JSON.parse(log.metadataJson) : null,
    })),
    capabilities: {
      additionalTeachers: false,
      capacity: false,
      archive: true,
      moveStudent: true,
    },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  let body: z.infer<typeof patchSchema>;
  try { body = patchSchema.parse(await request.json()); }
  catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { context: access, response } = await requireSchoolPermission(body.schoolId, "manageClassrooms", {
    method: "PATCH",
    route: "/api/school/classrooms/[id]",
    resourceType: "classroom",
    resourceId: id,
  });
  if (response) return response;

  const classroom = await prisma.classroom.findFirst({ where: { id, schoolId: body.schoolId } });
  if (!classroom) return NextResponse.json({ error: "Class not found." }, { status: 404 });

  if (body.action === "archive") {
    const periodCount = await prisma.schoolDayLesson.count({ where: { classroomId: id, schoolId: body.schoolId } });
    const updated = await prisma.classroom.update({
      where: { id },
      data: { status: "archived" },
    });
    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: access.userId,
      action: "classroom_archived",
      entityType: "classroom",
      entityId: id,
      severity: "warning",
      metadata: { previousStatus: classroom.status, timetablePeriodCount: periodCount },
    });
    return NextResponse.json({ ok: true, status: updated.status });
  }

  if (body.action === "reactivate") {
    const updated = await prisma.classroom.update({
      where: { id },
      data: { status: "active" },
    });
    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: access.userId,
      action: "classroom_reactivated",
      entityType: "classroom",
      entityId: id,
      severity: "info",
      metadata: { previousStatus: classroom.status },
    });
    return NextResponse.json({ ok: true, status: updated.status });
  }

  if (body.action === "assignTeacher" || body.action === "unassignTeacher") {
    const nextTeacherId = body.action === "unassignTeacher" ? null : (body.teacherId ?? null);
    if (nextTeacherId) {
      const teacher = await prisma.schoolTeacher.findUnique({ where: { id: nextTeacherId } });
      if (!teacher || !isAssignableClassroomTeacher(teacher, body.schoolId)) {
        return NextResponse.json({ error: "Teacher must be an active teaching staff member of this school." }, { status: 400 });
      }
    }
    await prisma.classroom.update({ where: { id }, data: { teacherId: nextTeacherId } });
    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: access.userId,
      action: "classroom_updated",
      entityType: "classroom",
      entityId: id,
      severity: "info",
      metadata: {
        mode: nextTeacherId ? "teacher_assigned" : "teacher_removed",
        fromTeacherId: classroom.teacherId,
        toTeacherId: nextTeacherId,
      },
    });
    return NextResponse.json({ ok: true, teacherId: nextTeacherId });
  }

  if (body.action === "assignStudents") {
    const ids = [...new Set(body.schoolStudentIds ?? [])];
    if (ids.length === 0) return NextResponse.json({ error: "schoolStudentIds is required" }, { status: 400 });
    const students = await prisma.schoolStudent.findMany({
      where: { id: { in: ids }, schoolId: body.schoolId, status: "active" },
    });
    if (students.length !== ids.length) {
      return NextResponse.json({ error: "One or more students were not found in this school." }, { status: 400 });
    }
    const alreadyHere = students.filter((s) => s.classroomId === id);
    if (alreadyHere.length > 0) {
      return NextResponse.json({ error: "One or more students are already assigned to this class." }, { status: 409 });
    }
    await prisma.schoolStudent.updateMany({
      where: { id: { in: ids }, schoolId: body.schoolId },
      data: { classroomId: id },
    });
    for (const student of students) {
      await writeSchoolAuditLog({
        schoolId: body.schoolId,
        actorUserId: access.userId,
        action: student.classroomId ? "student_transferred" : "student_enrolled",
        entityType: "student",
        entityId: student.id,
        severity: "info",
        metadata: {
          mode: "class_student_assigned",
          fromClassroomId: student.classroomId,
          toClassroomId: id,
        },
      });
    }
    return NextResponse.json({ ok: true, assigned: ids.length });
  }

  if (body.action === "removeStudent") {
    if (!body.schoolStudentId) return NextResponse.json({ error: "schoolStudentId is required" }, { status: 400 });
    const student = await prisma.schoolStudent.findFirst({
      where: { id: body.schoolStudentId, schoolId: body.schoolId, classroomId: id },
    });
    if (!student) return NextResponse.json({ error: "Student is not in this class." }, { status: 404 });
    await prisma.schoolStudent.update({
      where: { id: student.id },
      data: { classroomId: null },
    });
    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: access.userId,
      action: "student_transferred",
      entityType: "student",
      entityId: student.id,
      severity: "info",
      metadata: { mode: "class_student_removed", fromClassroomId: id, toClassroomId: null },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "moveStudent") {
    if (!body.schoolStudentId || !body.targetClassroomId) {
      return NextResponse.json({ error: "schoolStudentId and targetClassroomId are required" }, { status: 400 });
    }
    if (body.targetClassroomId === id) {
      return NextResponse.json({ error: "Student is already in this class." }, { status: 409 });
    }
    const [student, target] = await Promise.all([
      prisma.schoolStudent.findFirst({ where: { id: body.schoolStudentId, schoolId: body.schoolId, classroomId: id } }),
      prisma.classroom.findFirst({ where: { id: body.targetClassroomId, schoolId: body.schoolId } }),
    ]);
    if (!student) return NextResponse.json({ error: "Student is not in this class." }, { status: 404 });
    if (!target) return NextResponse.json({ error: "Target class not found in this school." }, { status: 404 });
    await prisma.schoolStudent.update({
      where: { id: student.id },
      data: { classroomId: target.id },
    });
    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: access.userId,
      action: "student_transferred",
      entityType: "student",
      entityId: student.id,
      severity: "info",
      metadata: { mode: "class_student_moved", fromClassroomId: id, toClassroomId: target.id },
    });
    return NextResponse.json({ ok: true, targetClassroomId: target.id });
  }

  // update fields
  const data: { name?: string; yearGroup?: string | null; academicYear?: string | null; teacherId?: string | null } = {};
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.yearGroup !== undefined) data.yearGroup = body.yearGroup?.trim() || null;
  if (body.academicYear !== undefined) data.academicYear = body.academicYear?.trim() || null;
  if (body.teacherId !== undefined) {
    if (body.teacherId) {
      const teacher = await prisma.schoolTeacher.findUnique({ where: { id: body.teacherId } });
      if (!teacher || !isAssignableClassroomTeacher(teacher, body.schoolId)) {
        return NextResponse.json({ error: "Teacher must be an active teaching staff member of this school." }, { status: 400 });
      }
    }
    data.teacherId = body.teacherId;
  }

  try {
    await prisma.classroom.update({ where: { id }, data });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "";
    if (code === "P2002") {
      return NextResponse.json({ error: "A class with this name already exists for that academic year." }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to update class." }, { status: 500 });
  }

  await writeSchoolAuditLog({
    schoolId: body.schoolId,
    actorUserId: access.userId,
    action: "classroom_updated",
    entityType: "classroom",
    entityId: id,
    severity: "info",
    metadata: { mode: "fields_updated", changes: data },
  });

  return NextResponse.json({ ok: true });
}
