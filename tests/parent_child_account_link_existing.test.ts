import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ChildLoginLinkConflictError,
  linkExistingChildLoginAccount,
} from "../src/lib/child-account-create";
import { buildChildSyntheticEmail } from "../src/lib/child-account-credentials";
import { findUserForLoginIdentifier } from "../src/lib/login-identity";
import { hashPassword, verifyPassword } from "../src/lib/auth";
import { resolveActiveChildForSession } from "../src/lib/activeChild";

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

test("existing-child account route is parent-owned and childId scoped", () => {
  const route = read("src/app/api/parent/children/[childId]/account/route.ts");
  assert.match(route, /requireSession/);
  assert.match(route, /session\.role !== "parent"/);
  assert.match(route, /resolveParentScope/);
  assert.match(route, /linkExistingChildLoginAccount/);
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
});

test("linkExistingChildLoginAccount generated mode links existing ChildProfile id", async () => {
  const originalChildId = "existing-child-1";
  let linkedChildId: string | null = null;
  let createdUsers = 0;

  const result = await linkExistingChildLoginAccount(
    {
      parentId: "parent-1",
      childId: originalChildId,
      mode: "generated",
    },
    {
      findOwnedChild: async ({ parentId, childId }) => {
        assert.equal(parentId, "parent-1");
        assert.equal(childId, originalChildId);
        return {
          id: originalChildId,
          name: "Alex Existing",
          yearGroup: "Year 3",
          userId: null,
          hasSchoolLink: false,
        };
      },
      usernameTaken: async () => false,
      hashPassword: async (password) => `hashed:${password}`,
      generatePassword: () => "GeneratedPass1",
      linkInTransaction: async (input) => {
        createdUsers += 1;
        linkedChildId = input.childId;
        assert.equal(input.childId, originalChildId);
        assert.equal(input.parentId, "parent-1");
        assert.equal(input.username, "alex.existing");
        assert.equal(input.email, buildChildSyntheticEmail("alex.existing"));
        assert.equal(input.passwordHash, "hashed:GeneratedPass1");
        assert.equal((input as { password?: string }).password, undefined);
        return { userId: "student-new-1", childId: input.childId };
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.child.id, originalChildId);
  assert.equal(linkedChildId, originalChildId);
  assert.equal(result.child.userId, "student-new-1");
  assert.equal(result.credentials.username, "alex.existing");
  assert.equal(result.credentials.password, "GeneratedPass1");
  assert.equal(createdUsers, 1);
});

test("linkExistingChildLoginAccount manual mode succeeds", async () => {
  const result = await linkExistingChildLoginAccount(
    {
      parentId: "parent-1",
      childId: "child-manual",
      mode: "manual",
      username: "manual.kid",
      password: "ManualPass99",
    },
    {
      findOwnedChild: async () => ({
        id: "child-manual",
        name: "Manual Kid",
        yearGroup: "Year 4",
        userId: null,
        hasSchoolLink: false,
      }),
      usernameTaken: async () => false,
      hashPassword: async () => "hash-manual",
      linkInTransaction: async (input) => {
        assert.equal(input.username, "manual.kid");
        assert.equal(input.email, "manual.kid@child.starliz.local");
        assert.equal(input.passwordHash, "hash-manual");
        assert.equal(input.childId, "child-manual");
        return { userId: "student-manual", childId: input.childId };
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.child.id, "child-manual");
  assert.equal(result.child.userId, "student-manual");
  assert.equal(result.credentials.username, "manual.kid");
  assert.equal(result.credentials.password, "ManualPass99");
});

test("already-linked child returns child_login_exists without creating User", async () => {
  let linkCalled = false;
  const result = await linkExistingChildLoginAccount(
    {
      parentId: "parent-1",
      childId: "linked-child",
      mode: "generated",
    },
    {
      findOwnedChild: async () => ({
        id: "linked-child",
        name: "Already Linked",
        yearGroup: "Year 2",
        userId: "existing-student",
        hasSchoolLink: false,
      }),
      linkInTransaction: async () => {
        linkCalled = true;
        throw new Error("should not link");
      },
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 409);
  assert.equal(result.code, "child_login_exists");
  assert.equal(linkCalled, false);
});

test("another parent's child is not found (ownership enforced)", async () => {
  const result = await linkExistingChildLoginAccount(
    {
      parentId: "parent-attacker",
      childId: "victim-child",
      mode: "generated",
    },
    {
      findOwnedChild: async ({ parentId, childId }) => {
        assert.equal(parentId, "parent-attacker");
        assert.equal(childId, "victim-child");
        return null;
      },
      linkInTransaction: async () => {
        throw new Error("should not link");
      },
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 404);
  assert.equal(result.code, "child_not_found");
});

test("school-managed child is refused", async () => {
  let linkCalled = false;
  const result = await linkExistingChildLoginAccount(
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
        userId: null,
        hasSchoolLink: true,
      }),
      linkInTransaction: async () => {
        linkCalled = true;
        throw new Error("should not link");
      },
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 403);
  assert.equal(result.code, "school_managed_child");
  assert.equal(linkCalled, false);
});

test("duplicate username is rejected safely before link", async () => {
  const result = await linkExistingChildLoginAccount(
    {
      parentId: "parent-1",
      childId: "child-dup",
      mode: "manual",
      username: "taken.user",
      password: "ValidPass1",
    },
    {
      findOwnedChild: async () => ({
        id: "child-dup",
        name: "Dup",
        yearGroup: "Year 1",
        userId: null,
        hasSchoolLink: false,
      }),
      usernameTaken: async (username) => username === "taken.user",
      linkInTransaction: async () => {
        throw new Error("should not link");
      },
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 409);
  assert.equal(result.code, "username_taken");
});

test("plaintext password is not passed into link transaction", async () => {
  const result = await linkExistingChildLoginAccount(
    {
      parentId: "parent-1",
      childId: "child-plain",
      mode: "generated",
    },
    {
      findOwnedChild: async () => ({
        id: "child-plain",
        name: "Plain",
        yearGroup: "Year 3",
        userId: null,
        hasSchoolLink: false,
      }),
      usernameTaken: async () => false,
      hashPassword: async (password) => `hashed:${password}`,
      generatePassword: () => "OnceOnlyLink1",
      linkInTransaction: async (input) => {
        assert.equal(Object.prototype.hasOwnProperty.call(input, "password"), false);
        assert.equal(input.passwordHash, "hashed:OnceOnlyLink1");
        return { userId: "student-plain", childId: input.childId };
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.credentials.password, "OnceOnlyLink1");
});

test("transaction failure leaves no successful link credentials", async () => {
  const result = await linkExistingChildLoginAccount(
    {
      parentId: "parent-1",
      childId: "child-fail",
      mode: "generated",
    },
    {
      findOwnedChild: async () => ({
        id: "child-fail",
        name: "Fail Kid",
        yearGroup: "Year 3",
        userId: null,
        hasSchoolLink: false,
      }),
      usernameTaken: async () => false,
      hashPassword: async () => "hash",
      generatePassword: () => "FailPass12",
      linkInTransaction: async () => {
        throw new Error("Unique constraint failed on username");
      },
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 409);
  assert.equal(result.code, "username_taken");
});

test("concurrent/double submit loser returns child_login_exists (no replace)", async () => {
  let attempts = 0;
  const results = await Promise.all([
    linkExistingChildLoginAccount(
      {
        parentId: "parent-1",
        childId: "race-child",
        mode: "generated",
      },
      {
        findOwnedChild: async () => ({
          id: "race-child",
          name: "Race Kid",
          yearGroup: "Year 3",
          userId: null,
          hasSchoolLink: false,
        }),
        usernameTaken: async () => false,
        hashPassword: async () => "hash-a",
        generatePassword: () => "RacePassAAA",
        linkInTransaction: async (input) => {
          attempts += 1;
          if (attempts === 1) {
            return { userId: "student-winner", childId: input.childId };
          }
          throw new ChildLoginLinkConflictError();
        },
      },
    ),
    linkExistingChildLoginAccount(
      {
        parentId: "parent-1",
        childId: "race-child",
        mode: "generated",
      },
      {
        findOwnedChild: async () => ({
          id: "race-child",
          name: "Race Kid",
          yearGroup: "Year 3",
          userId: null,
          hasSchoolLink: false,
        }),
        usernameTaken: async () => false,
        hashPassword: async () => "hash-b",
        generatePassword: () => "RacePassBBB",
        linkInTransaction: async (input) => {
          attempts += 1;
          if (attempts === 1) {
            return { userId: "student-winner", childId: input.childId };
          }
          throw new ChildLoginLinkConflictError();
        },
      },
    ),
  ]);

  const winners = results.filter((r) => r.ok);
  const losers = results.filter((r) => !r.ok);
  assert.equal(winners.length, 1);
  assert.equal(losers.length, 1);
  if (!winners[0]!.ok || losers[0]!.ok) return;
  assert.equal(winners[0].child.id, "race-child");
  assert.equal(winners[0].child.userId, "student-winner");
  assert.equal(losers[0].code, "child_login_exists");
});

test("default link transaction uses conditional userId null update", () => {
  const source = read("src/lib/child-account-create.ts");
  assert.match(source, /export async function linkExistingChildLoginAccount/);
  assert.match(source, /updateMany/);
  assert.match(source, /userId:\s*null/);
  assert.match(source, /ChildLoginLinkConflictError/);
  assert.match(source, /createStudentUserInTx/);
  assert.match(source, /schoolLinks/);
  // Identity link must update existing profile, not create a second one in the link path.
  const linkFnStart = source.indexOf("async function defaultLinkInTransaction");
  const linkFnEnd = source.indexOf("export async function linkExistingChildLoginAccount");
  assert.ok(linkFnStart >= 0 && linkFnEnd > linkFnStart);
  const linkBody = source.slice(linkFnStart, linkFnEnd);
  assert.doesNotMatch(linkBody, /childProfile\.create/);
  assert.match(linkBody, /childProfile\.updateMany/);
});

test("linked student credentials satisfy Slice 2 login and resolve exact ChildProfile", async () => {
  const password = "LinkedLogin1";
  const student = {
    id: "student-linked-existing",
    email: "linked.kid@child.starliz.local",
    username: "linked.kid",
    passwordHash: await hashPassword(password),
    name: "Linked",
    role: "student",
  };

  const found = await findUserForLoginIdentifier("linked.kid", {
    findByEmail: async () => null,
    findByUsername: async (username) => (username === "linked.kid" ? student : null),
  });
  assert.equal(found?.id, "student-linked-existing");
  assert.equal(await verifyPassword(password, student.passwordHash), true);

  const resolved = await resolveActiveChildForSession(
    { userId: "student-linked-existing", role: "student" },
    {
      readSelectionCookie: async () => "stale-other-child",
      findStudentOwnedProfile: async (userId) => {
        assert.equal(userId, "student-linked-existing");
        return { childId: "existing-child-1", parentId: "parent-1" };
      },
    },
  );
  assert.deepEqual(resolved, {
    ok: true,
    childId: "existing-child-1",
    parentId: "parent-1",
    source: "student_account",
  });
});

test("Parent UI offers Create Login and reuses one-time reveal", () => {
  const panel = read("src/components/parent/CreateChildLoginPanel.tsx");
  assert.match(panel, /\/api\/parent\/children\/\$\{encodeURIComponent\(childId\)\}\/account/);
  assert.match(panel, /Generate login/);
  assert.match(panel, /Manual login/);
  assert.doesNotMatch(panel, /@child\.starliz\.local/);

  const shell = read("src/components/parent/ParentPortalShell.tsx");
  assert.match(shell, /Create Login/);
  assert.match(shell, /Login created/);
  assert.match(shell, /CreateChildLoginPanel/);
  assert.match(shell, /ChildLoginCredentialsReveal/);
  assert.doesNotMatch(shell, /passwordHash/);

  const childrenRoute = read("src/app/api/children/route.ts");
  assert.match(childrenRoute, /loginUsername/);
  assert.match(childrenRoute, /canCreateLogin/);
  assert.match(childrenRoute, /hasSchoolLink/);
  assert.doesNotMatch(childrenRoute, /passwordHash/);
});

test("Parent PIN remains retired after Slice 6 Create Login", () => {
  const pinSet = read("src/app/api/pin/set/route.ts");
  const pinVerify = read("src/app/api/pin/verify/route.ts");
  const pinRetired = read("src/lib/parent-pin-retired.ts");
  assert.match(pinSet, /parent-pin-retired/);
  assert.match(pinVerify, /parent-pin-retired/);
  assert.match(pinRetired, /status:\s*410/);

  const portal = read("src/lib/schools/portal-routing.ts");
  assert.match(portal, /\/parent\/dashboard/);
  assert.doesNotMatch(portal, /parent-pin/);
});
