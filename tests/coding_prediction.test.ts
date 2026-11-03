import test from "node:test";
import assert from "node:assert/strict";
import { firstInstructionsPackages } from "../src/lib/coding/curriculum/first-instructions";
import { assessRoutePrediction } from "../src/lib/coding/curriculum/prediction";
import { routeEvaluationSchema } from "../src/lib/coding/curriculum/route-engine";

for (const lesson of firstInstructionsPackages) test(`${lesson.inventoryId}: prediction requires an answer about the supplied sequence`, () => {
  const program = lesson.referenceArtifacts.find((item) => item.stage === "predict")!.artifact;
  const goal = routeEvaluationSchema.parse(lesson.evaluationSpec).stages.predict!.goal;
  assert.equal(assessRoutePrediction(lesson, program, undefined).failureCode, "prediction-required");
  assert.equal(assessRoutePrediction(lesson, program, { x: 5, y: 5 }).failureCode, "prediction-mismatch");
  assert.equal(assessRoutePrediction(lesson, { blocks: [] }, goal).failureCode, "prediction-program-changed");
  assert.equal(assessRoutePrediction(lesson, program, goal).passed, true);
});
