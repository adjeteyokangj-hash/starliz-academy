import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  allocateUniqueUsername,
  buildChildSyntheticEmail,
  deriveUsernameBaseFromChildName,
  generateChildPassword,
  validateChildAccountPassword,
  validateManualChildUsername,
} from "../src/lib/child-account-credentials";
import { createChildLoginAccount } from "../src/lib/child-account-create";
import { findUserForLoginIdentifier, normalizeLoginIdentifier } from "../src/lib/login-identity";
import { hashPassword, verifyPassword } from "../src/lib/auth";
import { resolveActiveChildForSession } from "../src/lib/activeChild";

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

test("parent children accounts route is parent-session gated", () => {
  const route = read("src/app/api/parent/children/accounts/route.ts");
  assert.match(route, /requireSession/);
  assert.match(route, /session\.role !== "parent"/);
  assert.match(route, /resolveParentScope/);
  assert.match(route, /createChildLoginAccount/);
  assert.doesNotMatch(route, /parentId:\s*body/);
  assert.match(route, /password: result\.credentials\.password/);
  assert.match(route, /writeAuditLog/);
  assert.match(route, /Audit without plaintext credentials/);
  const auditIdx = route.indexOf("void writeAuditLog");
  const responseIdx = route.indexOf("return NextResponse.json({\n    ok: true");
  assert.ok(auditIdx >= 0 && responseIdx > auditIdx);
  const auditSection = route.slice(auditIdx, responseIdx);
  assert.match(auditSection, /username:/);
  assert.doesNotMatch(auditSection, /password:/);
});

test("deriveUsernameBaseFromChildName normalizes to Slice 2 username rules", () => {
  const base = deriveUsernameBaseFromChildName("  Alex Kid! ");
  assert.equal(base, "alex.kid");
  assert.equal(normalizeLoginIdentifier(base)?.kind, "username");
  assert.ok(validateManualChildUsername(base).ok);
});

test("allocateUniqueUsername appends suffix on collision", async () => {
  const taken = new Set(["alex.kid", "alex.kid1"]);
  const username = await allocateUniqueUsername("Alex Kid", async (candidate) => taken.has(candidate));
  assert.equal(username, "alex.kid2");
});

test("generateChildPassword meets min length policy", () => {
  const password = generateChildPassword();
  assert.ok(password.length >= 8);
  assert.equal(validateChildAccountPassword(password).ok, true);
});

test("synthetic email uses child.starliz.local domain", () => {
  assert.equal(buildChildSyntheticEmail("alex.kid"), "alex.kid@child.starliz.local");
});

test("manual username validation rejects emails and invalid shapes", () => {
  assert.equal(validateManualChildUsername("kid@example.com").ok, false);
  assert.equal(validateManualChildUsername("ab").ok, false);
  assert.equal(validateManualChildUsername("Good_Kid-1").ok, true);
});

test("weak passwords are rejected with existing min-length policy", () => {
  assert.equal(validateChildAccountPassword("short").ok, false);
  assert.equal(validateChildAccountPassword("longenough").ok, true);
});

test("generated mode hashes credentials and does not persist plaintext password", async () => {
  const hashes: string[] = [];
  const persisted: Array<Record<string, unknown>> = [];

  const result = await createChildLoginAccount(
    {
      parentId: "parent-1",
      mode: "generated",
      profile: { name: "Mia Star", yearGroup: "Year 3", ageYears: 8 },
    },
    {
      canAddChild: async () => ({ allowed: true }),
      usernameTaken: async () => false,
      hashPassword: async (password) => {
        hashes.push(password);
        return `hashed:${password}`;
      },
      generatePassword: () => "OnceOnlyPass1",
      createInTransaction: async (input) => {
        persisted.push({ ...input });
        assert.equal(input.email, "mia.star@child.starliz.local");
        assert.equal(input.username, "mia.star");
        assert.equal(input.passwordHash, "hashed:OnceOnlyPass1");
        assert.equal(input.parentId, "parent-1");
        assert.equal((input as { password?: string }).password, undefined);
        return { userId: "student-user-1" };
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.credentials.password, "OnceOnlyPass1");
  assert.equal(result.credentials.username, "mia.star");
  assert.equal(result.child.userId, "student-user-1");
  assert.equal(hashes[0], "OnceOnlyPass1");
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0]!.passwordHash, "hashed:OnceOnlyPass1");
  assert.equal(Object.prototype.hasOwnProperty.call(persisted[0], "password"), false);
});

