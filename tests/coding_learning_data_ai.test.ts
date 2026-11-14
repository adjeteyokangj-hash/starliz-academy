import test from "node:test";
import assert from "node:assert/strict";
import { dataAiFoundationActivities } from "../src/lib/coding/learning/content/data-ai-foundations";
import { executePractical } from "../src/lib/coding/learning/runtime";
import { checkExecution } from "../src/lib/coding/learning/checks";
import { dataAiProjectActivities, dataAiProjectTools } from "../src/lib/coding/learning/content/data-ai-project";
import { dataAiRetrievalActivities } from "../src/lib/coding/learning/content/data-ai-retrieval";
import { dataAiFoundationTools } from "../src/lib/coding/learning/content/data-ai-foundations";
import { executeInvestigation } from "../src/lib/coding/learning/investigation-engine";
import { initialActivityState, transitionActivity } from "../src/lib/coding/learning/state-machine";
import { visual } from "../src/lib/coding/learning/authoring";
import type { Json } from "../src/lib/coding/learning/types";

for (const activity of [...dataAiFoundationActivities, ...dataAiProjectActivities, ...dataAiRetrievalActivities]) test(`${activity.inventoryId}: actual native outcomes, seeded fault and independent cases`, async () => {
  for (const [part, artifact, cases] of [["build", activity.reference, activity.cases], ["practice", activity.reference, activity.practiceCases], ["repair", activity.debugReference, activity.debugCases], ...activity.independent.map((variant) => [variant.id, variant.reference, variant.cases] as const)] as const) {
    for (const fixture of cases) {
      const run = await executePractical(activity.workbench, artifact, fixture.input);
      assert.equal(run.ok, true, `${part}/${fixture.id}: ${run.error ?? "execution failed"}`);
      const failed = checkExecution(run, fixture.assertions).filter((check) => !check.passed);
      assert.deepEqual(failed, [], `${part}/${fixture.id}`);
    }
  }
  const faulty = await executePractical(activity.workbench, activity.faulty, activity.debugCases[0]!.input);
  assert.equal(checkExecution(faulty, activity.debugCases[0]!.assertions).every((check) => check.passed), false, "The seeded fault must fail actual outcome checks");
});

test("editable classifier tests cannot replace held-out assessment evidence", async () => {
  const activity = dataAiFoundationActivities.find((item) => item.inventoryId === "Y6.16")!;
  const state = initialActivityState(activity); state.stage = "build"; state.completed = ["discover", "predict"];
  const artifact = visual(dataAiFoundationTools.classifier(0, true));
  const deps = { run: executePractical, teach: async () => ({ message: "Test a different case.", source: "fallback" as const, revealing: false }), reflect: async () => ({ passed: false, source: "evidence" as const, confidence: 0, message: "Not reviewed." }) };
  const play = await transitionActivity(activity, state, { action: "run", stage: "build", revision: "test", artifact }, deps);
  assert.equal((play.state.lastExecution!.output as Record<string, Json>).correct, 1, "Editable play uses the learner's visible test examples");
  const assessed = await transitionActivity(activity, play.state, { action: "check", stage: "build", revision: "test", artifact }, deps);
  assert.equal(assessed.passed, false, "The actual held-out long category still fails");
  assert.equal(assessed.state.stage, "build");
});

test("data-to-model provenance rejects altered measurements and duplicated source identifiers", () => {
  const context = dataAiFoundationTools.contexts[0]!, project = dataAiProjectTools.project(context), input = dataAiProjectTools.cases("provenance", context)[0]!.input;
  const actual = executeInvestigation(project, input); assert.equal(actual.ok, true, actual.error);
  assert.equal((actual.output as Record<string, Json>).trainingMatchesData, true);
  const altered = structuredClone(project); altered.classifier.training[2]!.features[0]! += .1;
  const changed = executeInvestigation(altered, input).output as Record<string, Json>;
  assert.equal((changed.classifier as Record<string, Json>).correct, 2, "A small fabricated measurement can retain correct predictions");
  assert.equal(changed.trainingMatchesData, false, "Prediction accuracy does not substitute for actual source provenance");
  const duplicates = structuredClone(project); duplicates.data.dataSource = "document"; duplicates.data.operations = [];
  duplicates.data.rows = [{ id: "a", category: context.first, amount: context.amounts[0] }, { id: "a", category: context.first, amount: context.amounts[0] }, { id: "b", category: context.first, amount: context.amounts[1] }];
  assert.equal((executeInvestigation(duplicates).output as Record<string, Json>).trainingMatchesData, false, "Repeated source IDs cannot hide an unmatched extra training example");
});
