import test from "node:test";
import assert from "node:assert/strict";
import { firstRouteActivities } from "../src/lib/coding/learning/content/routes";
import { patternActivities } from "../src/lib/coding/learning/content/patterns";
import { mediaCardActivities } from "../src/lib/coding/learning/content/media-cards";
import { safeChoiceActivities } from "../src/lib/coding/learning/content/safe-choices";
import { firstRouteRetrievalActivities } from "../src/lib/coding/learning/content/first-route-retrieval";
import { cardRetrievalActivities } from "../src/lib/coding/learning/content/card-retrieval";
import { patternRetrievalActivities } from "../src/lib/coding/learning/content/pattern-retrieval";
import { safeCreatorRetrievalActivities } from "../src/lib/coding/learning/content/safe-creator-retrieval";
import { robotInputActivities } from "../src/lib/coding/learning/content/robot-inputs";
import { pictureDataActivities } from "../src/lib/coding/learning/content/picture-data";
import { animatedStoryActivities } from "../src/lib/coding/learning/content/animated-stories";
import { communityCreatorActivities } from "../src/lib/coding/learning/content/community-creators";
import { robotRetrievalActivities } from "../src/lib/coding/learning/content/robot-retrieval";
import { storyRetrievalActivities } from "../src/lib/coding/learning/content/story-retrieval";
import { dataRetrievalActivities } from "../src/lib/coding/learning/content/data-retrieval";
import { communityRetrievalActivities } from "../src/lib/coding/learning/content/community-retrieval";
import { animationBuilderActivities } from "../src/lib/coding/learning/content/animation-builders";
import { mazeBuilderActivities } from "../src/lib/coding/learning/content/maze-builders";
import { networkBuilderActivities } from "../src/lib/coding/learning/content/network-builders";
import { sensorRobotActivities } from "../src/lib/coding/learning/content/sensor-robots";
import { animationRetrievalActivities } from "../src/lib/coding/learning/content/animation-retrieval";
import { mazeRetrievalActivities } from "../src/lib/coding/learning/content/maze-retrieval";
import { sensorRetrievalActivities } from "../src/lib/coding/learning/content/sensor-retrieval";
import { networkRetrievalActivities } from "../src/lib/coding/learning/content/network-retrieval";
import { stateGameActivities } from "../src/lib/coding/learning/content/state-games";
import { reusableStoryActivities } from "../src/lib/coding/learning/content/reusable-stories";
import { evidencePosterActivities } from "../src/lib/coding/learning/content/evidence-posters";
import { teamRoleActivities } from "../src/lib/coding/learning/content/team-roles";
import { teamSafetyActivities } from "../src/lib/coding/learning/content/team-safety";
import { audienceGameActivities } from "../src/lib/coding/learning/content/audience-games";
import { stateRetrievalActivities } from "../src/lib/coding/learning/content/state-retrieval";
import { reusableRetrievalActivities } from "../src/lib/coding/learning/content/reusable-retrieval";
import { evidenceRetrievalActivities } from "../src/lib/coding/learning/content/evidence-retrieval";
import { teamRetrievalActivities } from "../src/lib/coding/learning/content/team-retrieval";
import { rescueAlgorithmActivities } from "../src/lib/coding/learning/content/rescue-algorithms";
import { rescueRetrievalActivities } from "../src/lib/coding/learning/content/rescue-retrieval";
import { connectedWebActivities } from "../src/lib/coding/learning/content/connected-web";
import { functionDataActivities } from "../src/lib/coding/learning/content/functions-and-data";
import { initialActivityState, transitionActivity, currentVariant, variantFingerprint } from "../src/lib/coding/learning/state-machine";
import { executePractical } from "../src/lib/coding/learning/runtime";
import { publicActivityView } from "../src/lib/coding/learning/public-view";
import { checkExecution, orderedSubsequence } from "../src/lib/coding/learning/checks";
import type { ActivityAction, ActivityState, PracticalArtifact, PracticalCase, Json } from "../src/lib/coding/learning/types";
import { visualEventNames, visualEventValue } from "../src/lib/coding/learning/visual-events";

