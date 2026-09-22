import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pickCredentialSuccessorForSchoolChild } from "../src/lib/child-account-create";

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8").replace(/\r\n/g, "\n");
}

test("children DELETE soft-archives school-managed profiles and blocks hard delete", () => {
  const route = read("src/app/api/children/[id]/route.ts");
  assert.match(route, /export async function DELETE/);
  assert.match(route, /mode === "hard"/);
  assert.match(route, /softArchiveChildProfileForParent/);
  assert.match(route, /school_linked_hard_delete/);
  assert.match(route, /writeAuditLog/);
  assert.match(route, /child_removed/);
  assert.doesNotMatch(route, /school_managed_child/);
  assert.doesNotMatch(route.slice(route.indexOf("export async function DELETE")), /parentId:\s*body/);
});

test("parent portal shows Remove child for school-managed profiles", () => {
  const shell = read("src/components/parent/ParentPortalShell.tsx");
  assert.match(shell, /Remove child/);
  assert.match(shell, /Confirm remove/);
  assert.match(shell, /removeChildFromAccount/);
  assert.match(shell, /method: "DELETE"/);
  assert.match(shell, /matching login child exists/);
  assert.doesNotMatch(shell, /School-managed students cannot be removed this way/);
  assert.doesNotMatch(
    shell,
    /!\(child\.hasSchoolLink && !child\.hasLogin && !child\.userId\)/,
  );
});

test("pickCredentialSuccessorForSchoolChild prefers exact then unambiguous nickname", () => {
  assert.equal(
    pickCredentialSuccessorForSchoolChild({
      schoolChild: { id: "school-lizzy", name: "Lizzy" },
      siblings: [
        { id: "login-lizzy", name: "Lizzy", userId: "u1", archived: false },
        { id: "login-ephi", name: "Ephraim Adjetey", userId: "u2", archived: false },
      ],
    }),
    "login-lizzy",
  );

  assert.equal(
    pickCredentialSuccessorForSchoolChild({
      schoolChild: { id: "school-ephi", name: "Ephi" },
      siblings: [
        { id: "login-ephi", name: "Ephraim Adjetey", userId: "u2", archived: false },
        { id: "login-lizzy", name: "Lizzy", userId: "u1", archived: false },
      ],
    }),
    "login-ephi",
  );

  assert.equal(
    pickCredentialSuccessorForSchoolChild({
      schoolChild: { id: "school-max", name: "Max" },
      siblings: [
        { id: "login-maxwell", name: "Maxwell", userId: "u1", archived: false },
        { id: "login-maxine", name: "Maxine", userId: "u2", archived: false },
      ],
    }),
    null,
  );
});
