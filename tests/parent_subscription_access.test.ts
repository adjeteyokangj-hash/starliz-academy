import test from "node:test";
import assert from "node:assert/strict";

import {
  formatParentSubscriptionStatus,
  subscriptionGrantsAccess,
} from "../src/lib/subscriptions/parent-subscription-access";

test("active and trialing grant access", () => {
  assert.equal(subscriptionGrantsAccess({ status: "active" }), true);
  assert.equal(subscriptionGrantsAccess({ status: "trialing" }), true);
});

test("cancelled grants access until period end only", () => {
  const now = new Date("2026-07-01T00:00:00.000Z");
  assert.equal(
    subscriptionGrantsAccess({
      status: "cancelled",
      currentPeriodEnd: new Date("2026-07-15T00:00:00.000Z"),
      now,
    }),
    true,
  );
  assert.equal(
    subscriptionGrantsAccess({
      status: "cancelled",
      currentPeriodEnd: new Date("2026-06-01T00:00:00.000Z"),
      now,
    }),
    false,
  );
});

test("past_due grants access only inside grace window", () => {
  const now = new Date("2026-07-01T00:00:00.000Z");
  assert.equal(
    subscriptionGrantsAccess({
      status: "past_due",
      graceEndsAt: new Date("2026-07-10T00:00:00.000Z"),
      now,
    }),
    true,
  );
  assert.equal(
    subscriptionGrantsAccess({
      status: "past_due",
      graceEndsAt: new Date("2026-06-01T00:00:00.000Z"),
      now,
    }),
    false,
  );
  assert.equal(subscriptionGrantsAccess({ status: "past_due", now }), false);
});

test("formatParentSubscriptionStatus distinguishes payment attention from pending", () => {
  const pastDue = formatParentSubscriptionStatus({
    status: "past_due",
    graceEndsAt: new Date("2026-07-10T00:00:00.000Z"),
    now: new Date("2026-07-01T00:00:00.000Z"),
  });
  assert.equal(pastDue.label, "Payment needs attention");
  assert.equal(pastDue.tone, "danger");
  assert.equal(pastDue.canManageBilling, true);
  assert.match(pastDue.detail, /Grace continues until/);

  const cancelScheduled = formatParentSubscriptionStatus({
    status: "cancelled",
    currentPeriodEnd: new Date("2026-07-20T00:00:00.000Z"),
    now: new Date("2026-07-01T00:00:00.000Z"),
  });
  assert.equal(cancelScheduled.cancelScheduled, true);
  assert.equal(cancelScheduled.label, "Cancels at period end");
  assert.match(cancelScheduled.detail, /No cancellation fee/);
});