const deps = {
  run: executePractical,
  teach: async () => ({ message: "Trace one arrow at a time.", source: "fallback" as const, revealing: false }),
  reflect: async () => ({ passed: true, message: "The explanation cites the executed route.", source: "evidence" as const, confidence: 1 }),
};
const action = (stage: ActivityAction["stage"], extra: Partial<ActivityAction> = {}): ActivityAction => ({ action: "check", stage, revision: "test-only", ...extra });

test("editable learning games play declared controls without replaying assessor inputs", async () => {
  const activity = structuredClone(audienceGameActivities[0]!);
  let state = initialActivityState(activity); state.completed = ["discover", "predict"]; state.stage = "build";
  const step = async (target?: string) => {
    const result = await transitionActivity(activity, state, action("build", { action: "run", artifact: activity.reference, ...(target ? { interaction: { type: "click", target } } : {}) }), deps);
    state = result.state; return state.lastExecution!.output as Record<string, Json>;
  };
  assert.deepEqual((await step()).variables, { score: 0 });
  assert.deepEqual((await step("check")).variables, { score: 1 });
  assert.deepEqual((await step("check")).variables, { score: 2 });
  assert.deepEqual((await step("restart")).variables, { score: 0 });
  await assert.rejects(() => step("undeclared"), /declared in this project/);
});

test("visual play starts independently of assessment events, retains typed inputs and runs a clean restart", async () => {
  const activity = structuredClone(firstRouteActivities[0]!);
  activity.cases[0]!.input = { events: [{ name: "choose", value: 9 }] };
  const artifact: PracticalArtifact = { type: "visual", document: { variables: { hits: 0 }, handlers: { start: [], choose: [{ op: "change", name: "hits", value: { read: "event" } }], restart: [{ op: "say", value: "Reset" }] } } };
  let state = initialActivityState(activity); state.completed = ["discover", "predict"]; state.stage = "build";
  const step = async (interaction?: ActivityAction["interaction"]) => { const result = await transitionActivity(activity, state, action("build", { action: "run", artifact, interaction }), deps); state = result.state; return state.lastExecution!.output as Record<string, Json>; };
  assert.deepEqual((await step()).variables, { hits: 0 }, "Running the workbench does not replay assessor-held button sequences");
  assert.deepEqual((await step({ type: "click", target: "choose", value: "2" })).variables, { hits: 2 });
  assert.deepEqual((await step({ type: "click", target: "choose", value: "-1" })).variables, { hits: 1 });
  const reset = await step({ type: "click", target: "restart" });
  assert.deepEqual(reset.variables, { hits: 0 }); assert.deepEqual(reset.speech, ["Reset"]);
  await assert.rejects(() => step({ type: "click", target: "choose", value: "1e309" }), /finite event number/);
  assert.equal(visualEventValue("true"), true); assert.equal(visualEventValue("false"), false);
  assert.equal(visualEventValue("0.25"), 0.25); assert.equal(visualEventValue("fictional input"), "fictional input");
  assert.deepEqual(visualEventNames({ comparison: { left: { handlers: { start: [], choose: [] } }, right: { handlers: { other: [] } } } }), ["start", "choose", "other"]);
});

