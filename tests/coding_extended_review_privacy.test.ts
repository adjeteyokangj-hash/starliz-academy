import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { authoredActivities } from "../src/lib/coding/learning/catalogue";
import { executePractical } from "../src/lib/coding/learning/runtime";
import { visualReview } from "../src/lib/coding/learning/visual-review";
import { publicActivityView } from "../src/lib/coding/learning/public-view";
import { artifactHash, initialActivityState } from "../src/lib/coding/learning/state-machine";
import type { reviewExplanation } from "../src/lib/coding/learning/teacher";

test("new local Review never reads provider keys for young/unknown learners and preserves permitted provider review", async () => {
  const prior = process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED; delete process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED;
  const fixture = { keyReads: 0, modelCalls: 0 };
  const holder = globalThis as typeof globalThis & { __extendedPrivacy?: typeof fixture }; holder.__extendedPrivacy = fixture;
  try {
    const bundle = await build({ entryPoints: ["src/lib/coding/learning/teacher.ts"], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "isolated-provider", setup(api) {
      api.onResolve({ filter: /api-key-config|model-json/ }, args => ({ path: args.path, namespace: "fixture" }));
      api.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", contents: args.path.includes("api-key-config") ? 'export async function getOpenAiApiKey(){globalThis.__extendedPrivacy.keyReads++;return "fictional-key"}' : 'export async function requestCoachJson(_key,_system,raw){globalThis.__extendedPrivacy.modelCalls++;return {supported:true,confidence:0.95,evidenceQuote:JSON.parse(raw).explanation,feedback:"Your explanation matches the observed result."}}' }));
    } }] });
    const loaded = { exports: {} as { reviewExplanation: typeof reviewExplanation } };
    new Function("require", "module", "exports", bundle.outputFiles[0]!.text)(createRequire(import.meta.url), loaded, loaded.exports);
    const review = loaded.exports.reviewExplanation;
    const activity = authoredActivities.find(activity => activity.inventoryId === "Y2.02")!, artifact = activity.independent[0]!.reference;
    const execution = await executePractical(activity.workbench, artifact, activity.independent[0]!.cases[0]!.input);
    const context = { ownershipKey: "private-fixture-child", independentVariant: 0 };
    const challenge = visualReview(activity, artifact, execution, context)!;
    const submission = JSON.stringify({ type: "visual-review-v1", binding: challenge.public.binding, answers: challenge.correct, passed: true });
    for (const age of [7, 12, null]) {
      const scope = { kind: "learner" as const, age, reviewContext: context.ownershipKey, reviewVariant: 0 };
      assert.equal((await review(activity, artifact, execution, submission, scope)).passed, true);
      assert.equal((await review(activity, artifact, execution, JSON.stringify({ type: "visual-review-v1", binding: challenge.public.binding, answers: {}, passed: true, mastered: true }), scope)).passed, false);
      assert.equal((await review(activity, artifact, execution, "it works", scope)).passed, false);
    }
    assert.deepEqual(fixture, { keyReads: 0, modelCalls: 0 });
    const output = execution.output as { moves: number; x: number };
    const explanation = `The forward command follows the heading because a turn changes the direction of the later moves. The trace has ${output.moves} moves and ends in column ${output.x}.`;
    assert.equal((await review(activity, artifact, execution, explanation, { kind: "learner", age: 14 })).passed, true);
    assert.deepEqual(fixture, { keyReads: 1, modelCalls: 1 });
    assert.equal((await review(activity, artifact, execution, "it works", { kind: "learner", age: 14 })).passed, false);
    const gap = authoredActivities.find(activity => activity.inventoryId === "Y6.08")!, state = initialActivityState(gap);
    state.stage = "review"; state.completed = ["discover", "predict", "build", "practise", "debug", "create"]; state.artifacts.create = gap.independent[0]!.reference;
    state.lastRunStage = "create"; state.lastRunArtifactHash = artifactHash(state.artifacts.create);
    const view = publicActivityView(gap, state, "learner", { kind: "learner", age: null });
    assert.equal(view.visualReviewSupported, false); assert.equal(view.mastered, false); assert.match(view.reviewPendingReason!, /browser observations/);
  } finally { delete holder.__extendedPrivacy; if (prior === undefined) delete process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED; else process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED = prior; }
});
