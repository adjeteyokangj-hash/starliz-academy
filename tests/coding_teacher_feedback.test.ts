import test from "node:test";
import assert from "node:assert/strict";
import { firstRouteActivities } from "../src/lib/coding/learning/content/routes";
import { initialActivityState, transitionActivity, variantFingerprint } from "../src/lib/coding/learning/state-machine";
import { executePractical } from "../src/lib/coding/learning/runtime";
import { stateAfterTeacherFeedback } from "../src/lib/coding/teacher-feedback-policy";

const activity = firstRouteActivities[0]!;
const deps = { run: executePractical, teach: async () => ({ message: "Review your own route.", source: "fallback" as const, revealing: false }), reflect: async () => ({ passed: true, message: "Reviewed", source: "evidence" as const, confidence: 1 }) };
test("teacher feedback cannot leave the current independent task eligible for unassisted mastery", async () => {
  const original = initialActivityState(activity);
  original.stage = "create"; original.completed = ["discover", "predict", "build", "practise", "debug"];
  const assisted = stateAfterTeacherFeedback(activity, original), fingerprint = variantFingerprint(activity, original);
  assert.deepEqual(original.assistedVariantIds, [], "The previously loaded state is not mutated");
  assert.deepEqual(assisted.assistedVariantIds, [fingerprint]);
  await assert.rejects(() => transitionActivity(activity, assisted, { action: "check", stage: "create", revision: "test" }, deps), /solution was disclosed/);
  const restored = await transitionActivity(activity, assisted, { action: "restore", stage: "create", revision: "test" }, deps);
  assert.notEqual(variantFingerprint(activity, restored.state), fingerprint);
  assert.deepEqual(restored.state.assistedVariantIds, [fingerprint], "Taking a fresh task does not erase the assistance record");
});
test("review-stage feedback also taints the current attempt while existing independent achievements remain intact", () => {
  const state = initialActivityState(activity); state.stage = "review";
  const reviewed = stateAfterTeacherFeedback(activity, state);
  assert.equal(reviewed.assistedVariantIds.length, 1);
  assert.equal(stateAfterTeacherFeedback(activity, reviewed).assistedVariantIds.length, 1);
  state.mastered = true;
  assert.deepEqual(stateAfterTeacherFeedback(activity, state).assistedVariantIds, []);
});