test("saved data files round-trip only through source workspaces and reject invalid collections", async () => {
  const activity = functionDataActivities[0]!, state = initialActivityState(activity);
  state.completed = ["discover", "predict"]; state.stage = "build";
  state.files = { "notes.txt": "previous" };
  const source: PracticalArtifact = { type: "source", language: "python", entry: "variables", source: "pass" };
  let received: Json = null;
  const run = async (_workbench: unknown, _artifact: unknown, input: Json) => {
    received = input;
    return { ok: true, output: { files: { "notes.txt": "updated" } }, trace: [], stdout: "", stderr: "", runtime: "unit-contract", steps: 1 };
  };
  const result = await transitionActivity(activity, state, action("build", { action: "run", artifact: source }), { ...deps, run });
  assert.deepEqual((received as unknown as Record<string, Json>).files, state.files);
  assert.deepEqual(result.state.files, { "notes.txt": "updated" });
  assert.deepEqual(publicActivityView(activity, result.state).files, result.state.files);
  const visual = firstRouteActivities[0]!, visualState = initialActivityState(visual);
  visualState.completed = ["discover", "predict"]; visualState.stage = "build"; visualState.files = { ...state.files };
  await transitionActivity(visual, visualState, action("build", { action: "run", artifact: visual.reference }), { ...deps, run });
  assert.equal(Object.hasOwn(received as unknown as object, "files"), false, "Visual and engineering fixtures are not polluted by source data files");
  await assert.rejects(() => transitionActivity(activity, state, action("build", { action: "run", artifact: source }), { ...deps, run: async () => ({ ...await run(null, null, null), output: { files: { "../secret.txt": "unsafe" } } }) }), /supported names/);
  assert.deepEqual(state.files, { "notes.txt": "previous" }, "A rejected result cannot change the caller's saved data");
});

test("ordered route checks distinguish reversed, repeated and missing parcel stops", () => {
  const a = { x: 1, y: 0 }, b = { x: 2, y: 0 };
  assert.equal(orderedSubsequence([a, b], [a, b]), true);
  assert.equal(orderedSubsequence([b, a], [a, b]), false);
  assert.equal(orderedSubsequence([a], [a, a]), false);
  assert.equal(orderedSubsequence([a, b, a], [a, a]), true);
});

test("project workflow requires saving, retrieving and replaying the same independent artifact", async () => {
  const activity = safeChoiceActivities.find((item) => item.inventoryId === "Y1.24")!;
  let state = initialActivityState(activity);
  state.completed = ["discover", "predict", "build", "practise", "debug"];
  state.stage = "create";
  const artifact = currentVariant(activity, state).reference;
  const step = async (extra: Partial<ActivityAction>) => {
    const transition = await transitionActivity(activity, state, action("create", { artifact, ...extra }), deps);
    state = transition.state;
    return transition;
  };
  assert.equal((await step({})).passed, false);
  await step({ action: "save" });
  await step({ action: "run" });
  assert.equal((await step({})).passed, false, "Saving and running alone cannot impersonate retrieving a version");
  // Store and author-preview adapters resolve and authorise versionId before
  // invoking this internal transition with the retrieved artifact.
  await step({ action: "version" });
  assert.equal((await step({})).passed, false, "Replay must happen after retrieval, not before it");
  await step({ action: "run" });
  assert.equal((await step({})).passed, true);
  const changed = structuredClone(artifact);
  if (changed.type === "visual") (changed.document as Record<string, unknown>).explanation = "A changed draft";
  assert.equal((await step({ artifact: changed })).passed, false, "Workflow evidence cannot carry over to changed content");
});
test("planning mastery requires a matching plan recorded while the coding area was empty", async () => {
  const activity = robotInputActivities[0]!;
  let state = initialActivityState(activity);
  state.completed = ["discover", "predict"]; state.stage = "build";
  const step = async (extra: Partial<ActivityAction>) => {
    const result = await transitionActivity(activity, state, action(state.stage, extra), deps);
    state = result.state; return result;
  };
  await assert.rejects(() => step({ action: "run", artifact: activity.reference }), /Record/);
  await assert.rejects(() => step({ action: "plan", artifact: activity.reference }), /coding area is empty/);
  const saved = await step({ action: "save", artifact: activity.reference });
  assert.equal(saved.versionLabel, "saved-work", "An unplanned draft remains saveable without earning planning evidence");
  const planOnly = structuredClone(activity.reference);
  if (planOnly.type === "visual") (planOnly.document as Record<string, Json>).handlers = { start: [] };
  const planned = await step({ action: "plan", artifact: planOnly });
  assert.equal(planned.versionLabel, "recorded-plan");
  assert.equal((await step({ action: "run", artifact: activity.reference })).state.lastExecution?.ok, true);
  assert.equal((await step({ artifact: activity.reference })).passed, true);
  state.completed = ["discover", "predict", "build", "practise", "debug"]; state.stage = "create";
  const independent = currentVariant(activity, state).reference;
  assert.equal((await step({ artifact: independent })).passed, false, "Build's planning record cannot replace a fresh independent plan");
});
test("pending explanation review preserves practical progress and does not count as a failed assessment", async () => {
  const activity = firstRouteActivities[0]!, state = initialActivityState(activity);
  state.completed = ["discover", "predict", "build", "practise", "debug", "create"]; state.stage = "review";
  state.artifacts.create = currentVariant(activity, state).reference;
  const result = await transitionActivity(activity, state, action("review", { action: "reflect", explanation: "My arrow goes right because that reaches the delivery stop." }), { ...deps, reflect: async () => ({ passed: false, pending: true, source: "evidence", confidence: 0, message: "The practical work is saved; verified review is still required." }) });
  assert.equal(result.newlyMastered, false); assert.equal(result.state.mastered, false);
  assert.equal(result.state.attempts, state.attempts); assert.ok(result.state.completed.includes("create"));
  assert.equal(result.state.explanationReview?.pending, true); assert.equal(result.state.explanation.includes("arrow goes right"), true);
});

