/**
 * School-scoped data isolation helpers.
 *
 * All data access for school-facing queries must go through these helpers
 * to prevent cross-school data leakage.
 *
 * Convention:
 *   - Pass `schoolId` from `requireSchoolRole()` context — never from user input directly
 *   - Always include `where: { schoolId }` or join through school
 */

import { prisma } from "@/lib/db";
import type { SchoolRole } from "./permissions";
import { keyStageForYearGroup, normalizeExamBoard } from "@/lib/curriculum";

// ─── Pure helpers (no DB — testable in isolation) ─────────────────────────

/** Roles that have wide access (all classrooms/students in school). */
export const WIDE_ROLES: SchoolRole[] = ["owner", "admin", "finance", "support", "staff_observer"];

/** Returns true if the role can see all school data (not just their own classrooms). */
export function isWideRole(role: SchoolRole): boolean {
  return WIDE_ROLES.includes(role);
}

/**
 * Builds the Prisma `where` clause for student queries given resolved classroom IDs.
 * Pure function — no DB calls.
 */
export function buildStudentWhere(
  schoolId: string,
  options: {
    role: SchoolRole;
    classroomId?: string;
    allowedClassroomIds?: string[];
  }
) {
  const { role, classroomId, allowedClassroomIds } = options;
  return {
    schoolId,
    status: "active",
    ...(classroomId
      ? { classroomId }
      : !isWideRole(role) && allowedClassroomIds
      ? { classroomId: { in: allowedClassroomIds } }
      : {}),
  };
}

/**
 * Builds the Prisma `where` clause for classroom queries.
 * Pure function — no DB calls.
 */
export function buildClassroomWhere(
  schoolId: string,
  options: { role: SchoolRole; schoolTeacherId: string }
) {
  const { role, schoolTeacherId } = options;
  return {
    schoolId,
    status: "active",
    ...(isWideRole(role) ? {} : { teacherId: schoolTeacherId }),
  };
}

// ─── Classrooms ────────────────────────────────────────────────────────────

/**
 * Returns classrooms the teacher can access.
 * - owner/admin/finance/support/staff_observer: all classrooms in school
 * - teacher: only classrooms they are assigned to
 */
export async function getAccessibleClassrooms(
  schoolId: string,
  schoolTeacherId: string,
  role: SchoolRole
) {
  return prisma.classroom.findMany({
    where: {
      schoolId,
      status: "active",
      ...(isWideRole(role) ? {} : { teacherId: schoolTeacherId }),
    },
    include: {
      teacher: {
        include: { user: { select: { name: true, email: true } } },
      },
      _count: { select: { students: { where: { status: "active" } } } },
    },
    orderBy: { name: "asc" },
  });
}

// ─── Students ──────────────────────────────────────────────────────────────

/**
 * Returns students in the school, scoped by classroom if teacher role.
 */
export async function getAccessibleStudents(
  schoolId: string,
  schoolTeacherId: string,
  role: SchoolRole,
  classroomId?: string
) {
  // For teacher role: resolve their classroom IDs first
  let allowedClassroomIds: string[] | undefined;
  if (!isWideRole(role) && !classroomId) {
    const myClassrooms = await prisma.classroom.findMany({
      where: { schoolId, teacherId: schoolTeacherId, status: "active" },
      select: { id: true },
    });
    allowedClassroomIds = myClassrooms.map((c) => c.id);
  }

  return prisma.schoolStudent.findMany({
    where: {
      schoolId,
      status: "active",
      ...(classroomId
        ? { classroomId }
        : !isWideRole(role) && allowedClassroomIds
        ? { classroomId: { in: allowedClassroomIds } }
        : {}),
    },
    include: {
      child: {
        select: {
          id: true,
          name: true,
          avatar: true,
          yearGroup: true,
          xp: true,
          stars: true,
          level: true,
          streak: true,
        },
      },
      classroom: { select: { id: true, name: true } },
    },
    orderBy: { child: { name: "asc" } },
  });
}

// ─── Assignments ───────────────────────────────────────────────────────────

/**
 * Returns assignments for students in the teacher's accessible classrooms.
 */
export async function getSchoolAssignments(
  schoolId: string,
  schoolTeacherId: string,
  role: SchoolRole,
  filters: { query?: string; keyStage?: string; yearGroup?: string; examBoard?: string } = {}
) {
  const students = await getAccessibleStudents(schoolId, schoolTeacherId, role);
  const studentIds = students.map((s) => s.childId);

  if (studentIds.length === 0) return [];

  const assignments = await prisma.assignment.findMany({
    where: { studentId: { in: studentIds } },
    include: {
      student: { select: { id: true, name: true } },
      content: { select: { contentType: true, level: true, topic: true, metadataJson: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const query = filters.query?.trim().toLowerCase() ?? "";
  const yearGroupFilter = filters.yearGroup?.trim() ?? "";
  const keyStageFilter = filters.keyStage?.trim() ?? "";
  const examBoardFilter = normalizeExamBoard(filters.examBoard ?? null) ?? "";

  return assignments.filter((assignment) => {
    const studentYear = students.find((student) => student.childId === assignment.studentId)?.child.yearGroup ?? null;
    const keyStage = studentYear ? keyStageForYearGroup(studentYear) : "";
    const contentMeta = (() => {
      if (!assignment.content.metadataJson) return { examBoard: null as string | null };
      try {
        const parsed = JSON.parse(assignment.content.metadataJson) as Record<string, unknown>;
        return { examBoard: normalizeExamBoard(typeof parsed.examBoard === "string" ? parsed.examBoard : null) };
      } catch {
        return { examBoard: null as string | null };
      }
    })();
    const haystack = `${assignment.student.name} ${assignment.content.contentType} ${assignment.content.topic ?? ""}`.toLowerCase();
    return (
      (!query || haystack.includes(query))
      && (!yearGroupFilter || studentYear === yearGroupFilter)
      && (!keyStageFilter || keyStage === keyStageFilter)
      && (!examBoardFilter || contentMeta.examBoard === examBoardFilter)
    );
  });
}

// ─── Weak Areas ────────────────────────────────────────────────────────────

/**
 * Returns weak areas aggregated for students accessible to this teacher.
 */
export async function getSchoolWeakAreas(
  schoolId: string,
  schoolTeacherId: string,
  role: SchoolRole
) {
  const students = await getAccessibleStudents(schoolId, schoolTeacherId, role);
  const studentIds = students.map((s) => s.childId);

  if (studentIds.length === 0) return [];

  return prisma.weakArea.findMany({
    where: {
      studentId: { in: studentIds },
      status: "active",
    },
    include: {
      student: { select: { id: true, name: true } },
    },
    orderBy: [{ accuracy: "asc" }, { attemptsCount: "desc" }],
  });
}

// ─── Teachers ──────────────────────────────────────────────────────────────

/**
 * Returns teachers in the school. Always scoped to schoolId.
 */
export async function getSchoolTeachers(schoolId: string) {
  return prisma.schoolTeacher.findMany({
    where: { schoolId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      classrooms: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}
