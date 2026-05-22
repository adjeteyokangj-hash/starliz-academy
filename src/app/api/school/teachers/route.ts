import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSchoolPermission } from "@/lib/schools/guards";
import { writeSchoolAuditLog } from "@/lib/schools/audit";

const statusFilterSchema = z.enum(["all", "active", "invited", "suspended", "archived"]);
const roleSchema = z.enum(["admin", "teacher", "support", "staff_observer", "finance"]);

const patchSchema = z
  .object({
    schoolId: z.string().min(1),
    teacherId: z.string().min(1),
    action: z.enum(["suspend", "reactivate", "changeRole"]),
    role: roleSchema.optional(),
  })
  .refine((value) => value.action !== "changeRole" || Boolean(value.role), {
    message: "role is required for changeRole action",
    path: ["role"],
  });

type TeacherRecord = Prisma.SchoolTeacherGetPayload<{
  include: {
    user: { select: { id: true; name: true; email: true } };
    classrooms: { select: { id: true; name: true } };
  };
}>;

function serializeTeacher(teacher: TeacherRecord, actorUserId: string) {
  return {
    id: teacher.id,
    schoolId: teacher.schoolId,
    userId: teacher.userId,
    role: teacher.role,
    status: teacher.status,
    title: teacher.title,
    invitedAt: teacher.invitedAt?.toISOString() ?? null,
    acceptedAt: teacher.acceptedAt?.toISOString() ?? null,
    lastActiveAt: teacher.lastActiveAt?.toISOString() ?? null,
    createdAt: teacher.createdAt.toISOString(),
    updatedAt: teacher.updatedAt.toISOString(),
    isCurrentActor: teacher.userId === actorUserId,
    user: teacher.user,
    classrooms: teacher.classrooms,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get("schoolId");

  if (!schoolId) {
    return NextResponse.json({ error: "schoolId is required" }, { status: 400 });
  }

  const statusFilterResult = statusFilterSchema.safeParse(searchParams.get("status") ?? "all");
  if (!statusFilterResult.success) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }

  const { context, response } = await requireSchoolPermission(schoolId, "manageTeachers", {
    method: "GET",
    route: "/api/school/teachers",
    resourceType: "teacher",
  });
  if (response) return response;

  const statusFilter = statusFilterResult.data;
  const teachers = await prisma.schoolTeacher.findMany({
    where: {
      schoolId,
      ...(statusFilter === "all" ? {} : { status: statusFilter }),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      classrooms: { select: { id: true, name: true } },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({
    teachers: teachers.map((teacher) => serializeTeacher(teacher, context.userId)),
  });
}

export async function PATCH(request: Request) {
  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { context, response } = await requireSchoolPermission(body.schoolId, "manageTeachers", {
    method: "PATCH",
    route: "/api/school/teachers",
    resourceType: "teacher",
    resourceId: body.teacherId,
  });
  if (response) return response;

  const teacher = await prisma.schoolTeacher.findUnique({
    where: { id: body.teacherId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      classrooms: { select: { id: true, name: true } },
    },
  });

  if (!teacher || teacher.schoolId !== body.schoolId) {
    return NextResponse.json({ error: "Teacher not found." }, { status: 404 });
  }

  if (teacher.role === "owner") {
    return NextResponse.json({ error: "Owner role cannot be modified from this endpoint." }, { status: 403 });
  }

  if (teacher.userId === context.userId) {
    return NextResponse.json({ error: "You cannot modify your own teacher account here." }, { status: 403 });
  }

  if (body.action === "changeRole") {
    if (!body.role) {
      return NextResponse.json({ error: "role is required" }, { status: 400 });
    }

    const updated = await prisma.schoolTeacher.update({
      where: { id: teacher.id },
      data: { role: body.role },
      include: {
        user: { select: { id: true, name: true, email: true } },
        classrooms: { select: { id: true, name: true } },
      },
    });

    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: context.userId,
      action: "school_status_changed",
      entityType: "teacher",
      entityId: teacher.id,
      metadata: {
        mode: "role_change",
        fromRole: teacher.role,
        toRole: body.role,
        teacherEmail: teacher.user.email,
      },
      severity: "info",
    });

    return NextResponse.json({ item: serializeTeacher(updated, context.userId) });
  }

  if (body.action === "suspend") {
    const updated = await prisma.schoolTeacher.update({
      where: { id: teacher.id },
      data: { status: "suspended" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        classrooms: { select: { id: true, name: true } },
      },
    });

    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: context.userId,
      action: "teacher_suspended",
      entityType: "teacher",
      entityId: teacher.id,
      metadata: {
        previousStatus: teacher.status,
        nextStatus: "suspended",
        teacherEmail: teacher.user.email,
      },
      severity: "warning",
    });

    return NextResponse.json({ item: serializeTeacher(updated, context.userId) });
  }

  const updated = await prisma.schoolTeacher.update({
    where: { id: teacher.id },
    data: {
      status: "active",
      ...(teacher.acceptedAt ? {} : { acceptedAt: new Date() }),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      classrooms: { select: { id: true, name: true } },
    },
  });

  await writeSchoolAuditLog({
    schoolId: body.schoolId,
    actorUserId: context.userId,
    action: "teacher_activated",
    entityType: "teacher",
    entityId: teacher.id,
    metadata: {
      previousStatus: teacher.status,
      nextStatus: "active",
      teacherEmail: teacher.user.email,
    },
    severity: "info",
  });

  return NextResponse.json({ item: serializeTeacher(updated, context.userId) });
}