for (const activity of [
  ...firstRouteActivities, ...mediaCardActivities, ...patternActivities, ...safeChoiceActivities,
  ...firstRouteRetrievalActivities, ...cardRetrievalActivities, ...patternRetrievalActivities, ...safeCreatorRetrievalActivities,
  ...robotInputActivities, ...animatedStoryActivities, ...pictureDataActivities, ...communityCreatorActivities,
  ...robotRetrievalActivities, ...storyRetrievalActivities, ...dataRetrievalActivities, ...communityRetrievalActivities,
  ...animationBuilderActivities, ...mazeBuilderActivities, ...sensorRobotActivities, ...networkBuilderActivities,
  ...animationRetrievalActivities, ...mazeRetrievalActivities, ...sensorRetrievalActivities, ...networkRetrievalActivities,
  ...stateGameActivities, ...reusableStoryActivities, ...evidencePosterActivities, ...teamRoleActivities, ...teamSafetyActivities, ...audienceGameActivities,
  ...stateRetrievalActivities,
  ...reusableRetrievalActivities,
  ...evidenceRetrievalActivities,
  ...teamRetrievalActivities,
  ...rescueAlgorithmActivities,
  ...rescueRetrievalActivities,
  ...connectedWebActivities,
]) {
  test(`${activity.inventoryId}: actual references pass, the seeded fault fails, and every independent variant executes`, async () => {
    const examples: Array<[PracticalArtifact, PracticalCase[]]> = [
      [activity.reference, activity.cases], [activity.debugReference, activity.debugCases],
      ...activity.independent.map((variant): [PracticalArtifact, PracticalCase[]] => [variant.reference, variant.cases]),
    ];
    for (const [artifact, cases] of examples) {
      for (const fixture of cases) {
        const execution = await executePractical(activity.workbench, artifact, fixture.input);
        assert.equal(execution.ok, true, execution.error);
        assert.ok(checkExecution(execution, fixture.assertions).every((check) => check.passed), fixture.id);
      }
    }
    const faulty = await executePractical(activity.workbench, activity.faulty, activity.debugCases[0]!.input);
    assert.ok(checkExecution(faulty, activity.debugCases[0]!.assertions).some((check) => !check.passed));
  });
}

