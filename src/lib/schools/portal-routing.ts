import { prisma } from "@/lib/db";
import type { SchoolTeacherRole } from "@prisma/client";
import { getSchoolTeacherContext } from "@/lib/schools/rbac";

export const SCHOOL_ADMIN_HOME = "/school-admin";
export const TEACHER_HOME = "/teacher";
export const PORTAL_MODE_COOKIE = "starliz_portal_mode";

export type StaffLanding =
  | { kind: "platform_admin"; path: string }
  | { kind: "school_admin"; path: string; schoolId: string; schoolRole: SchoolTeacherRole }
  | { kind: "teacher"; path: string; schoolId: string; schoolRole: SchoolTeacherRole }
  | { kind: "parent"; path: string }
  | { kind: "student"; path: string };

const SCHOOL_ADMIN_ROLES: SchoolTeacherRole[] = ["owner", "admin"];

export function isSchoolAdminRole(role: SchoolTeacherRole | string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function isTeachingCapableRole(role: SchoolTeacherRole | string | null | undefined): boolean {
  return role === "teacher" || role === "support" || role === "owner" || role === "admin";
}

export type StaffMembership = {
  schoolId: string;
  role: SchoolTeacherRole;
};

/**
 * Pure landing resolver — no DB. Used by resolveStaffLanding and unit tests.
 */
export function resolveStaffLandingFromMembership(input: {
  userRole: string;
  portalMode?: string | null;
  membership: StaffMembership | null;
}): StaffLanding {
  if (input.userRole === "admin") {
    return { kind: "platform_admin", path: "/admin" };
  }
  if (input.userRole === "student") {
    return { kind: "student", path: "/student/dashboard" };
  }
  if (input.userRole === "parent") {
    return { kind: "parent", path: "/parent/profiles" };
  }

  const membership = input.membership;
  if (!membership) {
    if (input.userRole === "teacher") {
      return { kind: "teacher", path: TEACHER_HOME, schoolId: "", schoolRole: "teacher" };
    }
    return { kind: "parent", path: "/parent/profiles" };
  }

  const preferTeaching = input.portalMode === "teaching";
  if (isSchoolAdminRole(membership.role) && !preferTeaching) {
    return {
      kind: "school_admin",
      path: SCHOOL_ADMIN_HOME,
      schoolId: membership.schoolId,
      schoolRole: membership.role,
    };
  }

  return {
    kind: "teacher",
    path: TEACHER_HOME,
    schoolId: membership.schoolId,
    schoolRole: membership.role,
  };
}

/** Mirrors school-admin layout guard — pure role check without DB. */
export function passesSchoolAdminLayoutGuard(role: SchoolTeacherRole | string | null | undefined): boolean {
  return isSchoolAdminRole(role);
}

/**
 * Resolves post-login / default landing for a user.
 * Platform admin uses User.role === "admin".
 * School owner/admin use SchoolTeacher.role with User.role typically "teacher".
 */
export async function resolveStaffLanding(input: {
  userId: string;
  userRole: string;
  portalMode?: string | null;
}): Promise<StaffLanding> {
  const ctx = await getSchoolTeacherContext(input.userId);
  return resolveStaffLandingFromMembership({
    userRole: input.userRole,
    portalMode: input.portalMode,
    membership: ctx ? { schoolId: ctx.schoolId, role: ctx.role } : null,
  });
}

export async function requireSchoolAdminContext(userId: string) {
  const ctx = await getSchoolTeacherContext(userId);
  if (!ctx || !SCHOOL_ADMIN_ROLES.includes(ctx.role)) {
    return null;
  }
  return ctx;
}

export async function listActiveSchoolsForUser(userId: string) {
  return prisma.schoolTeacher.findMany({
    where: { userId, status: "active" },
    include: { school: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "desc" },
  });
}
