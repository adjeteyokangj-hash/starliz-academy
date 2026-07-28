import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canDo } from "../src/lib/schools/permissions";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

test("students page uses management client and manageStudents", () => {
  const page = read("src/app/school-admin/day-school/students/page.tsx");
  assert.match(page, /SchoolStudentsManagementClient/);
  assert.match(page, /manageStudents/);
  assert.doesNotMatch(page, /\/admin\//);
  assert.doesNotMatch(page, /\/teacher\//);
});

test("student routes stay under school-admin", () => {
  assert.match(read("src/app/school-admin/day-school/students/new/page.tsx"), /SchoolStudentFormClient/);
  assert.match(read("src/app/school-admin/day-school/students/[studentId]/page.tsx"), /SchoolStudentDetailClient/);
  assert.match(read("src/app/school-admin/day-school/students/[studentId]/edit/page.tsx"), /SchoolStudentFormClient/);
  assert.match(read("src/app/school-admin/day-school/students/[studentId]/guardians/page.tsx"), /redirect/);
});

test("student clients never deep-link to admin or teacher portals", () => {
  for (const rel of [
    "src/components/school-admin/SchoolStudentsManagementClient.tsx",
    "src/components/school-admin/SchoolStudentFormClient.tsx",
    "src/components/school-admin/SchoolStudentDetailClient.tsx",
  ]) {
    const src = read(rel);
    assert.doesNotMatch(src, /\/teacher\//);
    assert.doesNotMatch(src, /\/admin\//);
    assert.match(src, /\/school-admin\/day-school\//);
  }
});

test("school students API requires manageStudents and reuses enrol + parent invite", () => {
  const list = read("src/app/api/school/students/route.ts");
  const detail = read("src/app/api/school/students/[id]/route.ts");
  assert.match(list, /manageStudents/);
  assert.match(list, /enrolSchoolStudent/);
  assert.match(list, /inviteType: "parent"/);
  assert.match(detail, /inviteGuardian/);
  assert.match(detail, /student_archived/);
  assert.match(detail, /setPrimaryGuardian/);
  assert.match(detail, /pending_consent/);
});

test("parent invite acceptance is supported", () => {
  const accept = read("src/app/api/school/invites/accept/route.ts");
  assert.match(accept, /inviteType === "parent"/);
  assert.match(accept, /redirectTo: "\/parent"/);
});

test("owner and admin may manage students; teacher may not", () => {
  assert.equal(canDo("owner", "manageStudents"), true);
  assert.equal(canDo("admin", "manageStudents"), true);
  assert.equal(canDo("teacher", "manageStudents"), false);
});

test("staff and classes management remain present", () => {
  assert.match(read("src/app/school-admin/day-school/teachers/page.tsx"), /SchoolStaffManagementClient/);
  assert.match(read("src/app/school-admin/day-school/classes/page.tsx"), /SchoolClassesManagementClient/);
});