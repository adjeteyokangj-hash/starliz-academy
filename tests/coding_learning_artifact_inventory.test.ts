import test from "node:test";
import assert from "node:assert/strict";
import { authoredActivities } from "../src/lib/coding/learning/catalogue";
import { practicalArtifactSchema } from "../src/lib/coding/learning/types";
import { scenario, eq } from "../src/lib/coding/learning/authoring";

test("every authored stage and independent artifact satisfies the actual runtime envelope", () => {
  assert.equal(new Set(authoredActivities.map(activity => activity.id)).size, authoredActivities.length, "Runtime activity identifiers cannot be duplicated across modules");
  assert.equal(new Set(authoredActivities.map(activity => activity.inventoryId)).size, authoredActivities.length, "Approved inventory activities cannot be registered twice");
  for (const activity of authoredActivities) {
    const artifacts = [activity.starter, activity.example, activity.reference, activity.faulty, activity.debugReference,
      activity.prediction.artifact, ...activity.independent.flatMap(variant => [variant.reference, variant.starter])];
    for (const [index, artifact] of artifacts.entries()) {
      const parsed = practicalArtifactSchema.safeParse(artifact);
      assert.equal(parsed.success, true, `${activity.inventoryId} artifact ${index}: ${parsed.success ? "" : parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
    }
  }
});

test("authoring fixtures preserve omitted fields but reject non-JSON execution data", () => {
  const input = { events: [{ target: "answer", type: "change", value: "0" }, { target: "next", type: "click" }] };
  assert.deepEqual(scenario("typed-events", input, eq("result", 0, "Zero is valid")).input, input);
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  for (const invalid of [{ value: undefined }, { value: NaN }, { value: () => 1 }, cyclic, JSON.parse('{"__proto__":{"polluted":true}}')])
    assert.throws(() => scenario("invalid", invalid, eq("result", 0, "Never executed")));
});
