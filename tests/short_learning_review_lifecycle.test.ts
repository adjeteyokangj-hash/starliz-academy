import test from "node:test";
import assert from "node:assert/strict";
import {
  SHORT_LEARNING_ADMIN_DURATIONS,
  isShortLearningAdminDuration,
  buildShortLearningSessionPlan,
} from "../src/lib/schools/short-learning-session-plan";

test("Admin Short Learning durations are 45, 60 and 70", () => {
  assert.deepEqual([...SHORT_LEARNING_ADMIN_DURATIONS], [45, 60, 70]);
  assert.equal(isShortLearningAdminDuration(45), true);
  assert.equal(isShortLearningAdminDuration(60), true);
  assert.equal(isShortLearningAdminDuration(70), true);
  assert.equal(isShortLearningAdminDuration(90), false);
  assert.equal(isShortLearningAdminDuration(105), false);
  assert.equal(isShortLearningAdminDuration(120), false);
});

test("45, 60 and 70 plans fit duration with non-generative welcome", () => {
  for (const duration of [45, 60, 70] as const) {
    const plan = buildShortLearningSessionPlan(duration);
    assert.equal(plan.blocks[0]?.blockType, "welcome");
    assert.equal(plan.blocks[0]?.requiresContent, false);
    assert.equal(plan.totalEstimatedMinutes, duration);
    assert.ok(plan.generativeBlockCount >= 4);
  }
});
