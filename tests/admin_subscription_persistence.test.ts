import test from "node:test";
import assert from "node:assert/strict";

import { accountStatusFromSubscription, toUiStatus } from "../src/app/api/admin/subscriptions/route";

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
});
