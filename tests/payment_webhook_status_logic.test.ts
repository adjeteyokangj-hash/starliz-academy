import test from "node:test";
import assert from "node:assert/strict";

import { resolveStripeWebhookStatus } from "../src/lib/subscriptions/webhook-status";

test("customer.subscription.deleted always resolves to cancelled", () => {
  const value = resolveStripeWebhookStatus({
    eventType: "customer.subscription.deleted",
    rawStatus: "active",
  });
  assert.equal(value, "cancelled");
});

test("invoice.payment_failed does not revive cancelled subscriptions", () => {
  const value = resolveStripeWebhookStatus({
    eventType: "invoice.payment_failed",
    existingStatus: "cancelled",
  });
  assert.equal(value, "cancelled");
});

test("invoice.payment_succeeded returns active for normal renewals", () => {
  const value = resolveStripeWebhookStatus({
    eventType: "invoice.payment_succeeded",
    existingStatus: "past_due",
  });
  assert.equal(value, "active");
});

test("invoice.payment_succeeded keeps cancelled when cancellation period already ended", () => {
  const value = resolveStripeWebhookStatus({
    eventType: "invoice.payment_succeeded",
    existingStatus: "cancelled",
    currentPeriodEnd: new Date("2026-05-01T00:00:00.000Z"),
    now: new Date("2026-05-25T00:00:00.000Z"),
  });
  assert.equal(value, "cancelled");
});

test("subscription updated with cancel_at_period_end keeps active until period end", () => {
  const value = resolveStripeWebhookStatus({
    eventType: "customer.subscription.updated",
    rawStatus: "active",
    cancelAtPeriodEnd: true,
    currentPeriodEnd: new Date("2026-06-01T00:00:00.000Z"),
    now: new Date("2026-05-25T00:00:00.000Z"),
  });
  assert.equal(value, "active");
});

test("subscription updated maps unpaid to past_due", () => {
  const value = resolveStripeWebhookStatus({
    eventType: "customer.subscription.updated",
    rawStatus: "unpaid",
  });
  assert.equal(value, "past_due");
});
