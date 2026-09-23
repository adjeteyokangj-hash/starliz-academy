import { prisma } from "@/lib/db";

export const DAY_SCHOOL_DISABLED_CODE = "DAY_SCHOOL_DISABLED" as const;

export type DaySchoolAccessInput = {
  membershipStatus: string;
  classroomId: string | null;
  schoolDaySchoolEnabled: boolean;
  studentDaySchoolEnabled: boolean;
};

export type DaySchoolBlock = {
  status: 403;
  code: typeof DAY_SCHOOL_DISABLED_CODE;
  error: string;
};

/**
 * Day School is a separate entitlement from school membership.
 * Active membership plus a class is required, and both the school and the student must have Day School on.
 */
export function hasDaySchoolAccess(input: DaySchoolAccessInput): boolean {
  return input.membershipStatus === "active"
    && Boolean(input.classroomId)
    && input.schoolDaySchoolEnabled
    && input.studentDaySchoolEnabled;
}

export function daySchoolDisabledMessage(input: DaySchoolAccessInput): string {
  if (!input.studentDaySchoolEnabled) {
    return "Day School is turned off for this student. Short Learning is still available.";
  }
  return "Day School is turned off for this school. Short Learning is still available.";
}

/** Block only when a real class enrolment exists and Day School has been switched off. */
export function daySchoolAccessBlock(input: DaySchoolAccessInput | null): DaySchoolBlock | null {
  if (!input) return null;
  if (input.membershipStatus !== "active" || !input.classroomId) return null;
  if (hasDaySchoolAccess(input)) return null;
  return {
    status: 403,
    code: DAY_SCHOOL_DISABLED_CODE,
    error: daySchoolDisabledMessage(input),
  };
}

export function directDaySchoolRouteDecision(
  input: DaySchoolAccessInput | null,
): "allow" | "block" | "not_enrolled" {
  if (!input || input.membershipStatus !== "active" || !input.classroomId) return "not_enrolled";
  return hasDaySchoolAccess(input) ? "allow" : "block";
}

/** Short Learning keeps using active school membership. Day School flags do not remove it. */
export function shortLearningMembershipRemains(input: { membershipStatus: string }): boolean {
  return input.membershipStatus === "active";
}

export function studentDaySchoolPresentation(input: DaySchoolAccessInput) {
  const access = hasDaySchoolAccess(input);
  return {
    showDaySchoolCard: access,
    showRegistration: access,
    showEnterSchoolDay: access,
    showTimetable: access,
    showAttendanceCounters: access,
    allowDirectDaySchoolRoute: access,
    showShortLearning: shortLearningMembershipRemains(input),
  };
}

export function activeDaySchoolEnrolmentWhere(childId: string) {
  return {
    childId,
    status: "active" as const,
    classroomId: { not: null },
    daySchoolEnabled: true,
    school: { daySchoolEnabled: true },
  };
}

const membershipSelect = {
  id: true,
  schoolId: true,
  classroomId: true,
  status: true,
  daySchoolEnabled: true,
  classroom: { select: { name: true } },
  school: { select: { name: true, daySchoolEnabled: true } },
} as const;

export type DaySchoolEnrolment = {
  id: string;
  schoolId: string;
  classroomId: string;
  classroomName: string | null;
  schoolName: string;
};

export async function loadDaySchoolAccess(childId: string): Promise<{
  allowed: boolean;
  block: DaySchoolBlock | null;
  enrolment: DaySchoolEnrolment | null;
}> {
  const row = await prisma.schoolStudent.findFirst({
    where: { childId, status: "active", classroomId: { not: null } },
    orderBy: { joinedAt: "desc" },
    select: membershipSelect,
  });
  if (!row?.classroomId) {
    return { allowed: false, block: null, enrolment: null };
  }

  const input: DaySchoolAccessInput = {
    membershipStatus: row.status,
    classroomId: row.classroomId,
    schoolDaySchoolEnabled: row.school.daySchoolEnabled,
    studentDaySchoolEnabled: row.daySchoolEnabled,
  };
  const block = daySchoolAccessBlock(input);
  if (block) {
    return { allowed: false, block, enrolment: null };
  }

  return {
    allowed: true,
    block: null,
    enrolment: {
      id: row.id,
      schoolId: row.schoolId,
      classroomId: row.classroomId,
      classroomName: row.classroom?.name ?? null,
      schoolName: row.school.name,
    },
  };
}
