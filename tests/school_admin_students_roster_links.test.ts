import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

test("platform admin school roster links name and Manage to ChildProfile detail", () => {
  const src = read("src/components/admin/schools/SchoolRosterPanels.tsx");
  assert.match(src, /function SchoolStudentsRegistry/);
  assert.match(src, /\/admin\/students\/\$\{encodeURIComponent\(student\.childId\)\}/);
  assert.match(src, /Manage/);
  assert.match(src, /focus-visible:outline/);
  assert.match(src, /Parent email/);
  assert.match(src, /Joined/);
});

test("school-admin students roster uses SchoolStudent.id for View/Edit and name link", () => {
  const src = read("src/components/school-admin/SchoolStudentsManagementClient.tsx");
  assert.match(src, /\/school-admin\/day-school\/students\/\$\{r\.id\}/);
  assert.match(src, /\/school-admin\/day-school\/students\/\$\{r\.id\}\/edit/);
  assert.match(src, /href=\{`\/school-admin\/day-school\/students\/\$\{r\.id\}`\}/);
});

test("school student API keys on SchoolStudent.id", () => {
  const api = read("src/app/api/school/students/[id]/route.ts");
  assert.match(api, /schoolStudent\.findFirst/);
  assert.match(api, /requireSchoolAdminContext|requireSession|schoolId/);
});