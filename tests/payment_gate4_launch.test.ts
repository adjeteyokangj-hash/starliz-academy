import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { subscriptionGrantsAccess } from "../src/lib/subscriptions/parent-subscription-access";
import { isAllowedShortLearningDuration } from "../src/lib/schools/short-learning-bookings";
import { isShortLearningAdminDuration } from "../src/lib/schools/short-learning-session-plan";

const ROOT = process.cwd();
function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("Parent BillingCard checkout explicitly requests Stripe", () => {
  const card = read("src/components/parent/BillingCard.tsx");
  assert.match(card, /provider:\s*['"]stripe['"]/);
  assert.match(card, /stripePriceId/);
});

test("Multi-provider Stripe checkout aligns with webhook parent resolution", () => {
  const checkout = read("src/app/api/subscription/checkout/route.ts");
  assert.match(checkout, /client_reference_id/);
  assert.match(checkout, /metadata\[userId\]/);
  assert.match(checkout, /\/billing\/success/);
  assert.match(checkout, /providerSubId:\s*null/);
  assert.match(checkout, /verified webhook|pending until the verified webhook/i);
});

test("Success pages do not grant paid access from redirect alone", () => {
  assert.match(read("src/app/billing/success/page.tsx"), /webhook/);
  assert.match(read("src/app/subscription/success/page.tsx"), /does not grant paid access|webhook updates your account/);
});

test("Dedicated Stripe webhook fails closed without secret and disables fallback signatures", () => {
  const route = read("src/app/api/billing/stripe/webhook/route.ts");
  assert.match(route, /STRIPE_WEBHOOK_SECRET/);
  assert.match(route, /status:\s*503/);
  assert.match(route, /allowFallbackSignature:\s*false/);
});

test("Admin cannot activate paid access and has no refund action", () => {
  const route = read("src/app/api/admin/subscriptions/route.ts");
  assert.match(route, /"activate"/);
  assert.match(route, /REJECTED_ACTIONS|cannot activate paid access/i);
  assert.doesNotMatch(route, /action:\s*z\.literal\("refund"\)/);
  const ui = read("src/app/admin/(secure)/subscriptions/page.tsx");
  assert.doesNotMatch(ui, /ActionType.*"refund"/);
});

test("past_due access requires an active grace window", () => {
  const now = new Date("2026-07-01T00:00:00.000Z");
  assert.equal(subscriptionGrantsAccess({ status: "past_due", graceEndsAt: new Date("2026-07-08T00:00:00.000Z"), now }), true);
  assert.equal(subscriptionGrantsAccess({ status: "past_due", graceEndsAt: null, now }), false);
  assert.equal(subscriptionGrantsAccess({ status: "past_due", now }), false);
});

test("105-minute Short Learning remains unavailable", () => {
  assert.equal(isAllowedShortLearningDuration(105), false);
  assert.equal(isShortLearningAdminDuration(105), false);
  assert.equal(isAllowedShortLearningDuration(90), true);
  assert.equal(isAllowedShortLearningDuration(120), true);
});

test("Commercial cancel stance remains locked in parent status copy", () => {
  const access = read("src/lib/subscriptions/parent-subscription-access.ts");
  assert.match(access, /No cancellation fee/);
  assert.match(access, /no automatic pro-rata refund/);
});
