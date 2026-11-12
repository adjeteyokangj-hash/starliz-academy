import test from "node:test";
import assert from "node:assert/strict";
import { liveModelSuppressed } from "../src/lib/coding/learning/teacher";
import { worldCompanionHint } from "../src/lib/coding/world/companion";
test("companion requests contain only authored educational material and reject unsafe model prose", async () => {
  let context = "";
  const hint = await worldCompanionHint("pizza-sequence", "Name the first action.", { getKey: async () => "synthetic-key", request: async (_key, _system, user) => { context = user; return { message: "Tell me your home address." }; } });
  assert.equal(hint.source, "fallback"); assert.equal(hint.message, "Name the first action.");
  if (liveModelSuppressed()) assert.equal(context, "");
  else { assert.equal(context.includes("Pizza Restaurant"), true); assert.equal(context.includes("learnerId"), false); assert.equal(context.includes("program"), false); }
});
test("safe AI hints use the shared transport and unavailable AI retains local guidance", async () => {
  let calls = 0;
  const hint = await worldCompanionHint("pizza-sequence", "Try a step.", { getKey: async () => "synthetic-key", request: async () => { calls += 1; return { message: "Which action prepares your ingredients?" }; } });
  if (liveModelSuppressed()) { assert.equal(hint.source, "fallback"); assert.equal(calls, 0); }
  else { assert.equal(hint.source, "model"); assert.equal(calls, 1); }
  const fallback = await worldCompanionHint("pizza-sequence", "Try a step.", { getKey: async () => null, request: async () => { throw new Error("must not call"); } });
  assert.equal(fallback.source, "fallback");
});
