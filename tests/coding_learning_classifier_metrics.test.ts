import test from "node:test";
import assert from "node:assert/strict";
import { executeClassifier } from "../src/lib/coding/learning/studio-engines";

test("classifier evidence reports both error directions and separates deferred decisions from raw labels", () => {
  const training = [0, 4, 6, 10].map((value, i) => ({ id: `train-${i}`, features: [value], label: i < 2 ? "low" : "high", group: "fictional training" }));
  const testExamples = [{ id: "tn", features: [1], label: "low", group: "fictional A" }, { id: "fp", features: [9], label: "low", group: "fictional B" }, { id: "fn", features: [1], label: "high", group: "fictional A" }, { id: "tp", features: [9], label: "high", group: "fictional B" }];
  const run = executeClassifier({ training, test: testExamples, k: 3, abstainBelow: .8, ruleThreshold: 5, modelVersion: "metrics-regression", source: "Synthetic author fixture", limitation: "Four synthetic held-out cases do not establish real-world reliability.", humanReview: true });
  assert.equal(run.ok, true); const output = run.output as Record<string, unknown>;
  assert.equal(output.correct, 2); assert.equal(output.errors, 2); assert.equal(output.accepted, 0); assert.equal(output.deferred, 4);
  assert.deepEqual((output.labelMetrics as Array<{ label: string }>).find(row => row.label === "high"), { label: "high", truePositive: 1, falsePositive: 1, falseNegative: 1, trueNegative: 1, support: 2 });
  assert.deepEqual(output.featureOverlaps, []); assert.deepEqual(output.testIds, ["tn", "fp", "fn", "tp"]);
  const overlap = executeClassifier({ training, test: [{ ...testExamples[0], features: [0] }], k: 1, abstainBelow: .8, ruleThreshold: 5, modelVersion: "overlap-regression", source: "Synthetic", limitation: "Feature equality is not sufficient to infer provenance.", humanReview: true });
  assert.deepEqual((overlap.output as Record<string, unknown>).featureOverlaps, [{ testId: "tn", trainingIds: ["train-0"] }]);
});

test("comparison provenance checks full examples and follows the actual held-out test override", () => {
  const training = [{ id: "training-low", features: [0], label: "low", group: "fictional" }];
  const examples = [{ id: "held-out", features: [1], label: "low", group: "fictional" }];
  const base = { training, test: examples, k: 1, abstainBelow: .8, ruleThreshold: 5, modelVersion: "comparison-regression", source: "Synthetic", limitation: "One example is not a general evaluation.", humanReview: true };
  for (const changed of [{ ...examples[0], features: [2] }, { ...examples[0], label: "high" }]) {
    const run = executeClassifier({ ...base, ruleTest: [changed] });
    assert.equal(run.ok, true); assert.equal((run.output as Record<string, unknown>).comparisonSameExamples, false);
  }
  const unseen = [{ id: "unseen", features: [2], label: "low", group: "new fictional group" }];
  const synced = executeClassifier(base, { test: unseen });
  assert.equal((synced.output as Record<string, unknown>).comparisonSameExamples, true);
  assert.deepEqual((synced.output as Record<string, unknown>).testIds, ["unseen"]);
  const stale = executeClassifier({ ...base, ruleTest: examples }, { test: unseen });
  assert.equal((stale.output as Record<string, unknown>).comparisonSameExamples, false);
});
