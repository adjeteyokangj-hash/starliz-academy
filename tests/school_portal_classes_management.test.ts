import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canDo } from "../src/lib/schools/permissions";
import {
  isAssignableClassroomTeacher,
  isEligibleClassroomTeacherRole,
} from "../src/lib/schools/classroom-eligibility";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

test("classes list page stays in school-admin and uses management client", () => {
  const page = read("src/app/school-admin/day-school/classes/page.tsx");
  assert.match(page, /SchoolClassesManagementClient/);
  assert.match(page, /manageClassrooms/);
  assert.doesNotMatch(page, /\/teacher\/classrooms/);
});

test("create/edit/detail routes exist under school-admin", () => {
  assert.match(read("src/app/school-admin/day-school/classes/new/page.tsx"), /SchoolClassFormClient/);
  assert.match(read("src/app/school-admin/day-school/classes/[classId]/page.tsx"), /SchoolClassDetailClient/);
  assert.match(read("src/app/school-admin/day-school/classes/[classId]/edit/page.tsx"), /SchoolClassFormClient/);
});

test("class clients never deep-link to teacher or admin portals", () => {
  for (const rel of [
    "src/components/school-admin/SchoolClassesManagementClient.tsx",
    "src/components/school-admin/SchoolClassFormClient.tsx",
    "src/components/school-admin/SchoolClassDetailClient.tsx",
  ]) {
    const src = read(rel);
    assert.doesNotMatch(src, /\/teacher\//);
    assert.doesNotMatch(src, /\/admin\//);
    assert.match(src, /\/school-admin\/day-school\//);
  }
});

test("school classroom APIs require manageClassrooms and school membership", () => {
  const list = read("src/app/api/school/classrooms/route.ts");
  const detail = read("src/app/api/school/classrooms/[id]/route.ts");
  assert.match(list, /manageClassrooms/);
  assert.match(list, /requireSchoolPermission/);
  assert.match(list, /classroom_created/);
  assert.match(detail, /assignTeacher/);
  assert.match(detail, /assignStudents/);
  assert.match(detail, /classroom_archived/);
  assert.match(detail, /classroom_reactivated/);
  assert.match(detail, /student_transferred/);
});

test("support is not eligible as day-school classroom teacher", () => {
  assert.equal(isEligibleClassroomTeacherRole("teacher"), true);
  assert.equal(isEligibleClassroomTeacherRole("owner"), true);
  assert.equal(isEligibleClassroomTeacherRole("admin"), true);
  assert.equal(isEligibleClassroomTeacherRole("support"), false);
  assert.equal(
    isAssignableClassroomTeacher({ schoolId: "s1", status: "active", role: "support" }, "s1"),
    false,
  );
  assert.equal(
    isAssignableClassroomTeacher({ schoolId: "s1", status: "suspended", role: "teacher" }, "s1"),
    false,
  );
});

test("owner and admin may manage classrooms; teacher may not", () => {
  assert.equal(canDo("owner", "manageClassrooms"), true);
  assert.equal(canDo("admin", "manageClassrooms"), true);
  assert.equal(canDo("teacher", "manageClassrooms"), false);
});

test("staff management page still present for regression", () => {
  assert.match(read("src/app/school-admin/day-school/teachers/page.tsx"), /SchoolStaffManagementClient/);
});