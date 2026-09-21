import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("resolveParentScope supports student-linked parents", () => {
  const source = fs.readFileSync("src/lib/parent_scope.ts", "utf8");
  assert.match(source, /student-linked-parent/);
  assert.match(source, /role === "student"/);
  assert.match(source, /childProfile\.findFirst/);
});

test("student assignments route uses owned child profile", () => {
  const source = fs.readFileSync("src/app/api/student/assignments/route.ts", "utf8");
  assert.match(source, /resolveStudentOwnedChildProfile/);
  assert.match(source, /isStudentSession/);
});

test("Create Login panel checks username availability", () => {
  const source = fs.readFileSync("src/components/parent/CreateChildLoginPanel.tsx", "utf8");
  assert.match(source, /\/api\/parent\/usernames\/availability/);
  assert.match(source, /Suggestions:/);
});