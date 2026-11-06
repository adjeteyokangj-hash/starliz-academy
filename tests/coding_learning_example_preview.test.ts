import test from "node:test";
import assert from "node:assert/strict";
import { firstRouteActivities } from "../src/lib/coding/learning/content/routes";
import { initialActivityState, artifactHash } from "../src/lib/coding/learning/state-machine";
import { publicActivityView } from "../src/lib/coding/learning/public-view";
import type { Execution } from "../src/lib/coding/learning/types";

test("permanent lesson reference exposes the approved example, never independent assessor source", () => {
  const activity = structuredClone(firstRouteActivities[0]!);
  activity.example = { type: "source", language: "python", source: "print('APPROVED_TEACHING_EXAMPLE')" };
  activity.reference = { type: "source", language: "python", source: "print('ASSESSOR_REFERENCE_ONLY')" };
  for (const variant of activity.independent) variant.reference = { type: "source", language: "python", source: "print('INDEPENDENT_ASSESSOR_ONLY')" };
  const state = initialActivityState(activity);
  state.stage = "create";
  const view = publicActivityView(activity, state);
  assert.deepEqual(view.lessonExample.artifact, activity.example);
  assert.match(JSON.stringify(view.lessonExample), /APPROVED_TEACHING_EXAMPLE/);
  assert.doesNotMatch(JSON.stringify(view), /ASSESSOR_REFERENCE_ONLY|INDEPENDENT_ASSESSOR_ONLY/);
  assert.equal("correctId" in view.activity.prediction, false);
});

test("running a learner program with example input is still learner output", () => {
  const activity = firstRouteActivities[0]!, state = initialActivityState(activity);
  state.stage = "build"; state.artifacts.build = activity.reference;
  state.lastRunStage = "build"; state.lastRunArtifactHash = artifactHash(activity.reference); state.lastRunKind = "example";
  const metadata: Execution = { ok: true, output: {}, trace: [], stdout: "", stderr: "", runtime: "serialization-contract-only", steps: 0 };
  state.lastExecution = metadata;
  const view = publicActivityView(activity, state);
  assert.equal(view.executionKind, "example");
  assert.equal(view.executionProgram, "learner");
  assert.equal(view.lastExecution, metadata);
  assert.deepEqual(view.lessonExample.artifact, activity.example);
});

test("a teaching demonstration cannot be labelled as My Program", () => {
  const activity = firstRouteActivities[0]!, state = initialActivityState(activity);
  state.lastRunStage = "discover"; state.lastRunArtifactHash = artifactHash(activity.example); state.lastRunKind = "example";
  state.lastExecution = { ok: true, output: {}, trace: [], stdout: "", stderr: "", runtime: "serialization-contract-only", steps: 0 };
  assert.equal(publicActivityView(activity, state).executionProgram, "lesson");
  state.stage = "build";
  assert.equal(publicActivityView(activity, state).executionProgram, null);
});
