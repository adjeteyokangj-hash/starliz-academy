import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { activityDefinition } from "../src/lib/coding/learning/catalogue";
import { executePractical } from "../src/lib/coding/learning/runtime";
import { visualReview } from "../src/lib/coding/learning/visual-review";
import type { reviewExplanation } from "../src/lib/coding/learning/teacher";

test("extended review never sends restricted context; permitted older learners retain grounded model review", async () => {
  const previous = process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED; delete process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED;
  const fixture = { keyReads: 0, modelCalls: 0 };
  const global = globalThis as typeof globalThis & { __correctionPrivacy?: typeof fixture }; global.__correctionPrivacy = fixture;
  try {
    const bundle = await build({ entryPoints: ["src/lib/coding/learning/teacher.ts"], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "no-live-provider", setup(api) {
      api.onResolve({ filter: /api-key-config|model-json/ }, args => ({ path: args.path, namespace: "fixture" }));
      api.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", contents: args.path.includes("api-key-config") ? 'export async function getOpenAiApiKey(){globalThis.__correctionPrivacy.keyReads++;return "fictional-key"}' : 'export async function requestCoachJson(_key,_system,raw){globalThis.__correctionPrivacy.modelCalls++;const data=JSON.parse(raw);return {supported:true,confidence:0.95,evidenceQuote:data.explanation,feedback:"The explanation is supported by this observed result."}}' }));
    } }] });
    const loadedModule = { exports: {} as { reviewExplanation: typeof reviewExplanation } };
    new Function("require", "module", "exports", bundle.outputFiles[0]!.text)(createRequire(import.meta.url), loadedModule, loadedModule.exports);
    const review = loadedModule.exports.reviewExplanation, activity = activityDefinition("Y1.14")!, artifact = activity.independent[0]!.reference;
    const run = await executePractical(activity.workbench, artifact, activity.independent[0]!.cases[0]!.input);
    const choices = visualReview(activity, artifact, run)!;
    const submission = JSON.stringify({ type: "visual-review-v1", binding: choices.public.binding, answers: choices.correct });
    for (const age of [7, 12, null]) { assert.equal((await review(activity, artifact, run, submission, { kind: "learner", age })).passed, true); assert.equal((await review(activity, artifact, run, "it works", { kind: "learner", age })).passed, false); }
    assert.deepEqual(fixture, { keyReads: 0, modelCalls: 0 });
    const advanced = activityDefinition("Y11.13")!;
    const pending = await review(advanced, advanced.independent[0]!.reference, run, "My project works", { kind: "learner", age: null });
    assert.equal(pending.pending, true); assert.equal(pending.passed, false); assert(pending.message.includes(advanced.objective)); assert.equal(fixture.modelCalls, 0);
    const count = (run.output as { moves: number }).moves;
    const permitted = await review(activity, artifact, run, `My repeat makes ${count} moves because each instruction inside the repeat runs in order.`, { kind: "learner", age: 14 });
    assert.equal(permitted.source, "model"); assert.equal(permitted.passed, true); assert.deepEqual(fixture, { keyReads: 1, modelCalls: 1 });
    assert.equal((await review(activity, artifact, run, "it works", { kind: "learner", age: 14 })).passed, false, "A permissive model fixture cannot override the local meaningful-evidence gate");
  } finally { delete global.__correctionPrivacy; if (previous === undefined) delete process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED; else process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED = previous; }
});
