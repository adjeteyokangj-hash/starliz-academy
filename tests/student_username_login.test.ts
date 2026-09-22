import test from "node:test";
import assert from "node:assert/strict";

import {
  LOGIN_INVALID_CREDENTIALS_ERROR,
  findUserForLoginIdentifier,
  isNormalizedUsernameValid,
  normalizeLoginIdentifier,
} from "../src/lib/login-identity";
import { resolveStaffLandingFromMembership } from "../src/lib/schools/portal-routing";
import { verifyPassword, hashPassword } from "../src/lib/auth";

test("normalizeLoginIdentifier treats values with @ as emails", () => {
  assert.deepEqual(normalizeLoginIdentifier("Parent@Example.COM"), {
    kind: "email",
    value: "parent@example.com",
  });
});

test("normalizeLoginIdentifier treats non-email values as usernames", () => {
  assert.deepEqual(normalizeLoginIdentifier("  Alex.Kid_1 "), {
    kind: "username",
    value: "alex.kid_1",
  });
  assert.equal(normalizeLoginIdentifier(""), null);
  assert.equal(normalizeLoginIdentifier("   "), null);
});

test("username pattern rejects empty and invalid shapes without treating them as emails", () => {
  assert.equal(isNormalizedUsernameValid("ab"), false);
  assert.equal(isNormalizedUsernameValid("alex kid"), false);
  assert.equal(isNormalizedUsernameValid("alex.kid_1"), true);
});

test("findUserForLoginIdentifier looks up email and username separately", async () => {
  const calls: string[] = [];
  const parent = {
    id: "parent-1",
    email: "parent@example.com",
    username: null,
    passwordHash: "hash",
    name: "Parent",
    role: "parent",
  };
  const student = {
    id: "student-1",
    email: "alex.kid_1@child.starliz.local",
    username: "alex.kid_1",
    passwordHash: "hash",
    name: "Alex",
    role: "student",
  };

  const deps = {
    findByEmail: async (email: string) => {
      calls.push(`email:${email}`);
      return email === parent.email ? parent : null;
    },
    findByUsername: async (username: string) => {
      calls.push(`username:${username}`);
      return username === student.username ? student : null;
    },
  };

  assert.equal((await findUserForLoginIdentifier("parent@example.com", deps))?.id, "parent-1");
  assert.equal((await findUserForLoginIdentifier("Alex.Kid_1", deps))?.id, "student-1");
  assert.equal(await findUserForLoginIdentifier("missing.user", deps), null);
  assert.equal(await findUserForLoginIdentifier("not-an-email@", deps), null);
  assert.deepEqual(calls, [
    "email:parent@example.com",
    "username:alex.kid_1",
    "username:missing.user",
    "email:not-an-email@",
  ]);
});

test("unknown username and wrong password share the same credentials error string", () => {
  assert.match(LOGIN_INVALID_CREDENTIALS_ERROR, /email, username, or password/i);
});

test("password hashing still verifies with existing bcrypt helpers", async () => {
  const hash = await hashPassword("Secret123!");
  assert.equal(await verifyPassword("Secret123!", hash), true);
  assert.equal(await verifyPassword("wrong", hash), false);
});

test("student login lands on /student/dashboard; parent lands on Parent Portal", () => {
  assert.deepEqual(
    resolveStaffLandingFromMembership({ userRole: "student", membership: null }),
    { kind: "student", path: "/student/dashboard" },
  );
  assert.deepEqual(
    resolveStaffLandingFromMembership({ userRole: "parent", membership: null }),
    { kind: "parent", path: "/parent/dashboard" },
  );
});
