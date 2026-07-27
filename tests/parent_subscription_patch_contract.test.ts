import test from "node:test";
import assert from "node:assert/strict";

/**
 * Tampering contract for PATCH /api/subscription.
 * Parents may only send { action: cancel_at_period_end | reactivate }.
 */

const ALLOWED = new Set(["cancel_at_period_end", "reactivate"]);

function isAllowedParentSubscriptionPatch(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const action = (body as { action?: unknown }).action;
  return typeof action === "string" && ALLOWED.has(action);
}

test("status privilege escalation payload is rejected by contract", () => {
  assert.equal(isAllowedParentSubscriptionPatch({ status: "active" }), false);
  assert.equal(isAllowedParentSubscriptionPatch({ pricingPlanId: "pro" }), false);
  assert.equal(isAllowedParentSubscriptionPatch({ parentId: "other" }), false);
  assert.equal(isAllowedParentSubscriptionPatch({ id: "sub_other", status: "active" }), false);
});

test("cancel and reactivate actions are allowed by contract", () => {
  assert.equal(isAllowedParentSubscriptionPatch({ action: "cancel_at_period_end" }), true);
  assert.equal(isAllowedParentSubscriptionPatch({ action: "reactivate" }), true);
});
