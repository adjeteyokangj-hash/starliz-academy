import test from "node:test";
import assert from "node:assert/strict";

import { handlePinSetForSession } from "../src/app/api/pin/set/route";
import { decideParentPinSetRequest, isWeakParentPin } from "../src/lib/parent-pin";

test("first-time parent PIN setup succeeds", async () => {
  let updatedHash = "";
  const response = await handlePinSetForSession({
    sessionUserId: "parent-1",
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
  assert.equal(Object.hasOwn(payload, "pin"), false);
  assert.equal(Object.hasOwn(payload, "pinHash"), false);
});

test("existing PIN cannot be overwritten without current PIN", async () => {
  const response = await handlePinSetForSession({
    sessionUserId: "parent-2",
    body: { pin: "2580" },
    deps: {
      findUser: async () => ({ pinHash: "existing-hash" }),
      updateUserPin: async () => undefined,
      verifyCurrentPin: async () => false,
      hashPin: async () => "ignored",
    },
  });

  const payload = (await response.json()) as { error?: string };
  assert.equal(response.status, 403);
  assert.equal(payload.error, "Current PIN is required to change an existing PIN.");
});

test("existing PIN cannot be overwritten with wrong current PIN", async () => {
  const response = await handlePinSetForSession({
    sessionUserId: "parent-3",
    body: { currentPin: "2468", newPin: "2580" },
    deps: {
      findUser: async () => ({ pinHash: "existing-hash" }),
      updateUserPin: async () => undefined,
      verifyCurrentPin: async () => false,
      hashPin: async () => "ignored",
    },
  });

  const payload = (await response.json()) as { error?: string };
  assert.equal(response.status, 403);
  assert.equal(payload.error, "Current PIN is incorrect.");
});

test("existing PIN can be changed with correct current PIN", async () => {
  let updateCalled = false;
  let updatedHash = "";
  const response = await handlePinSetForSession({
    sessionUserId: "parent-4",
    body: { currentPin: "2468", newPin: "2580" },
    deps: {
      findUser: async () => ({ pinHash: "existing-hash" }),
      updateUserPin: async (_id, pinHash) => {
        updateCalled = true;
        updatedHash = pinHash;
      },
      verifyCurrentPin: async () => true,
      hashPin: async () => "hashed-2580",
    },
  });

  const payload = (await response.json()) as Record<string, unknown>;
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, "change");
  assert.equal(updateCalled, true);
  assert.equal(updatedHash, "hashed-2580");
  assert.equal(Object.hasOwn(payload, "pin"), false);
  assert.equal(Object.hasOwn(payload, "pinHash"), false);
});

test("weak/default PINs are rejected", async () => {
  assert.equal(isWeakParentPin("0000"), true);
  assert.equal(isWeakParentPin("1234"), true);
  assert.equal(isWeakParentPin("4321"), true);
  assert.equal(isWeakParentPin("6789"), true);
  assert.equal(isWeakParentPin("9876"), true);
  assert.equal(isWeakParentPin("2580"), false);

  const response = await handlePinSetForSession({
    sessionUserId: "parent-5",
    body: { pin: "1234" },
    deps: {
      findUser: async () => ({ pinHash: null }),
      updateUserPin: async () => undefined,
      verifyCurrentPin: async () => true,
      hashPin: async () => "ignored",
    },
  });
  const payload = (await response.json()) as { error?: string };
  assert.equal(response.status, 400);
  assert.equal(payload.error, "This PIN is too simple. Please choose a more secure PIN.");
});

test("legacy pin payload remains setup-only", () => {
  const createDecision = decideParentPinSetRequest({
    hasExistingPin: false,
    body: { pin: "2580" },
  });
  assert.equal(createDecision.ok, true);

  const overwriteDecision = decideParentPinSetRequest({
    hasExistingPin: true,
    body: { pin: "2580" },
  });
  assert.equal(overwriteDecision.ok, false);
  if (!overwriteDecision.ok) {
    assert.equal(overwriteDecision.status, 403);
  }
});
