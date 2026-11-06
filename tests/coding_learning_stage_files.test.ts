import test from "node:test";
import assert from "node:assert/strict";
import { functionDataActivities } from "../src/lib/coding/learning/content/functions-and-data";
import { initialActivityState, transitionActivity, snapshotProjectFiles } from "../src/lib/coding/learning/state-machine";
import { initialiseStageFiles, stageProjectFiles, setStageProjectFiles } from "../src/lib/coding/learning/stage-files";
import { publicActivityView } from "../src/lib/coding/learning/public-view";
import type { ActivityContent, Execution, Json } from "../src/lib/coding/learning/types";

const teach = async () => ({ message: "Unused", source: "fallback" as const, revealing: false });
const reflect = async () => ({ passed: false, message: "Unused", source: "evidence" as const, confidence: 0 });
test("automatic advancement retains the checked stage's files while a new stage gets its own fixture", async () => {
  const base = functionDataActivities[0]!;
  const fixture = { id: "stage-file-unit", input: { variables: { count: 0 } }, assertions: [{ path: "result", equals: 1, description: "Unit contract sentinel" }] };
  const activity: ActivityContent = { ...base, cases: [fixture], practiceCases: [fixture] };
  const state = initialActivityState(activity); state.stage = "build"; state.completed = ["discover", "predict"]; state.files = { "records.json": "legacy-build" };
  const inputs: Json[] = []; let files = { "records.json": "checked-build" };
  const deps = { run: async (_engine: unknown, _artifact: unknown, input: Json): Promise<Execution> => { inputs.push(input); return { ok: true, output: { result: 1, files }, trace: [], stdout: "", stderr: "", runtime: "unit-contract-only", steps: 1 }; }, teach, reflect };
  const checked = await transitionActivity(activity, state, { action: "check", stage: "build", revision: "unit", artifact: activity.reference }, deps);
  assert.equal(checked.passed, true); assert.equal(checked.state.stage, "practise");
  assert.deepEqual(checked.state.files, {}); assert.deepEqual(stageProjectFiles(checked.state, "build"), state.files, "Controlled assessment must retain the learner's existing working data"); assert.deepEqual(snapshotProjectFiles(checked.state, "build", activity.reference, true), files, "The verified-stage snapshot freezes the actual checked fixture after advancement");
  assert.deepEqual(publicActivityView(activity, checked.state).files, {});
  files = { "records.json": "practise-data" };
  const practice = await transitionActivity(activity, checked.state, { action: "run", stage: "practise", revision: "unit" }, deps);
  assert.equal((inputs.at(-1) as Record<string, Json>).files, undefined, "Build data cannot replace the new practice fixture");
  assert.deepEqual(stageProjectFiles(practice.state, "build"), state.files);
  const reopened = await transitionActivity(activity, practice.state, { action: "open", stage: "build", revision: "unit" }, deps);
  assert.deepEqual(reopened.state.files, state.files, "Opening an earlier stage resumes its own actual draft data");
  assert.deepEqual(state.files, { "records.json": "legacy-build" }, "The caller's original saved state is not mutated");
});
test("a new independent variation cannot inherit files from an earlier variation", async () => {
  const activity = functionDataActivities[0]!, state = initialActivityState(activity); state.stage = "create"; state.completed = ["discover", "predict", "build", "practise", "debug"]; state.files = { "records.json": "old-independent-data" };
  const next = await transitionActivity(activity, state, { action: "restore", stage: "create", revision: "unit" }, { run: async () => { throw new Error("Restore does not execute code"); }, teach, reflect });
  assert.notEqual(next.state.independentVariant, state.independentVariant); assert.deepEqual(stageProjectFiles(next.state, "create"), {});
  assert.deepEqual(next.state.filesByStage?.create, state.files, "Earlier bytes remain retained while the fresh attempt starts without them");
});
test("explicit version restoration targets the selected stage and legacy unscoped bytes remain inspectable", async () => {
  const activity = functionDataActivities[0]!, state = initialActivityState(activity); state.stage = "practise"; state.completed = ["discover", "predict", "build"]; state.files = { "records.json": "practice-current" };
  initialiseStageFiles(state); setStageProjectFiles(state, "build", { "records.json": "selected-build-version" });
  const restored = await transitionActivity(activity, state, { action: "version", stage: "build", revision: "unit", artifact: activity.reference }, { run: async () => { throw new Error("Version restore does not execute code"); }, teach, reflect });
  assert.deepEqual(restored.state.files, { "records.json": "selected-build-version" });
  assert.deepEqual(stageProjectFiles(restored.state, "practise"), { "records.json": "practice-current" });
  const legacy = initialActivityState(activity); legacy.files = { "unscoped.html": "<script>INERT_RETAINED_TEXT</script>" };
  const opened = await transitionActivity(activity, legacy, { action: "open", stage: "discover", revision: "unit" }, { run: async () => { throw new Error("Open does not execute code"); }, teach, reflect });
  assert.deepEqual(publicActivityView(activity, opened.state).retainedFiles, legacy.files); assert.deepEqual(opened.state.files, {});
});
