import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { resetChildLoginCredentials } from "../src/lib/child-account-create";
import { buildChildSyntheticEmail } from "../src/lib/child-account-credentials";

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8").replace(/\r\n/g, "\n");
}

test("reset account route is parent-owned and childId scoped", () => {
  const route = read("src/app/api/parent/children/[childId]/account/reset/route.ts");
  assert.match(route, /requireSession/);
  assert.match(route, /session\.role !== "parent"/);
  assert.match(route, /resolveParentScope/);
  assert.match(route, /resetChildLoginCredentials/);
  assert.match(route, /parentId: parentScope\.parentId/);
  assert.match(route, /childId,/);
  assert.doesNotMatch(route, /parentId:\s*body/);
  assert.doesNotMatch(route, /userId:\s*body/);
  assert.match(route, /password: result\.credentials\.password/);
  assert.match(route, /writeAuditLog/);
  const auditIdx = route.indexOf("void writeAuditLog");
  const responseIdx = route.indexOf("return NextResponse.json({\n    ok: true");
  assert.ok(auditIdx >= 0 && responseIdx > auditIdx);
  const auditSection = route.slice(auditIdx, responseIdx);
  assert.match(auditSection, /username:/);
  assert.doesNotMatch(auditSection, /password:/);
  assert.match(auditSection, /child_login_reset/);
});

