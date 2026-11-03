import test from "node:test";
import assert from "node:assert/strict";
import { functionDataActivities } from "../src/lib/coding/learning/content/functions-and-data";
import { initialActivityState, transitionActivity } from "../src/lib/coding/learning/state-machine";
import type { Json, Execution } from "../src/lib/coding/learning/types";
import { stageProjectFiles } from "../src/lib/coding/learning/stage-files";

test("readonly source examples use their fixture and cannot overwrite the learner's saved project files", async () => {
  const activity = functionDataActivities[0]!, state = initialActivityState(activity);
  state.stage = "build"; state.completed = ["discover", "predict"]; state.files = { "private-report.html": "<h1>Existing private creation</h1>", "records.json": '[{"id":"retained","quantity":0}]' };
  state.prediction = { choiceId: activity.prediction.correctId, correct: true, recordedAt: new Date().toISOString() };
  const inputs: Json[] = [];
  const deps = { run: async (_engine: unknown, _artifact: unknown, input: Json): Promise<Execution> => { inputs.push(input); return { ok: true, output: { variables: {}, files: { "example.html": "<h1>Canonical example</h1>" } }, trace: [], stdout: "", stderr: "", runtime: "unit-contract-only", steps: 1 }; }, teach: async () => ({ message: "Unused", source: "fallback" as const, revealing: false }), reflect: async () => ({ passed: false, message: "Unused", source: "evidence" as const, confidence: 0 }) };
  for (const stage of ["discover", "predict"] as const) {
    const viewed = await transitionActivity(activity, state, { action: "run", stage, revision: "unit" }, deps);
    assert.deepEqual(stageProjectFiles(viewed.state, "build"), state.files, "Worked examples cannot overwrite a learner creation");
    assert.deepEqual(viewed.state.files, { "example.html": "<h1>Canonical example</h1>" }, "The read-only stage can display its own actually returned files");
    const supplied = inputs.at(-1) as Record<string, Json>;
    assert.notDeepEqual(supplied.files, state.files, "Saved learner data must not change the canonical worked example");
    assert.equal(viewed.state.mastered, false);
  }
  assert.equal(state.files["private-report.html"], "<h1>Existing private creation</h1>");
});

test("editable source runs can retain bounded HTML/CSS text while path escapes remain refused", async () => {
  const activity = functionDataActivities[0]!, state = initialActivityState(activity); state.completed = ["discover", "predict"];
  let files: Record<string, string> = { "report.html": "<script>INERT_SAVED_SOURCE</script>", "report.css": "body{color:#111}" };
  const deps = { run: async (): Promise<Execution> => ({ ok: true, output: { variables: {}, files }, trace: [], stdout: "", stderr: "", runtime: "unit-contract-only", steps: 1 }), teach: async () => ({ message: "Unused", source: "fallback" as const, revealing: false }), reflect: async () => ({ passed: false, message: "Unused", source: "evidence" as const, confidence: 0 }) };
  const saved = await transitionActivity(activity, state, { action: "run", stage: "build", revision: "unit", artifact: activity.reference }, deps);
  assert.deepEqual(saved.state.files, files); assert.equal(saved.state.mastered, false);
  files = { "../outside.html": "refused" };
  await assert.rejects(() => transitionActivity(activity, state, { action: "run", stage: "build", revision: "unit", artifact: activity.reference }, deps), /supported names/);
  assert.deepEqual(state.files, {}, "An invalid returned filename cannot mutate the original saved state");
});
