import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createStudentUserInTx,
  resolveChildLoginCredentials,
  createChildLoginAccount,
} from "../src/lib/child-account-create";
import { buildChildSyntheticEmail } from "../src/lib/child-account-credentials";
import { findUserForLoginIdentifier } from "../src/lib/login-identity";
import { hashPassword, verifyPassword } from "../src/lib/auth";

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

test("signup route provisions student User inside the same transaction as parent+child", () => {
  const route = read("src/app/api/auth/signup/route.ts");
  assert.match(route, /resolveChildLoginCredentials/);
  assert.match(route, /createStudentUserInTx/);
  assert.match(route, /userId:\s*student\.userId/);
  assert.match(route, /role:\s*"parent"/);
  assert.match(route, /createSessionToken\([\s\S]*created\.id[\s\S]*created\.role/);
  assert.match(route, /childCredentials/);
  assert.doesNotMatch(route, /createSessionToken\([\s\S]*childUserId/);
  assert.match(route, /childUsername: childCredentials\?\.username/);
  const audit = route.slice(route.indexOf("await tx.auditLog.create"), route.indexOf("return user;"));
  assert.match(audit, /childUsername/);
  assert.doesNotMatch(audit, /password/);
});

test("signup UI reuses generated/manual child login and one-time reveal", () => {
  const page = read("src/app/signup/page.tsx");
  assert.match(page, /Generate child login/);
  assert.match(page, /Manual child login/);
  assert.match(page, /childLogin:/);
  assert.match(page, /ChildLoginCredentialsReveal/);
  assert.match(page, /pendingChildCredentials/);
  assert.doesNotMatch(page, /@child\.starliz\.local/);
});

test("generated signup credentials follow Slice 3 rules", async () => {
  const resolved = await resolveChildLoginCredentials(
    { mode: "generated", childName: "  Ava Rose! " },
    {
      usernameTaken: async () => false,
      hashPassword: async (password) => `hash:${password}`,
      generatePassword: () => "GenPassWord9",
    },
  );
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.username, "ava.rose");
  assert.equal(resolved.email, buildChildSyntheticEmail("ava.rose"));
  assert.equal(resolved.password, "GenPassWord9");
  assert.equal(resolved.passwordHash, "hash:GenPassWord9");
  assert.equal(resolved.mode, "generated");
});

test("manual signup credentials follow Slice 3 validation", async () => {
  const ok = await resolveChildLoginCredentials(
    {
      mode: "manual",
      childName: "Noah",
      username: "noah.learner",
      password: "ManualPass9",
    },
    {
      usernameTaken: async () => false,
      hashPassword: async () => "hash-manual",
    },
  );
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.username, "noah.learner");
  assert.equal(ok.email, "noah.learner@child.starliz.local");

  const dup = await resolveChildLoginCredentials(
    {
      mode: "manual",
      childName: "Noah",
      username: "taken.user",
      password: "ManualPass9",
    },
    { usernameTaken: async (u) => u === "taken.user" },
  );
  assert.equal(dup.ok, false);
  if (dup.ok) return;
  assert.equal(dup.status, 409);

  const weak = await resolveChildLoginCredentials(
    {
      mode: "manual",
      childName: "Noah",
      username: "valid.kid",
      password: "short",
    },
    { usernameTaken: async () => false },
  );
  assert.equal(weak.ok, false);
});

test("createStudentUserInTx creates role=student and never stores plaintext password field", async () => {
  const created: Array<Record<string, unknown>> = [];
  const tx = {
    user: {
      create: async (args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        assert.equal(args.data.role, "student");
        assert.equal(args.data.passwordHash, "hashed-only");
        assert.equal(Object.prototype.hasOwnProperty.call(args.data, "password"), false);
        return { id: "student-1" };
      },
    },
  };

  const result = await createStudentUserInTx(tx as never, {
    username: "slice4.kid",
    email: "slice4.kid@child.starliz.local",
    passwordHash: "hashed-only",
    name: "Slice4",
  });
  assert.equal(result.userId, "student-1");
  assert.equal(created.length, 1);
});

test("parent signup session must use parent User id/role, not child User", () => {
  const route = read("src/app/api/auth/signup/route.ts");
  assert.match(
    route,
    /Parent remains the authenticated session; child User is separate until explicit login/,
  );
  assert.match(route, /issueRefreshToken\(\{\s*userId: created\.id/);
  assert.match(route, /user: \{ id: created\.id, email: created\.email, name: created\.name, role: created\.role \}/);
});

test("generated child credentials satisfy Slice 2 username authentication logic", async () => {
  const password = "SignupChild1!";
  const resolved = await resolveChildLoginCredentials(
    { mode: "generated", childName: "Ben Kai" },
    {
      usernameTaken: async () => false,
      hashPassword: async (p) => hashPassword(p),
      generatePassword: () => password,
    },
  );
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;

  const student = {
    id: "student-signup",
    email: resolved.email,
    username: resolved.username,
    passwordHash: resolved.passwordHash,
    name: "Ben Kai",
    role: "student",
  };

  const found = await findUserForLoginIdentifier(resolved.username, {
    findByEmail: async () => null,
    findByUsername: async (username) => (username === resolved.username ? student : null),
  });
  assert.equal(found?.id, "student-signup");
  assert.equal(await verifyPassword(password, student.passwordHash), true);
  assert.equal(student.passwordHash.includes(password), false);
});

test("portal createChildLoginAccount still works through shared resolve helper", async () => {
  const result = await createChildLoginAccount(
    {
      parentId: "parent-1",
      mode: "generated",
      profile: { name: "Mia", yearGroup: "Year 3", ageYears: 8 },
    },
    {
      canAddChild: async () => ({ allowed: true }),
      usernameTaken: async () => false,
      hashPassword: async () => "h",
      generatePassword: () => "PortalPass12",
      createInTransaction: async (input) => {
        assert.equal(input.username, "mia");
        assert.equal(input.email, "mia@child.starliz.local");
        assert.equal(input.parentId, "parent-1");
        return { userId: "u1" };
      },
    },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.credentials.password, "PortalPass12");
  assert.equal(result.child.userId, "u1");
});

test("signup transaction failure path does not return credentials outside tx success", () => {
  const route = read("src/app/api/auth/signup/route.ts");
  // Credentials are only attached after successful transaction return.
  const txEnd = route.search(/return user;\r?\n\s*\}\);/);
  const credAssign = route.indexOf("responseBody.childCredentials");
  assert.ok(txEnd > 0 && credAssign > txEnd);
});

test("existing registration pathway consent and redirect coverage remain present", () => {
  const registration = read("tests/registration_pathway_signup.test.ts");
  assert.match(registration, /Consent is required before final submission/);
  assert.match(registration, /Legacy \/auth\/signup route redirects/);
  const legacy = read("src/app/auth/signup/page.tsx");
  assert.match(legacy, /redirect\("\/signup"\)/);
});
