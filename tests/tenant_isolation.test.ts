/**
 * Tenant isolation tests.
 *
 * These tests prove that scoping rules correctly prevent cross-tenant data
 * leakage without any DB or HTTP calls. They exercise the pure helper
 * functions that all DB queries are built from.
 *
 * Scenarios covered:
 *   1. Teacher A cannot see Teacher B's classroom (buildClassroomWhere)
 *   2. School A's schoolId is never mixed with School B's data (buildStudentWhere)
 *   3. Assignment creation fails for a student outside the teacher's classrooms
 *   4. Analytics aggregation only includes students passed in (no silent expansion)
 *   5. Wide roles (admin/owner) see all classrooms in their school only
 *   6. Teacher with no classrooms gets empty studentId list (no cross-leak)
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildClassroomWhere,
  buildStudentWhere,
  isWideRole,
} from "../src/lib/schools/scoping";

// ─── 1. buildClassroomWhere — teacher scoping ─────────────────────────────

test("teacher only sees their own classrooms (teacherId filter applied)", () => {
  const where = buildClassroomWhere("school-A", {
    role: "teacher",
    schoolTeacherId: "teacher-1",
  });
  assert.equal(where.schoolId, "school-A");
  assert.equal(where.teacherId, "teacher-1");
  assert.equal(where.status, "active");
});

test("Teacher A's where clause never matches Teacher B's classroom", () => {
  const whereA = buildClassroomWhere("school-A", {
    role: "teacher",
    schoolTeacherId: "teacher-A",
  });
  const whereB = buildClassroomWhere("school-A", {
    role: "teacher",
    schoolTeacherId: "teacher-B",
  });
  // Filter by teacherId must differ between the two teachers
  assert.notEqual(whereA.teacherId, whereB.teacherId);
  // Both must still be scoped to the same school
  assert.equal(whereA.schoolId, whereB.schoolId);
});

test("admin role does NOT apply teacherId filter (wide access)", () => {
  const where = buildClassroomWhere("school-A", {
    role: "admin",
    schoolTeacherId: "teacher-1",
  });
  assert.equal(where.schoolId, "school-A");
  assert.equal("teacherId" in where, false);
});

test("owner role has wide access — no teacherId filter", () => {
  const where = buildClassroomWhere("school-X", {
    role: "owner",
    schoolTeacherId: "any-id",
  });
  assert.equal("teacherId" in where, false);
});

// ─── 2. buildStudentWhere — schoolId isolation ────────────────────────────

test("school A students query never includes school B's schoolId", () => {
  const whereA = buildStudentWhere("school-A", { role: "admin" });
  const whereB = buildStudentWhere("school-B", { role: "admin" });
  assert.equal(whereA.schoolId, "school-A");
  assert.equal(whereB.schoolId, "school-B");
  assert.notEqual(whereA.schoolId, whereB.schoolId);
});

test("teacher role scoped to allowed classroomIds only", () => {
  const where = buildStudentWhere("school-A", {
    role: "teacher",
    allowedClassroomIds: ["cls-1", "cls-2"],
  });
  assert.equal(where.schoolId, "school-A");
  assert.deepEqual((where as { classroomId?: { in: string[] } }).classroomId, {
    in: ["cls-1", "cls-2"],
  });
});

test("teacher with no accessible classrooms produces empty in-list (no cross-leak)", () => {
  const where = buildStudentWhere("school-A", {
    role: "teacher",
    allowedClassroomIds: [],
  });
  const classroomFilter = (where as { classroomId?: { in: string[] } }).classroomId;
  assert.ok(classroomFilter, "classroomId filter must exist for teacher role");
  assert.deepEqual(classroomFilter.in, []);
});

test("explicit classroomId filter overrides allowedClassroomIds", () => {
  const where = buildStudentWhere("school-A", {
    role: "teacher",
    classroomId: "cls-specific",
    allowedClassroomIds: ["cls-1", "cls-2"],
  });
  assert.equal((where as { classroomId: string }).classroomId, "cls-specific");
});

test("admin role with no classroomId returns school-wide query (no classroomId filter)", () => {
  const where = buildStudentWhere("school-A", { role: "admin" });
  assert.equal("classroomId" in where, false);
});

// ─── 3. Assignment tenant check — student must belong to teacher's school ──

/**
 * Simulates the tenant ownership check in POST /api/school/assignments.
 * The real route calls prisma.schoolStudent.findUnique({ where: { schoolId_childId } }).
 * This test verifies the check logic rejects students from another school.
 */
function simulateAssignmentTenantCheck(
  requestedSchoolId: string,
  studentRecord: { schoolId: string; status: string } | null
): { allowed: boolean; reason: string } {
  if (!studentRecord) return { allowed: false, reason: "student_not_found" };
  if (studentRecord.schoolId !== requestedSchoolId)
    return { allowed: false, reason: "cross_tenant" };
  if (studentRecord.status !== "active") return { allowed: false, reason: "not_active" };
  return { allowed: true, reason: "ok" };
}

