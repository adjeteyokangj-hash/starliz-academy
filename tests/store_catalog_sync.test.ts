import test from "node:test";
import assert from "node:assert/strict";

import { FLAT_REWARD_CATALOG } from "../src/lib/reward_catalog";
import { isCatalogStoreItemId } from "../src/lib/store-policy";

/**
 * Mirrors ensureCatalogItemsInDb reward-id selection without DB:
 * catalog StoreItem ids map 1:1 to RewardItem ids;
 * only non-catalog StoreItem ids get admin-store-* mirrors.
 */
function rewardIdsForStoreSync(storeItemIds: string[], catalogIds: Set<string>): string[] {
  const rewardIds: string[] = [];
  for (const id of storeItemIds) {
    if (catalogIds.has(id)) {
      rewardIds.push(id);
    } else {
      rewardIds.push(`admin-store-${id}`);
    }
  }
  return rewardIds;
}

test("catalog sync never creates admin-store-* duplicates for catalog SKUs", () => {
  const catalogIds = new Set(FLAT_REWARD_CATALOG.map((item) => item.id));
  const storeIds = [...catalogIds, "cuid_custom_extra_001"];
  const rewardIds = rewardIdsForStoreSync(storeIds, catalogIds);

  assert.equal(rewardIds.filter((id) => id === "theme-rainbow").length, 1);
  assert.ok(!rewardIds.includes("admin-store-theme-rainbow"));
  assert.ok(rewardIds.includes("admin-store-cuid_custom_extra_001"));
  assert.equal(new Set(rewardIds).size, rewardIds.length);
});

test("isCatalogStoreItemId distinguishes catalog from custom store rows", () => {
  const catalogIds = new Set(FLAT_REWARD_CATALOG.map((item) => item.id));
  assert.equal(isCatalogStoreItemId("theme-rainbow", catalogIds), true);
  assert.equal(isCatalogStoreItemId("admin-store-theme-rainbow", catalogIds), false);
  assert.equal(isCatalogStoreItemId("cuid_custom_extra_001", catalogIds), false);
});
