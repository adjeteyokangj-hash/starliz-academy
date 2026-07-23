import test from "node:test";
import assert from "node:assert/strict";

import {
  parseStorePolicyFromDescription,
  resolveStorePolicy,
  stripStorePolicyTokensFromDescription,
  isCatalogStoreItemId,
} from "../src/lib/store-policy";
import { FLAT_REWARD_CATALOG } from "../src/lib/reward_catalog";

test("parseStorePolicyFromDescription reads type approval and stock tokens", () => {
  const policy = parseStorePolicyFromDescription("Cool badge type:physical approval:admin stock:12");
  assert.equal(policy.rewardType, "physical");
  assert.equal(policy.approvalMode, "admin");
  assert.equal(policy.stockTotal, 12);
});

test("parseStorePolicyFromDescription defaults when tokens are missing", () => {
  const policy = parseStorePolicyFromDescription("Just a friendly description");
  assert.equal(policy.rewardType, "digital");
  assert.equal(policy.approvalMode, "none");
  assert.equal(policy.stockTotal, null);
});

test("stripStorePolicyTokensFromDescription keeps human text", () => {
  assert.equal(
    stripStorePolicyTokensFromDescription("Cool badge type:physical approval:admin stock:12"),
    "Cool badge",
  );
});

test("resolveStorePolicy prefers columns over description tokens", () => {
  const policy = resolveStorePolicy({
    rewardType: "digital",
    approvalMode: "none",
    stockTotal: null,
    description: "type:physical approval:admin stock:9",
  });
  assert.equal(policy.rewardType, "digital");
  assert.equal(policy.approvalMode, "none");
  assert.equal(policy.stockTotal, null);
});

test("resolveStorePolicy falls back to description when columns are unset", () => {
  const policy = resolveStorePolicy({
    rewardType: null,
    approvalMode: undefined,
    stockTotal: undefined,
    description: "type:physical approval:parent stock:4",
  });
  assert.equal(policy.rewardType, "physical");
  assert.equal(policy.approvalMode, "parent");
  assert.equal(policy.stockTotal, 4);
});

test("catalog store ids are stable and unique for shop sync", () => {
  const ids = FLAT_REWARD_CATALOG.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  const catalogIds = new Set(ids);
  assert.equal(isCatalogStoreItemId("theme-rainbow", catalogIds), true);
  assert.equal(isCatalogStoreItemId("cmrandomcuid123", catalogIds), false);
  assert.ok(ids.every((id) => !id.startsWith("admin-store-")));
});
