import test from "node:test";
import assert from "node:assert/strict";
import { labIncluded, withCodingAccess } from "../src/lib/coding/learning/entitlements";

test("legacy plans retain existing whole-learning access until a lab restriction is explicitly set", () => {
  assert.equal(labIncluded(["AI learning", "Parent reports"]), true);
  const changed = withCodingAccess(["AI learning", "Parent reports"], false);
  assert.equal(labIncluded(changed), false);
  assert.equal(labIncluded(changed, "robotics"), true);
  assert.deepEqual(changed.bullets, ["AI learning", "Parent reports"]);
});
test("editing Coding access preserves other lab restrictions and unrelated plan metadata", () => {
  const original = { labs: ["coding", "art"], bullets: ["Private portfolio"], limits: { children: 3 } };
  const changed = withCodingAccess(original, false);
  assert.equal(labIncluded(changed), false);
  assert.equal(labIncluded(changed, "art"), true);
  assert.equal(labIncluded(changed, "robotics"), false);
  assert.deepEqual(changed.limits, { children: 3 });
  assert.deepEqual(original.labs, ["coding", "art"]);
});
test("malformed explicit entitlements fail closed and cannot turn an edit into an all-labs grant", () => {
  for (const labs of [null, "coding", 1, false]) {
    const original = { labs };
    assert.equal(labIncluded(original), false);
    const changed = withCodingAccess(original, true);
    assert.equal(labIncluded(changed), true);
    assert.equal(labIncluded(changed, "robotics"), false);
  }
});