test("a complete real practical journey requires prediction, debugging, independent execution and reflection", async () => {
  const activity = firstRouteActivities[0]!;
  let state = initialActivityState(activity);
  const step = async (input: ActivityAction) => { const result = await transitionActivity(activity, state, input, deps); state = result.state; return result; };
  await assert.rejects(() => step(action("create")), /earlier/);
  await step(action("discover"));
  await assert.rejects(() => step(action("predict", { action: "run" })), /prediction/);
  await step(action("predict", { action: "predict", choiceId: activity.prediction.correctId }));
  await step(action("build", { artifact: activity.reference }));
  await step(action("practise", { artifact: activity.reference }));
  await assert.rejects(() => step(action("debug", { artifact: activity.faulty })), /seeded fault/);
  await step(action("debug", { artifact: activity.debugReference }));
  const independent = currentVariant(activity, state);
  await step(action("create", { artifact: independent.reference }));
  assert.equal(state.mastered, false);
  const first = await step(action("review", { action: "reflect", explanation: "The route goes right and the trace reaches its destination." }));
  assert.equal(first.newlyMastered, true);
  assert.equal(state.mastered, true);
  const savedMastery = structuredClone(state.masteredArtifact);
  const repeat = await step(action("review", { action: "reflect", explanation: "The route reaches its destination in the trace." }));
  assert.equal(repeat.newlyMastered, false);
  await step(action("build", { action: "save", artifact: activity.starter }));
  assert.deepEqual(state.masteredArtifact, savedMastery);
  assert.equal(publicActivityView(activity, state).lastExecution, null);
});

test("answer disclosure survives restoring starters and cannot earn independent mastery", async () => {
  const activity = firstRouteActivities[0]!;
  const state: ActivityState = { ...initialActivityState(activity), completed: ["discover", "predict", "build", "practise", "debug"], stage: "create" };
  const helped = await transitionActivity(activity, state, action("create", { action: "hint" }), {
    ...deps, teach: async () => ({ message: "A disclosed solution", source: "model", revealing: true }),
  });
  assert.ok(helped.state.assistedVariantIds.includes(variantFingerprint(activity, state)));
  await assert.rejects(() => transitionActivity(activity, helped.state, action("create", { artifact: currentVariant(activity, state).reference }), deps), /disclosed/);
  const restored = await transitionActivity(activity, helped.state, action("create", { action: "restore" }), deps);
  assert.notEqual(variantFingerprint(activity, restored.state), variantFingerprint(activity, state));
  assert.deepEqual(restored.state.assistedVariantIds, helped.state.assistedVariantIds);
});

test("execution infrastructure failure leaves the caller's state and attempt count untouched", async () => {
  const activity = firstRouteActivities[0]!, state = initialActivityState(activity), before = structuredClone(state);
  await assert.rejects(() => transitionActivity(activity, state, action("discover"), {
    ...deps, run: async () => { throw new Error("runner unavailable"); },
  }), /runner unavailable/);
  assert.deepEqual(state, before);
});

test("primary teaching is cached separately from requested hints and does not invent help exhaustion", async () => {
  const activity = firstRouteActivities[0]!, state = initialActivityState(activity);
  let calls = 0;
  const teaching = { ...deps, teach: async () => { calls++; return { message: "Each arrow performs one action.", source: "model" as const, revealing: true }; } };
  const first = await transitionActivity(activity, state, action("discover", { action: "teach" }), teaching);
  const second = await transitionActivity(activity, first.state, action("discover", { action: "teach" }), teaching);
  assert.equal(calls, 1);
  assert.deepEqual(second.state.hints, {});
  assert.equal(second.state.tutorMessages[0]!.purpose, "instruction");
  assert.equal(second.state.mastered, false);
});

test("saving a review explanation does not change the independent program or award mastery", async () => {
  const activity = firstRouteActivities[0]!, state = initialActivityState(activity);
  state.completed = ["discover", "predict", "build", "practise", "debug", "create"];
  state.artifacts.create = activity.independent[0]!.reference;
  const saved = await transitionActivity(activity, state, action("review", { action: "save", artifact: activity.starter, explanation: "My explanation draft" }), deps);
  assert.equal(saved.state.explanation, "My explanation draft");
  assert.deepEqual(saved.state.artifacts.create, state.artifacts.create);
  assert.equal(saved.newlyMastered, false);
  assert.equal(saved.state.mastered, false);
});