test("resetChildLoginCredentials generated mode keeps username and issues new password", async () => {
  let resetCalls = 0;

  const result = await resetChildLoginCredentials(
    {
      parentId: "parent-1",
      childId: "child-1",
      mode: "generated",
    },
    {
      findOwnedChild: async ({ parentId, childId }) => {
        assert.equal(parentId, "parent-1");
        assert.equal(childId, "child-1");
        return {
          id: "child-1",
          name: "Alex Existing",
          yearGroup: "Year 3",
          userId: "student-1",
          loginUsername: "alex.existing",
          studentRole: true,
          hasSchoolLink: false,
        };
      },
      usernameTaken: async () => false,
      hashPassword: async (password) => `hashed:${password}`,
      generatePassword: () => "FreshPass99",
      resetInTransaction: async (input) => {
        resetCalls += 1;
        assert.equal(input.childId, "child-1");
        assert.equal(input.userId, "student-1");
        assert.equal(input.username, "alex.existing");
        assert.equal(input.email, buildChildSyntheticEmail("alex.existing"));
        assert.equal(input.passwordHash, "hashed:FreshPass99");
        assert.equal((input as { password?: string }).password, undefined);
        return { userId: input.userId, childId: input.childId };
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.credentials.username, "alex.existing");
  assert.equal(result.credentials.password, "FreshPass99");
  assert.equal(result.credentials.mode, "generated");
  assert.equal(resetCalls, 1);
});

test("resetChildLoginCredentials manual mode can change username", async () => {
  const result = await resetChildLoginCredentials(
    {
      parentId: "parent-1",
      childId: "child-2",
      mode: "manual",
      username: "new.kid",
      password: "ManualPass99",
    },
    {
      findOwnedChild: async () => ({
        id: "child-2",
        name: "Manual Kid",
        yearGroup: "Year 4",
        userId: "student-2",
        loginUsername: "old.kid",
        studentRole: true,
        hasSchoolLink: false,
      }),
      usernameTaken: async () => false,
      hashPassword: async () => "hash-manual",
      resetInTransaction: async (input) => {
        assert.equal(input.username, "new.kid");
        assert.equal(input.email, buildChildSyntheticEmail("new.kid"));
        assert.equal(input.passwordHash, "hash-manual");
        return { userId: input.userId, childId: input.childId };
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.credentials.username, "new.kid");
  assert.equal(result.credentials.password, "ManualPass99");
});

test("resetChildLoginCredentials manual mode keeps username when omitted", async () => {
  const result = await resetChildLoginCredentials(
    {
      parentId: "parent-1",
      childId: "child-3",
      mode: "manual",
      password: "KeepUserPass1",
    },
    {
      findOwnedChild: async () => ({
        id: "child-3",
        name: "Keep User",
        yearGroup: "Year 2",
        userId: "student-3",
        loginUsername: "keep.user",
        studentRole: true,
        hasSchoolLink: false,
      }),
      usernameTaken: async () => true,
      hashPassword: async () => "hash-keep",
      resetInTransaction: async (input) => {
        assert.equal(input.username, "keep.user");
        return { userId: input.userId, childId: input.childId };
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.credentials.username, "keep.user");
  assert.equal(result.credentials.password, "KeepUserPass1");
});

test("resetChildLoginCredentials allows reset when child also has a school roster link", async () => {
  const result = await resetChildLoginCredentials(
    {
      parentId: "parent-1",
      childId: "school-child",
      mode: "generated",
    },
    {
      findOwnedChild: async () => ({
        id: "school-child",
        name: "School Kid",
        yearGroup: "Year 5",
        userId: "student-school",
        loginUsername: "school.kid",
        studentRole: true,
        hasSchoolLink: true,
      }),
      usernameTaken: async () => false,
      hashPassword: async (password) => `hashed:${password}`,
      generatePassword: () => "SchoolReset1",
      resetInTransaction: async (input) => {
        assert.equal(input.username, "school.kid");
        assert.equal(input.passwordHash, "hashed:SchoolReset1");
        return { userId: input.userId, childId: input.childId };
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.credentials.username, "school.kid");
  assert.equal(result.credentials.password, "SchoolReset1");
});

test("resetChildLoginCredentials requires an existing login", async () => {
  const result = await resetChildLoginCredentials(
    {
      parentId: "parent-1",
      childId: "no-login",
      mode: "generated",
    },
    {
      findOwnedChild: async () => ({
        id: "no-login",
        name: "No Login",
        yearGroup: "Year 1",
        userId: null,
        loginUsername: null,
        studentRole: false,
        hasSchoolLink: false,
      }),
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 409);
  assert.equal(result.code, "child_login_missing");
});

test("resetChildLoginCredentials returns 404 for unknown child", async () => {
  const result = await resetChildLoginCredentials(
    {
      parentId: "parent-1",
      childId: "missing",
      mode: "generated",
    },
    {
      findOwnedChild: async () => null,
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 404);
  assert.equal(result.code, "child_not_found");
});

test("resetChildLoginCredentials rejects taken username", async () => {
  const result = await resetChildLoginCredentials(
    {
      parentId: "parent-1",
      childId: "child-taken",
      mode: "manual",
      username: "taken.name",
      password: "ValidPass99",
    },
    {
      findOwnedChild: async () => ({
        id: "child-taken",
        name: "Taken Kid",
        yearGroup: "Year 3",
        userId: "student-taken",
        loginUsername: "old.name",
        studentRole: true,
        hasSchoolLink: false,
      }),
      usernameTaken: async () => true,
      hashPassword: async () => "hash",
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 409);
  assert.equal(result.code, "username_taken");
});

test("portal shell wires Reset Login for children with usernames", () => {
  const shell = read("src/components/parent/ParentPortalShell.tsx");
  assert.match(shell, /ResetChildLoginPanel/);
  assert.match(shell, /resetLoginChildId/);
  assert.match(shell, /Reset Login/);

  const panel = read("src/components/parent/ResetChildLoginPanel.tsx");
  assert.match(panel, /Generate new password/);
  assert.match(panel, /Reset Login/);
  assert.match(panel, /currentUsername/);
  assert.match(panel, /account\/reset/);
});

test("reset helper input never accepts role email or passwordHash", () => {
  const lib = read("src/lib/child-account-create.ts");
  assert.match(lib, /export async function resetChildLoginCredentials/);
  const inputType = lib.match(
    /export type ResetChildLoginInput = \{([\s\S]*?)\};/,
  )?.[1];
  assert.ok(inputType, "ResetChildLoginInput type missing");
  assert.match(inputType, /parentId:/);
  assert.match(inputType, /childId:/);
  assert.match(inputType, /password\?:/);
  assert.doesNotMatch(inputType, /\brole\b/);
  assert.doesNotMatch(inputType, /passwordHash/);
  assert.doesNotMatch(inputType, /\bemail\b/);
});
