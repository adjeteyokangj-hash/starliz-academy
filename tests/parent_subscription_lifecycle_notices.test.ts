import test from "node:test";
import assert from "node:assert/strict";

import { resolveLifecycleKind } from "../src/lib/subscriptions/parent-subscription-lifecycle-notices";

test("payment failed notice uses en-GB grace wording and essential billing tone", () => {
  const notice = resolveLifecycleKind({
    eventType: "invoice.payment_failed",
    previousStatus: "active",
    nextStatus: "past_due",
    currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
    graceEndsAt: new Date("2026-07-10T00:00:00.000Z"),
  });
  assert.ok(notice);
  assert.equal(notice!.kind, "payment_failed");
  assert.equal(notice!.auditAction, "payment_failed");
  assert.match(notice!.message, /essential billing notice/i);
  assert.doesNotMatch(notice!.message, /sub_|cus_|evt_/);
});

test("cancel at period end notice avoids refund promise", () => {
  const notice = resolveLifecycleKind({
    eventType: "customer.subscription.updated",
    previousStatus: "active",
    nextStatus: "cancelled",
    currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
    graceEndsAt: null,
  });
  assert.ok(notice);
  assert.equal(notice!.kind, "subscription_cancelled");
  assert.match(notice!.message, /no automatic pro-rata refund/i);
});

test("payment recovered notice fires after past_due recovery", () => {
  const notice = resolveLifecycleKind({
    eventType: "invoice.payment_succeeded",
    previousStatus: "past_due",
    nextStatus: "active",
    currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
    graceEndsAt: null,
  });
  assert.ok(notice);
  assert.equal(notice!.kind, "payment_recovered");
  assert.equal(notice!.auditAction, "payment_recovered");
});
