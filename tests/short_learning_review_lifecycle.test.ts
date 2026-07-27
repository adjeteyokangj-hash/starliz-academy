import test from "node:test";
import assert from "node:assert/strict";
import {
  SHORT_LEARNING_ADMIN_DURATIONS,
  isShortLearningAdminDuration,
  buildShortLearningSessionPlan,
} from "../src/lib/schools/short-learning-session-plan";

test("Admin Short Learning durations are only 90 and 120", () => {
  assert.deepEqual([...SHORT_LEARNING_ADMIN_DURATIONS], [90, 120]);
  assert.equal(isShortLearningAdminDuration(90), true);
  assert.equal(isShortLearningAdminDuration(120), true);
  assert.equal(isShortLearningAdminDuration(105), false);
});

test("90 and 120 plans fit duration with non-generative welcome", () => {
  for (const duration of [90, 120] as const) {
    const plan = buildShortLearningSessionPlan(duration);
    assert.equal(plan.blocks[0]?.blockType, "welcome");
    assert.equal(plan.blocks[0]?.requiresContent, false);
    assert.ok(Math.abs(plan.totalEstimatedMinutes - duration) <= 5);
    assert.ok(plan.generativeBlockCount >= 5);
  }
});
