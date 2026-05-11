import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readSessionFromCookie } from "@/lib/auth";
import { hasMinimumRole } from "./rbac";
import { type SchoolRole } from "./permissions";
import { writeSchoolAccessLog } from "./audit";

export type SchoolAccessContext = {
  schoolId: string;
  schoolName: string;
  role: SchoolRole;
  userId: string;
  schoolTeacherId: string;
};

type GuardResult =
  | { context: SchoolAccessContext; response: null }
  | { context: null; response: NextResponse };

type RequireSchoolAccessInput = {
  schoolId: string;
  minRole?: SchoolRole;
  method?: string;
  route?: string;
  resourceType?: string;
  resourceId?: string;
};

function deny(status: number, error: string): GuardResult {
  return {
    context: null,
    response: NextResponse.json({ error }, { status }),
  };
}

/**
 * Primary reusable school guard.
 * Verifies session + school membership + role, and logs access attempts.
 */
export async function requireSchoolAccess(input: RequireSchoolAccessInput): Promise<GuardResult> {
  const method = input.method ?? "UNKNOWN";
  const route = input.route ?? "unknown";
  const minRole = input.minRole ?? "staff_observer";

  const session = await readSessionFromCookie();
  if (!session) {
    return deny(401, "Unauthorized");
  }

  const link = await prisma.schoolTeacher.findUnique({
    where: {
      schoolId_userId: { schoolId: input.schoolId, userId: session.userId },
    },
    include: { school: { select: { id: true, name: true } } },
  });

  if (!link || link.status !== "active") {
    if (link) {
      await writeSchoolAccessLog({
        schoolId: input.schoolId,
        userId: session.userId,
        schoolTeacherId: link.id,
        method,
        route,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        success: false,
        denialReason: "not_active_school_member",
      });
    }
    return deny(403, "Forbidden: not an active member of this school");
  }

  const role = link.role as SchoolRole;
  if (!hasMinimumRole(role, minRole)) {
    await writeSchoolAccessLog({
      schoolId: input.schoolId,
      userId: session.userId,
      schoolTeacherId: link.id,
      method,
      route,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      success: false,
      denialReason: `requires_${minRole}`,
    });
    return deny(403, `Forbidden: requires ${minRole} or higher`);
  }

  await writeSchoolAccessLog({
    schoolId: input.schoolId,
    userId: session.userId,
    schoolTeacherId: link.id,
    method,
    route,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    success: true,
  });

  return {
    context: {
      schoolId: link.schoolId,
      schoolName: link.school.name,
      role,
      userId: session.userId,
      schoolTeacherId: link.id,
    },
    response: null,
  };
}

export async function requireSchoolAdmin(
  schoolId: string,
  meta?: Omit<RequireSchoolAccessInput, "schoolId" | "minRole">
): Promise<GuardResult> {
  return requireSchoolAccess({
    schoolId,
    minRole: "admin",
    method: meta?.method,
    route: meta?.route,
    resourceType: meta?.resourceType,
    resourceId: meta?.resourceId,
  });
}

export async function requireTeacher(
  schoolId: string,
  meta?: Omit<RequireSchoolAccessInput, "schoolId" | "minRole">
): Promise<GuardResult> {
  return requireSchoolAccess({
    schoolId,
    minRole: "teacher",
    method: meta?.method,
    route: meta?.route,
    resourceType: meta?.resourceType,
    resourceId: meta?.resourceId,
  });
}

type ClassroomGuardInput = {
  schoolId: string;
  classroomId: string;
  method?: string;
  route?: string;
};

/**
 * Ensures classroom belongs to school and is accessible.
 * Teachers are limited to classrooms explicitly assigned to them.
 */
export async function requireClassroomAccess(
  input: ClassroomGuardInput
): Promise<
  | { context: SchoolAccessContext; classroom: { id: string; schoolId: string; teacherId: string | null; status: string }; response: null }
  | { context: null; classroom: null; response: NextResponse }
> {
  const access = await requireTeacher(input.schoolId, {
    method: input.method,
    route: input.route,
    resourceType: "classroom",
    resourceId: input.classroomId,
  });
  if (access.response) return { context: null, classroom: null, response: access.response };

  const classroom = await prisma.classroom.findUnique({
    where: { id: input.classroomId },
    select: { id: true, schoolId: true, teacherId: true, status: true },
  });

  if (!classroom || classroom.schoolId !== input.schoolId) {
    return {
      context: null,
      classroom: null,
      response: NextResponse.json({ error: "Classroom not found" }, { status: 404 }),
    };
  }

  if (access.context.role === "teacher" && classroom.teacherId !== access.context.schoolTeacherId) {
    await writeSchoolAccessLog({
      schoolId: input.schoolId,
      userId: access.context.userId,
      schoolTeacherId: access.context.schoolTeacherId,
      method: input.method ?? "UNKNOWN",
      route: input.route ?? "unknown",
      resourceType: "classroom",
      resourceId: input.classroomId,
      success: false,
      denialReason: "teacher_not_assigned_to_classroom",
    });

    return {
      context: null,
      classroom: null,
      response: NextResponse.json({ error: "Forbidden: classroom not assigned to teacher" }, { status: 403 }),
    };
  }

  return { context: access.context, classroom, response: null };
}
