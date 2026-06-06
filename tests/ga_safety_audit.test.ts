import test from "node:test";
import assert from "node:assert/strict";
import { validateGaSafetyApproval } from "../src/lib/ga-safety-audit";

test("flagged approval requires reason", () => {
  assert.throws(() => validateGaSafetyApproval({ requiresReauth: true, reauthPassed: true, decisionReason: "" }), /Decision reason is required/);
});

test("flagged approval requires reauth when required", () => {
  assert.throws(() => validateGaSafetyApproval({ requiresReauth: true, reauthPassed: false, decisionReason: "Verified dictionary usage" }), /Re-authentication is required/);
});

test("approval validation passes with reason and reauth", () => {
  assert.doesNotThrow(() => validateGaSafetyApproval({ requiresReauth: true, reauthPassed: true, decisionReason: "Verified dictionary usage" }));
});
