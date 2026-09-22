import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8").replace(/\r\n/g, "\n");
}

test("children DELETE soft-archives and blocks school-managed profiles", () => {
  const route = read("src/app/api/children/[id]/route.ts");
  assert.match(route, /export async function DELETE/);
  assert.match(route, /mode === "hard"/);
  assert.match(route, /archived: true/);
  assert.match(route, /school_managed_child/);
  assert.match(route, /schoolLinks > 0 && !existing\.userId/);
  assert.match(route, /writeAuditLog/);
  assert.match(route, /child_removed/);
  assert.doesNotMatch(route.slice(route.indexOf("export async function DELETE")), /parentId:\s*body/);
});

test("parent portal wires Remove child confirm flow", () => {
  const shell = read("src/components/parent/ParentPortalShell.tsx");
  assert.match(shell, /Remove child/);
  assert.match(shell, /Confirm remove/);
  assert.match(shell, /removeChildFromAccount/);
  assert.match(shell, /method: "DELETE"/);
  assert.match(shell, /hasSchoolLink && !child\.hasLogin && !child\.userId/);
});
