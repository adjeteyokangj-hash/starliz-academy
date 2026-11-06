import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { firstRouteActivities } from "../src/lib/coding/learning/content/routes";
import { executePractical } from "../src/lib/coding/learning/runtime";
import { visualReview } from "../src/lib/coding/learning/visual-review";

test("explanation review distinguishes privacy blocking from unavailable verification without granting mastery", async () => {
  const fixture = { allowed: false, keyReads: 0, modelCalls: 0 };
  const holder = globalThis as typeof globalThis & { __explanationPending?: typeof fixture };
  holder.__explanationPending = fixture;
  try {
    const bundle = await build({ entryPoints: ["src/lib/coding/learning/teacher.ts"], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "fictional-provider-boundary", setup(api) {
      const sources: Record<string, string> = {
        "@/lib/api-key-config": "export async function getOpenAiApiKey(){globalThis.__explanationPending.keyReads++;return null}",
        "@/lib/coach/model-json": "export async function requestCoachJson(){globalThis.__explanationPending.modelCalls++;throw Error('No live requests permitted')}",
        "./tutor-privacy": "export function personalisedTutorAllowed(){return globalThis.__explanationPending.allowed}export const redactTutorData=x=>x;export const redactTutorText=x=>x;",
      };
      api.onResolve({ filter: /api-key-config|model-json|tutor-privacy/ }, args => sources[args.path] ? { path: args.path, namespace: "fictional" } : undefined);
      api.onLoad({ filter: /.*/, namespace: "fictional" }, args => ({ loader: "js", contents: sources[args.path]! }));
    } }] });
    const handlerModule = { exports: {} as { reviewExplanation: (...args: unknown[]) => Promise<{ passed: boolean; pending?: boolean; message: string }> } };
    new Function("require", "module", "exports", bundle.outputFiles[0]!.text)(createRequire(import.meta.url), handlerModule, handlerModule.exports);
    const activity = { year: 1, concepts: ["command", "action"] };
    const run = { ok: true, output: { x: 1, y: 0, visits: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }, trace: [] };
    const blocked = await handlerModule.exports.reviewExplanation(activity, {}, run, "My arrow goes right.");
    assert.equal(blocked.passed, false); assert.equal(blocked.pending, true);
    assert.match(blocked.message, /blocked.*privacy settings/);
    assert.match(blocked.message, /No AI review is running/);
    assert.equal(fixture.keyReads, 0); assert.equal(fixture.modelCalls, 0);
    const supported = firstRouteActivities[0]!, artifact = supported.independent[0]!.reference;
    const observed = await executePractical(supported.workbench, artifact, supported.independent[0]!.cases[0]!.input);
    const challenge = visualReview(supported, artifact, observed)!;
    const local = await handlerModule.exports.reviewExplanation(supported, artifact, observed, JSON.stringify({ type: "visual-review-v1", binding: challenge.public.binding, answers: challenge.correct }));
    assert.equal(local.passed, true, "The reviewed objective-specific rubric works without provider access");
    assert.equal(fixture.keyReads, 0); assert.equal(fixture.modelCalls, 0);
    fixture.allowed = true;
    const unavailable = await handlerModule.exports.reviewExplanation(activity, {}, run, "My arrow goes right.");
    assert.equal(unavailable.passed, false); assert.equal(unavailable.pending, true);
    assert.match(unavailable.message, /service could not complete verification/);
    assert.equal(fixture.keyReads, 1); assert.equal(fixture.modelCalls, 0);
  } finally { delete holder.__explanationPending; }
});
