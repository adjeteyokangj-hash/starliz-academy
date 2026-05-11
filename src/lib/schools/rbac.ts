/**
 * School RBAC — centralised permission guards for all school-scoped routes.
 *
 * Role hierarchy (highest → lowest):
 *   owner > admin > finance > teacher > support > staff_observer
 *
 * Usage:
 *   const { teacher, response } = await requireSchoolRole(userId, schoolId, ["owner","admin"]);
 *   if (response) return response;
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readSessionFromCookie } from "@/lib/auth";
import { canDo, type SchoolRole } from "@/lib/schools/permissions";

/**
 * Ordered from most privileged to least. Used for minimum-role checks.
 */
const ROLE_RANK: Record<SchoolRole, number> = {
  owner: 100,
  admin: 80,
  finance: 60,
  teacher: 40,
  support: 30,
  staff_observer: 10,
};

export function roleRank(role: SchoolRole): number {
  return ROLE_RANK[role] ?? 0;
}

/** Returns true if `actual` role has at least the rank of `minimum`. */
export function hasMinimumRole(actual: SchoolRole, minimum: SchoolRole): boolean {
  return roleRank(actual) >= roleRank(minimum);
}

export type SchoolTeacherContext = {
  schoolTeacherId: string;
  schoolId: string;
  schoolName: string;
  role: SchoolRole;
  status: string;
  userId: string;
};

/**
 * Resolves the active school teacher context for a given userId.
 * Returns null if the user has no active school membership.
 */
export async function getSchoolTeacherContext(
  userId: string
): Promise<SchoolTeacherContext | null> {
  const link = await prisma.schoolTeacher.findFirst({
    where: {
      userId,
      status: "active",
    },
    include: {
      school: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!link) return null;

  return {
    schoolTeacherId: link.id,
    schoolId: link.schoolId,
    schoolName: link.school.name,
    role: link.role as SchoolRole,
    status: link.status,
    userId,
  };
}

/**
 * API guard: reads session, verifies school membership, checks minimum role.
 *
 * @param schoolId - the school being accessed (from route params or body)
 * @param minRole  - minimum role required (default: "staff_observer")
 *
 * Returns { context, response: null } on success, or { context: null, response } on failure.
 */
export async function requireSchoolRole(
  schoolId: string,
  minRole: SchoolRole = "staff_observer"
): Promise<
  | { context: SchoolTeacherContext; response: null }
  | { context: null; response: NextResponse }
> {
  const session = await readSessionFromCookie();
  if (!session) {
    return {
      context: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const link = await prisma.schoolTeacher.findUnique({
    where: {
      schoolId_userId: { schoolId, userId: session.userId },
    },
    include: { school: { select: { id: true, name: true } } },
  });

  if (!link || link.status !== "active") {
    return {
      context: null,
      response: NextResponse.json({ error: "Forbidden: not a member of this school" }, { status: 403 }),
    };
  }

  const actual = link.role as SchoolRole;
  if (!hasMinimumRole(actual, minRole)) {
    return {
      context: null,
      response: NextResponse.json(
        { error: `Forbidden: requires ${minRole} or higher` },
        { status: 403 }
      ),
    };
  }

  return {
    context: {
      schoolTeacherId: link.id,
      schoolId: link.schoolId,
      schoolName: link.school.name,
      role: actual,
      status: link.status,
      userId: session.userId,
    },
    response: null,
  };
}

export { canDo };
