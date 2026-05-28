import test from "node:test";
import assert from "node:assert/strict";

import { handlePinSetForSession } from "../src/app/api/pin/set/route";
import { handlePinStatusForSession } from "../src/app/api/pin/status/route";
import { handlePinVerifyForSession } from "../src/app/api/pin/verify/route";
import { resolveParentPinGateState } from "../src/lib/parent-pin-gate";
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

test("/api/pin/status returns hasPin false and ignores stale unlock cookie", async () => {
  const response = await handlePinStatusForSession({
    sessionUserId: "parent-status-1",
    deps: {
      findUser: async () => ({ pinHash: null }),
      readUnlock: async () => true,
    },
  });

  const payload = (await response.json()) as { hasPin?: boolean; unlocked?: boolean };
  assert.equal(response.status, 200);
  assert.equal(payload.hasPin, false);
  assert.equal(payload.unlocked, false);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
});

test("/api/pin/verify returns setup-required when no PIN exists", async () => {
  const response = await handlePinVerifyForSession({
    sessionUserId: "parent-verify-1",
    pin: "2580",
    deps: {
      findUser: async () => ({
        id: "parent-verify-1",
        pinHash: null,
        parentPinFailedAttempts: 0,
        parentPinLockedUntil: null,
      }),
      verifyPin: async () => false,
      updateUser: async () => undefined,
      writeAudit: async () => undefined,
      createUnlockToken: async () => "unused",
    },
  });

  const payload = (await response.json()) as { code?: string; error?: string; valid?: boolean };
  assert.equal(response.status, 409);
  assert.equal(payload.valid, false);
  assert.equal(payload.code, "pin_setup_required");
  assert.match(payload.error ?? "", /create a new PIN/i);
});

test("parent profile gate resolves to create-PIN state when hasPin is false", () => {
  const state = resolveParentPinGateState({ hasPin: false });
  assert.equal(state, "setup_required");

  const staleCookieState = resolveParentPinGateState({ hasPin: false, setupRequiredHint: true });
  assert.equal(staleCookieState, "setup_required");
});
