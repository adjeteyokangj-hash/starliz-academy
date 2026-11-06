import test from "node:test";
import assert from "node:assert/strict";
import { authoredActivities, activityContentHash, validateReleaseSeal, publicationScopeAllowed } from "../src/lib/coding/learning/catalogue";
import { ACTIVITY_VERSION } from "../src/lib/coding/learning/types";

test("local content approval cannot expose the curriculum in production or unspecified environments", () => {
  const seal = { version: ACTIVITY_VERSION, runtimeHash: "a".repeat(64), verificationRun: "fictional-test", publicationScope: "development", activities: Object.fromEntries(authoredActivities.map(activity => [activity.id, activityContentHash(activity)])) };
  assert(validateReleaseSeal(seal, seal.runtimeHash));
  assert(publicationScopeAllowed(seal, "development"));
  for (const environment of ["production", "test", "", "unknown"]) assert.equal(publicationScopeAllowed(seal, environment), false);
  assert.equal(publicationScopeAllowed({ ...seal, publicationScope: undefined }, "development"), false);
  assert.equal(publicationScopeAllowed({ ...seal, publicationScope: "typo" }, "development"), false);
  assert(publicationScopeAllowed({ ...seal, publicationScope: "production" }, "production"));
  assert.equal(validateReleaseSeal({ ...seal, activities: { ...seal.activities, [authoredActivities[0]!.id]: "tampered" } }, seal.runtimeHash), false);
  assert.equal(validateReleaseSeal(seal, "b".repeat(64)), false);
});