test("manual mode succeeds and uses authenticated parentId only", async () => {
  const result = await createChildLoginAccount(
    {
      parentId: "parent-scope-id",
      mode: "manual",
      profile: { name: "Noah", yearGroup: "Year 4", ageYears: 9 },
      username: "noah.learner",
      password: "ManualPass9",
    },
    {
      canAddChild: async () => ({ allowed: true }),
      usernameTaken: async () => false,
      hashPassword: async () => "hash-manual",
      createInTransaction: async (input) => {
        assert.equal(input.parentId, "parent-scope-id");
        assert.equal(input.username, "noah.learner");
        assert.equal(input.email, "noah.learner@child.starliz.local");
        assert.equal(input.passwordHash, "hash-manual");
        return { userId: "student-user-2" };
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.child.userId, "student-user-2");
  assert.equal(result.credentials.username, "noah.learner");
  assert.equal(result.credentials.password, "ManualPass9");
});

test("duplicate username is rejected safely", async () => {
  const result = await createChildLoginAccount(
    {
      parentId: "parent-1",
      mode: "manual",
      profile: { name: "Dup", yearGroup: "Year 2", ageYears: 7 },
      username: "taken.user",
      password: "ValidPass1",
    },
    {
      canAddChild: async () => ({ allowed: true }),
      usernameTaken: async (username) => username === "taken.user",
      createInTransaction: async () => {
        throw new Error("should not create");
      },
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 409);
  assert.match(result.error, /already taken/i);
});

test("invalid username and weak password are rejected before persistence", async () => {
  const invalidUser = await createChildLoginAccount(
    {
      parentId: "parent-1",
      mode: "manual",
      profile: { name: "X", yearGroup: "Year 1", ageYears: 5 },
      username: "no",
      password: "ValidPass1",
    },
    {
      canAddChild: async () => ({ allowed: true }),
      createInTransaction: async () => {
        throw new Error("should not create");
      },
    },
  );
  assert.equal(invalidUser.ok, false);

  const weakPass = await createChildLoginAccount(
    {
      parentId: "parent-1",
      mode: "manual",
      profile: { name: "X", yearGroup: "Year 1", ageYears: 5 },
      username: "valid.kid",
      password: "short",
    },
    {
      canAddChild: async () => ({ allowed: true }),
      usernameTaken: async () => false,
      createInTransaction: async () => {
        throw new Error("should not create");
      },
    },
  );
  assert.equal(weakPass.ok, false);
});

test("transaction failure does not return credentials", async () => {
  const result = await createChildLoginAccount(
    {
      parentId: "parent-1",
      mode: "generated",
      profile: { name: "Rollback Kid", yearGroup: "Year 3", ageYears: 8 },
    },
    {
      canAddChild: async () => ({ allowed: true }),
      usernameTaken: async () => false,
      hashPassword: async () => "hash",
      generatePassword: () => "RollbackPass1",
      createInTransaction: async () => {
        throw new Error("Unique constraint failed on username");
      },
    },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 409);
});

test("created student authenticates via username and profile resolves by userId", async () => {
  const password = "StudentLogin1";
  const student = {
    id: "student-linked",
    email: "slice3.kid@child.starliz.local",
    username: "slice3.kid",
    passwordHash: await hashPassword(password),
    name: "Slice3",
    role: "student",
  };

  const found = await findUserForLoginIdentifier("slice3.kid", {
    findByEmail: async () => null,
    findByUsername: async (username) => (username === "slice3.kid" ? student : null),
  });
  assert.equal(found?.id, "student-linked");
  assert.equal(await verifyPassword(password, student.passwordHash), true);

  const resolved = await resolveActiveChildForSession(
    { userId: "student-linked", role: "student" },
    {
      readSelectionCookie: async () => "other-child",
      findStudentOwnedProfile: async (userId) => {
        assert.equal(userId, "student-linked");
        return { childId: "child-new", parentId: "parent-1" };
      },
    },
  );
  assert.deepEqual(resolved, {
    ok: true,
    childId: "child-new",
    parentId: "parent-1",
    source: "student_account",
  });
});

test("parent UI posts to accounts API and reveals one-time credentials", () => {
  const form = read("src/components/parent/ChildManagementForm.tsx");
  assert.match(form, /\/api\/parent\/children\/accounts/);
  assert.match(form, /Generate login/);
  assert.match(form, /Manual login/);
  assert.doesNotMatch(form, /@child\.starliz\.local/);

  const shell = read("src/components/parent/ParentPortalShell.tsx");
  assert.match(shell, /ChildLoginCredentialsReveal/);
  assert.match(shell, /cannot be shown again/);

  const reveal = read("src/components/parent/ChildLoginCredentialsReveal.tsx");
  assert.match(reveal, /not stored in plain text/);
  assert.match(reveal, /Copy/);
});
