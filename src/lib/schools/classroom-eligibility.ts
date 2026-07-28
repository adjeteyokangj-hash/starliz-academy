/**
 * Day School classroom teacher eligibility for School Portal assignment.
 * Does not grant permissions — only filters who may be selected as classroom.teacherId.
 */
import type { SchoolRole } from "./permissions";

const TEACHING_ROLES: SchoolRole[] = ["owner", "admin", "teacher"];

export function isEligibleClassroomTeacherRole(role: string): boolean {
  return TEACHING_ROLES.includes(role as SchoolRole);
}

export function isAssignableClassroomTeacher(
  member: { status: string; role: string; schoolId: string },
  schoolId: string,
): boolean {
  return (
    member.schoolId === schoolId &&
    member.status === "active" &&
    isEligibleClassroomTeacherRole(member.role)
  );
}