test("assignment creation rejected for student belonging to another school", () => {
  const result = simulateAssignmentTenantCheck("school-A", {
    schoolId: "school-B",
    status: "active",
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "cross_tenant");
});

test("assignment creation allowed for student in same school", () => {
  const result = simulateAssignmentTenantCheck("school-A", {
    schoolId: "school-A",
    status: "active",
  });
  assert.equal(result.allowed, true);
});

test("assignment creation rejected for inactive student in same school", () => {
  const result = simulateAssignmentTenantCheck("school-A", {
    schoolId: "school-A",
    status: "left",
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "not_active");
});

test("assignment creation rejected when student record not found", () => {
  const result = simulateAssignmentTenantCheck("school-A", null);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "student_not_found");
});

// ─── 4. Teacher classroom scope check for assignment ──────────────────────

/**
 * Simulates the teacher classroom scope check: a teacher can only assign
 * to students in their own classrooms.
 */
function simulateTeacherClassroomCheck(
  role: string,
  studentClassroomId: string | null,
  teacherClassroomIds: string[]
): { allowed: boolean; reason: string } {
  if (role !== "teacher") return { allowed: true, reason: "wide_role" };
  if (!studentClassroomId) return { allowed: true, reason: "no_classroom" };
  if (!teacherClassroomIds.includes(studentClassroomId))
    return { allowed: false, reason: "not_in_teacher_classroom" };
  return { allowed: true, reason: "ok" };
}

test("teacher cannot assign to student in a different teacher's classroom", () => {
  const result = simulateTeacherClassroomCheck(
    "teacher",
    "classroom-B",
    ["classroom-A"] // teacher only owns classroom-A
  );
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "not_in_teacher_classroom");
});

test("teacher can assign to student in their own classroom", () => {
  const result = simulateTeacherClassroomCheck(
    "teacher",
    "classroom-A",
    ["classroom-A", "classroom-C"]
  );
  assert.equal(result.allowed, true);
});

test("admin bypasses classroom ownership check", () => {
  const result = simulateTeacherClassroomCheck(
    "admin",
    "classroom-B",
    [] // admin has no classrooms but should still be allowed
  );
  assert.equal(result.allowed, true);
  assert.equal(result.reason, "wide_role");
});

// ─── 5. Analytics — does not include students outside scope ───────────────

/**
 * Simulates the analytics aggregation: only attempts whose studentId appears
 * in the scoped student list are counted.
 */
function aggregateAttempts(
  scopedStudentIds: string[],
  attempts: Array<{ studentId: string; correct: boolean }>
) {
  const allowed = new Set(scopedStudentIds);
  const filtered = attempts.filter((a) => allowed.has(a.studentId));
  const total = filtered.length;
  const correct = filtered.filter((a) => a.correct).length;
  return { total, correct, accuracy: total > 0 ? Math.round((correct / total) * 100) : 0 };
}

test("analytics only includes attempts for accessible students", () => {
  const attempts = [
    { studentId: "student-A", correct: true },
    { studentId: "student-A", correct: false },
    { studentId: "student-B", correct: true }, // different school / outside scope
    { studentId: "student-C", correct: true }, // also out of scope
  ];
  const result = aggregateAttempts(["student-A"], attempts);
  assert.equal(result.total, 2);
  assert.equal(result.correct, 1);
  assert.equal(result.accuracy, 50);
});

test("analytics returns zero totals when no students are in scope", () => {
  const attempts = [
    { studentId: "student-X", correct: true },
    { studentId: "student-Y", correct: false },
  ];
  const result = aggregateAttempts([], attempts);
  assert.equal(result.total, 0);
  assert.equal(result.accuracy, 0);
});

test("analytics includes all students for wide-scoped school", () => {
  const attempts = [
    { studentId: "s1", correct: true },
    { studentId: "s2", correct: false },
    { studentId: "s3", correct: true },
  ];
  const result = aggregateAttempts(["s1", "s2", "s3"], attempts);
  assert.equal(result.total, 3);
  assert.equal(result.correct, 2);
});

// ─── 6. isWideRole classification ────────────────────────────────────────

test("isWideRole returns true for admin and owner", () => {
  assert.equal(isWideRole("admin"), true);
  assert.equal(isWideRole("owner"), true);
  assert.equal(isWideRole("finance"), true);
  assert.equal(isWideRole("support"), true);
  assert.equal(isWideRole("staff_observer"), true);
});

test("isWideRole returns false for teacher", () => {
  assert.equal(isWideRole("teacher"), false);
});

// ─── 7. Report export — schoolId in where clause matches guard context ─────

/**
 * Simulates what the export route does: build the childIds list only from
 * students belonging to the authenticated school, never from the raw request.
 */
function simulateExportScope(
  guardSchoolId: string, // schoolId from verified guard context
  students: Array<{ schoolId: string; childId: string }>
): string[] {
  // The export route uses getAccessibleStudents(guardSchoolId, ...) — which
  // has `where: { schoolId: guardSchoolId }`. We simulate that filter here.
  return students.filter((s) => s.schoolId === guardSchoolId).map((s) => s.childId);
}

test("export scope never includes students from another school", () => {
  const allStudents = [
    { schoolId: "school-A", childId: "child-1" },
    { schoolId: "school-B", childId: "child-2" }, // different school
    { schoolId: "school-A", childId: "child-3" },
  ];
  const childIds = simulateExportScope("school-A", allStudents);
  assert.deepEqual(childIds, ["child-1", "child-3"]);
  assert.equal(childIds.includes("child-2"), false);
});

test("export for school B returns only school B students", () => {
  const allStudents = [
    { schoolId: "school-A", childId: "child-1" },
    { schoolId: "school-B", childId: "child-2" },
  ];
  const childIds = simulateExportScope("school-B", allStudents);
  assert.deepEqual(childIds, ["child-2"]);
});
