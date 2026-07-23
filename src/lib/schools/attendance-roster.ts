/**
 * Roster resolution for daytime attendance registers.
 *
 * Limitation: SchoolStudent has `joinedAt` / `leftAt` but not full enrolment date ranges
 * per classroom move. Active roster for a session date uses:
 * - status === "active"
 * - classroomId matches the period's class
 * - schoolId matches
 * - joinedAt <= end of session date
 * - leftAt is null OR leftAt > start of session date
 *
 * Historical attendance rows for students who later leave the class are NEVER deleted;
 * they are merged into the register view alongside the current active roster.
 */

import { startOfUtcDate } from "@/lib/schools/attendance-status";

export type EnrolmentRow = {
  id: string;
  schoolId: string;
  classroomId: string | null;
  status: string;
  joinedAt: Date;
  leftAt: Date | null;
  child: { id: string; name: string };
};

export function isActivelyEnrolledOnDate(
  student: Pick<EnrolmentRow, "status" | "joinedAt" | "leftAt">,
  sessionDate: Date,
): boolean {
  if (student.status !== "active") return false;
  const day = startOfUtcDate(sessionDate);
  const dayEnd = new Date(day.getTime() + 24 * 60 * 60 * 1000 - 1);
  if (student.joinedAt.getTime() > dayEnd.getTime()) return false;
  if (student.leftAt && student.leftAt.getTime() <= day.getTime()) return false;
  return true;
}

export function resolveActiveClassRoster(input: {
  schoolId: string;
  classroomId: string;
  sessionDate: Date;
  students: EnrolmentRow[];
}): EnrolmentRow[] {
  return input.students
    .filter((student) =>
      student.schoolId === input.schoolId
      && student.classroomId === input.classroomId
      && isActivelyEnrolledOnDate(student, input.sessionDate),
    )
    .sort((a, b) => a.child.name.localeCompare(b.child.name));
}
