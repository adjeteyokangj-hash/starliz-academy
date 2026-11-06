import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { expiredOwnedContainer } from "../services/coding-runner/reap-expired.mjs";

test("expiry reaper requires an exact generated name, ID, ownership labels and expired lease", () => {
  const job = randomUUID(), now = Date.now();
  const value = { Id: "a".repeat(64), Name: `/starliz-coding-${job}`, Config: { Labels: {
    "starliz.coding.runner": "isolated-v1", "starliz.coding.job": job, "starliz.coding.expires": String(now - 1),
  } } };
  assert.equal(expiredOwnedContainer(value, now), true);
  for (const changed of [null, {}, { ...value, Id: "other" }, { ...value, Name: "/existing-application" },
    { ...value, Config: { Labels: {} } },
    { ...value, Config: { Labels: { ...value.Config.Labels, "starliz.coding.expires": String(now + 10000) } } },
    { ...value, Config: { Labels: { ...value.Config.Labels, "starliz.coding.runner": "other" } } },
  ]) assert.equal(expiredOwnedContainer(changed, now), false);
});
