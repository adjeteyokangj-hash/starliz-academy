import test from "node:test";
import assert from "node:assert/strict";

import {
  adminPlanKeyFromPricingPlan,
  normalizeAdminPlanKey,
  toStoredPlanKey,
} from "../src/lib/subscriptions/adminPlanKeys";

test("normalizeAdminPlanKey maps legacy and pricing keys to admin-safe values", () => {
  assert.equal(normalizeAdminPlanKey("free"), "free");
  assert.equal(normalizeAdminPlanKey("monthly"), "standard");
  assert.equal(normalizeAdminPlanKey("yearly"), "pro");
  assert.equal(normalizeAdminPlanKey("pricing:starter"), "starter");
  assert.equal(normalizeAdminPlanKey("pricing:standard"), "standard");
  assert.equal(normalizeAdminPlanKey("pricing:pro"), "pro");
  assert.equal(normalizeAdminPlanKey("pricing:enterprise-custom"), "enterprise");
});

test("adminPlanKeyFromPricingPlan derives stable admin keys from plan metadata", () => {
  assert.equal(adminPlanKeyFromPricingPlan({ name: "Starter", interval: "month", audience: "individual" }), "starter");
  assert.equal(adminPlanKeyFromPricingPlan({ name: "Standard", interval: "month", audience: "family" }), "standard");
  assert.equal(adminPlanKeyFromPricingPlan({ name: "Pro", interval: "year", audience: "family" }), "pro");
  assert.equal(adminPlanKeyFromPricingPlan({ name: "Custom School", interval: "custom", audience: "school" }), "enterprise");
});

test("toStoredPlanKey preserves canonical storage mapping", () => {
  assert.equal(toStoredPlanKey("free"), "free");
  assert.equal(toStoredPlanKey("starter"), "starter");
  assert.equal(toStoredPlanKey("standard"), "monthly");
  assert.equal(toStoredPlanKey("pro"), "yearly");
  assert.equal(toStoredPlanKey("enterprise"), "enterprise_custom");
});
