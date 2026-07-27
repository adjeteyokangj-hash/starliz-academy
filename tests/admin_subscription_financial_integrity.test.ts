import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { accountStatusFromSubscription, toUiStatus } from "../src/app/api/admin/subscriptions/route";
import { formatParentSubscriptionStatus } from "../src/lib/subscriptions/parent-subscription-access";

const ROOT = process.cwd();

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("admin subscription status mapping persists suspended state for cancelled and past_due", () => {
  assert.equal(accountStatusFromSubscription("cancelled"), "suspended");
  assert.equal(accountStatusFromSubscription("past_due"), "suspended");
  assert.equal(accountStatusFromSubscription("blocked"), "suspended");
});

test("admin subscription status mapping keeps active accounts active", () => {
  assert.equal(accountStatusFromSubscription("active"), "active");
  assert.equal(accountStatusFromSubscription("trialing"), "active");
});

test("ui status normalizer preserves failed payment and suspended semantics", () => {
  assert.equal(toUiStatus("failed_payment"), "failed_payment");
  assert.equal(toUiStatus("suspended"), "suspended");
  assert.equal(toUiStatus("blocked"), "suspended");
  assert.equal(toUiStatus("unpaid"), "past_due");
  assert.equal(toUiStatus("incomplete"), "past_due");
  assert.equal(toUiStatus("expired"), "expired");
});

test("admin subscriptions route rejects unsafe local overrides", () => {
  const source = read("src/app/api/admin/subscriptions/route.ts");
  assert.match(source, /unsafe_local_override_disabled/);
  assert.match(source, /payment_derived_field_tamper/);
  assert.match(source, /admin_subscription_change_rejected/);
  assert.match(source, /cancel_at_period_end/);
  assert.match(source, /reactivate/);
  assert.match(source, /send_payment_reminder/);
  assert.match(source, /record_operational_note/);
  assert.doesNotMatch(source, /prisma\.subscription\.update\(\{ where: \{ id: current\.id \}, data \}\)/);
  assert.doesNotMatch(source, /action: "admin\.subscription\.override"/);
  assert.match(source, /hasProviderCustomer/);
  assert.doesNotMatch(source, /stripeCustomerId: subscription\?\.providerCustomerId/);
});

test("fake payment reminder stub is removed", () => {
  const source = read("src/app/api/admin/subscriptions/route.ts");
  assert.doesNotMatch(source, /Payment reminder queued/);
  assert.match(source, /enqueueAdminPaymentLifecycleReminder/);
  const reminder = read("src/lib/subscriptions/admin-payment-reminder.ts");
  assert.match(reminder, /admin_payment_notice_enqueued/);
  assert.match(reminder, /admin_payment_notice_failed/);
  assert.match(reminder, /dedupeKey/);
  assert.doesNotMatch(reminder, /providerCustomerId|providerSubId|cus_/);
});

test("admin subscriptions UI no longer edits payment-derived fields optimistically", () => {
  const source = read("src/app/admin/(secure)/subscriptions/page.tsx");
  assert.doesNotMatch(source, /updateLocalRow/);
  assert.doesNotMatch(source, /Apply plan/);
  assert.doesNotMatch(source, /Extend \+7d/);
  assert.match(source, /Cancel at period end/);
  assert.match(source, /Send payment notice/);
  assert.match(source, /hasProviderCustomer/);
  assert.doesNotMatch(source, /stripeCustomerId/);
});

test("parent admin routes reject payment-derived writes", () => {
  const detail = read("src/app/api/admin/parents/[id]/route.ts");
  assert.match(detail, /payment_derived_field_tamper/);
  assert.match(detail, /hasStripeCustomer/);
  assert.doesNotMatch(detail, /stripeCustomerId: body\.stripeCustomerId/);
  const create = read("src/app/api/admin/parents/route.ts");
  assert.match(create, /payment_derived_field_tamper_on_create/);
  assert.match(create, /stripeCustomerId: null/);
});

test("status formatter matrix distinguishes cancel-at-period-end and payment attention", () => {
  const future = new Date(Date.now() + 7 * 86_400_000);
  const past = new Date(Date.now() - 7 * 86_400_000);
  const cancelScheduled = formatParentSubscriptionStatus({
    status: "cancelled",
    currentPeriodEnd: future,
  });
  assert.equal(cancelScheduled.code, "cancel_at_period_end");
  assert.equal(cancelScheduled.cancelScheduled, true);
  assert.match(cancelScheduled.detail, /No cancellation fee/i);

  const expired = formatParentSubscriptionStatus({
    status: "cancelled",
    currentPeriodEnd: past,
  });
  assert.equal(expired.code, "cancelled");
  assert.equal(expired.cancelScheduled, false);

  const attention = formatParentSubscriptionStatus({
    status: "past_due",
    graceEndsAt: future,
  });
  assert.equal(attention.label, "Payment needs attention");
  assert.equal(attention.tone, "danger");
});
