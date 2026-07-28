import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("parent Short Learning booking statuses are labelled for parents", () => {
  const source = readFileSync(join(process.cwd(), "src/components/parent/ParentShortLearningPanel.tsx"), "utf8");
  assert.match(source, /function formatBookingStatus/);
  assert.match(source, /Missed \(no-show\)/);
  assert.match(source, /Cancelled \(late\)/);
  assert.doesNotMatch(source, /105/);
  assert.match(source, /value=\{90\}/);
  assert.match(source, /value=\{120\}/);
  assert.match(source, /no cancellation fee/i);
});

test("support form associates labels with controls", () => {
  const source = readFileSync(join(process.cwd(), "src/app/parent/support/page.tsx"), "utf8");
  assert.match(source, /htmlFor="support-subject"/);
  assert.match(source, /id="support-subject"/);
  assert.match(source, /role="alert"/);
});

test("BillingCard cancel confirmation is announced as a dialog", () => {
  const source = readFileSync(join(process.cwd(), "src/components/parent/BillingCard.tsx"), "utf8");
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-labelledby="cancel-confirm-title"/);
});

test("account API no longer defaults missing subscription to active or leaks stripeCustomerId", () => {
  const source = readFileSync(join(process.cwd(), "src/app/api/account/route.ts"), "utf8");
  assert.match(source, /subscription\?\.status \?\? "inactive"/);
  assert.match(source, /hasStripeCustomer/);
  assert.doesNotMatch(source, /stripeCustomerId: parentProfile/);
});

test("parent insights route accepts childId scoping", () => {
  const source = readFileSync(join(process.cwd(), "src/app/api/parent/insights/route.ts"), "utf8");
  assert.match(source, /searchParams\.get\("childId"\)/);
  assert.match(source, /scopedChildId/);
});

test("active child switch rotates child-selection cookie", () => {
  const source = readFileSync(join(process.cwd(), "src/app/api/children/active/route.ts"), "utf8");
  assert.match(source, /createChildSelectionToken/);
  assert.match(source, /getChildSelectionCookieName/);
});

test("parent messages omit actorUserId from parent-facing payload", () => {
  const source = readFileSync(join(process.cwd(), "src/app/api/parent/messages/route.ts"), "utf8");
  // Mapping to client payload must not include actorUserId
  assert.match(source, /body: m\.body,/);
  assert.doesNotMatch(source, /actorUserId: m\.actorUserId/);
});
