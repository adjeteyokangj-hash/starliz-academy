import test from "node:test";
import assert from "node:assert/strict";

import {
  handleAdminResetParentPin,
  handleAdminResetParentPinPost,
} from "../src/app/api/admin/parents/[id]/reset-pin/route";

test("non-admin cannot reset parent PIN", async () => {
  const response = await handleAdminResetParentPinPost({
    session: null,
    parentId: "parent-1",
    deps: {
      findParent: async () => null,
      clearParentPin: async () => undefined,
      writeAudit: async () => undefined,
    },
  });

  const payload = (await response.json()) as { error?: string };
  assert.equal(response.status, 403);
  assert.equal(payload.error, "Forbidden: admin only");
});

test("admin can reset parent PIN and clear pinHash state", async () => {
  let clearedParentId = "";
  let auditAction = "";
  const response = await handleAdminResetParentPin({
    adminUserId: "admin-1",
    adminEmail: "admin@example.com",
    parentId: "parent-2",
    deps: {
      findParent: async () => ({ id: "parent-2", email: "parent@example.com" }),
      clearParentPin: async (parentId) => {
        clearedParentId = parentId;
      },
      writeAudit: async (payload) => {
        auditAction = payload.action;
      },
    },
  });

  const payload = (await response.json()) as Record<string, unknown>;
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(
    payload.message,
    "Parent PIN has been reset. The parent must create a new PIN.",
  );
  assert.equal(clearedParentId, "parent-2");
  assert.equal(auditAction, "parent_pin_reset");
  assert.equal(Object.hasOwn(payload, "pin"), false);
  assert.equal(Object.hasOwn(payload, "pinHash"), false);
});

test("reset does not generate temporary/default PIN", async () => {
  let clearCalls = 0;
  const response = await handleAdminResetParentPin({
    adminUserId: "admin-2",
    adminEmail: "admin2@example.com",
    parentId: "parent-3",
    deps: {
      findParent: async () => ({ id: "parent-3", email: "parent3@example.com" }),
      clearParentPin: async () => {
        clearCalls += 1;
      },
      writeAudit: async () => undefined,
    },
  });

  const payload = (await response.json()) as Record<string, unknown>;
  assert.equal(response.status, 200);
  assert.equal(clearCalls, 1);
  assert.equal(Object.hasOwn(payload, "temporaryPin"), false);
  assert.equal(Object.hasOwn(payload, "generatedPin"), false);
  assert.equal(Object.hasOwn(payload, "pin"), false);
  assert.equal(Object.hasOwn(payload, "pinHash"), false);
});

test("parent can create a new PIN after admin reset", async () => {
  // Simulate reset state by returning pinHash null from the post-reset user lookup.
  let updatedHash = "";

  const { handlePinSetForSession } = await import("../src/app/api/pin/set/route");
  const response = await handlePinSetForSession({
    sessionUserId: "parent-4",
    body: { pin: "2580" },
    deps: {
      findUser: async () => ({ pinHash: null }),
      updateUserPin: async (_id, pinHash) => {
        updatedHash = pinHash;
      },
      verifyCurrentPin: async () => false,
      hashPin: async () => "hashed-2580",
    },
  });

  const payload = (await response.json()) as Record<string, unknown>;
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, "create");
  assert.equal(updatedHash, "hashed-2580");
});
