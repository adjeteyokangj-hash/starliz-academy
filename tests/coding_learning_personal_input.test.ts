import test from "node:test";
import assert from "node:assert/strict";
import { functionDataActivities } from "../src/lib/coding/learning/content/functions-and-data";
import { initialActivityState, transitionActivity, artifactHash } from "../src/lib/coding/learning/state-machine";
import { personalInputProfile, restoredPersonalInput } from "../src/lib/coding/learning/personal-input";
import { personalInputSchema, type Json } from "../src/lib/coding/learning/types";
import { publicActivityView } from "../src/lib/coding/learning/public-view";

test("personal inputs persist without granting mastery or replacing protected fixtures", async () => {
  const activity = functionDataActivities[0]!, observed: Json[] = [];
  const state = initialActivityState(activity); state.stage = "build"; state.completed = ["discover", "predict"]; state.files = { "notes.txt": "owned saved file" };
  const deps = {
    run: async (_engine: unknown, _artifact: unknown, input: Json) => { observed.push(structuredClone(input)); return { ok: true, output: {}, trace: [], stdout: "", stderr: "", runtime: "unit transport contract only", steps: 0 }; },
    teach: async () => ({ message: "Unused", source: "fallback" as const, revealing: false }),
    reflect: async () => ({ passed: false, message: "Unused", source: "evidence" as const, confidence: 0 }),
  };
  const saved = await transitionActivity(activity, state, { action: "save", stage: "build", revision: "unit", artifact: activity.reference, testInput: { variables: { amount: 12, other: -4 } } }, deps);
  assert.equal(observed.length, 0, "Saving needs no interpreter");
  assert.equal(saved.state.mastered, false);
  assert.deepEqual(publicActivityView(activity, saved.state).personalInput?.input, { variables: { amount: 12, other: -4 } });
  const resumed = await transitionActivity(activity, JSON.parse(JSON.stringify(saved.state)), { action: "run", stage: "build", revision: "unit" }, deps);
  assert.deepEqual(observed[0], { variables: { amount: 12, other: -4 }, files: state.files });
  assert.equal(resumed.state.lastRunKind, "personal");
  assert.deepEqual(publicActivityView(activity, resumed.state).executionInput, observed[0]);
  assert.equal(resumed.state.attempts, 0);
  await assert.rejects(() => transitionActivity(activity, resumed.state, { action: "check", stage: "build", revision: "unit", testInput: { variables: {} } }, deps), /assessment inputs remain protected/);
  const checked = await transitionActivity(activity, resumed.state, { action: "check", stage: "build", revision: "unit" }, deps);
  assert.deepEqual(observed.slice(1), activity.cases.map((item) => item.input));
  assert.equal(checked.state.lastRunKind, "assessment");
  const supplied = await transitionActivity(activity, resumed.state, { action: "run", stage: "build", revision: "unit", testInput: null }, deps);
  assert.equal(supplied.state.lastRunKind, "example");
  assert.equal(supplied.state.personalInputs?.build?.enabled, false);
  assert.deepEqual(state.personalInputs, undefined, "Original state is immutable");
});

test("personal input schema and version restoration reject protected controls and malformed snapshots", () => {
  assert.equal(personalInputSchema.safeParse({ files: { "notes.txt": "forged" } }).success, false);
  assert.equal(personalInputSchema.safeParse({ variables: JSON.parse('{"__proto__":3}') }).success, false);
  assert.equal(personalInputSchema.safeParse({ stdin: "x".repeat(8193) }).success, false);
  assert.equal(personalInputSchema.safeParse({ variables: { amount: Infinity } }).success, false);
  const artifact = functionDataActivities[0]!.reference, hash = artifactHash(artifact);
  assert.equal(restoredPersonalInput({ artifactHash: "another", input: {}, enabled: true }, hash), null);
  assert.equal(restoredPersonalInput({ artifactHash: hash, input: { files: {} }, enabled: true }, hash), null);
  assert.deepEqual(restoredPersonalInput({ artifactHash: hash, input: { variables: { amount: 5 } }, enabled: true }, hash), { artifactHash: hash, input: { variables: { amount: 5 } }, enabled: true });
  assert.equal(personalInputProfile({ type: "source", language: "javascript", entry: "dom", source: "" }, { variables: {} }), null);
  assert.equal(personalInputProfile({ type: "source", language: "sql", source: "" }, {}), null);
});
