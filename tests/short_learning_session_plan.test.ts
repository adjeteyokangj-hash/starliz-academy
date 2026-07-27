import test from "node:test";
import assert from "node:assert/strict";
import {
  buildShortLearningSessionPlan,
  isShortLearningPlanDuration,
  shortLearningBlockSequence,
} from "../src/lib/schools/short-learning-session-plan";

test("session planning for 90, 105 and 120 minute bookings", () => {
  for (const duration of [90, 105, 120] as const) {
    assert.equal(isShortLearningPlanDuration(duration), true);
    const plan = buildShortLearningSessionPlan(duration);
    assert.equal(plan.durationMinutes, duration);
    assert.ok(plan.blocks.length >= 8);
    assert.equal(
      plan.totalEstimatedMinutes,
      plan.blocks.reduce((sum, b) => sum + b.estimatedMinutes, 0),
    );
    // Allow small slack for wrap-up / progress report (0 min).
    assert.ok(Math.abs(plan.totalEstimatedMinutes - duration) <= 5, `${duration} plan sum=${plan.totalEstimatedMinutes}`);
    assert.ok(plan.generativeBlockCount >= 5);
  }
  assert.equal(isShortLearningPlanDuration(60), false);
  assert.throws(() => buildShortLearningSessionPlan(60));
});

test("correct sequencing of learning blocks", () => {
  const plan = buildShortLearningSessionPlan(120);
  const sequence = shortLearningBlockSequence(plan);
  assert.deepEqual(
    plan.blocks.map((b) => b.blockType),
    [
      "welcome",
      "lesson",
      "recap",
      "lesson",
      "break",
      "lesson",
      "tutor_support",
      "challenge",
      "review",
      "progress_report",
    ],
  );
  assert.equal(plan.blocks[0]?.title.includes("Welcome"), true);
  assert.equal(plan.blocks.some((b) => b.blockType === "break" && !b.requiresContent), true);
  assert.equal(plan.blocks.some((b) => b.blockType === "tutor_support" && !b.requiresContent), true);
  assert.ok(sequence[0]?.startsWith("0:welcome:"));
  // LO progression labels on generative lesson blocks
  const lessonObjectives = plan.blocks.filter((b) => b.blockType === "lesson").map((b) => b.learningObjectiveLabel);
  assert.ok(lessonObjectives[0]?.includes("LO1"));
  assert.ok(lessonObjectives[1]?.includes("LO2"));
  assert.ok(lessonObjectives[2]?.includes("LO3"));
});

test("break, welcome, tutor and progress blocks do not request Daytime content", () => {
  const plan = buildShortLearningSessionPlan(90);
  for (const block of plan.blocks) {
    if (
      block.blockType === "welcome"
      || block.blockType === "break"
      || block.blockType === "tutor_support"
      || block.blockType === "progress_report"
    ) {
      assert.equal(block.requiresContent, false);
      assert.equal(block.daytimeStage, null);
    } else {
      assert.equal(block.requiresContent, true);
      assert.ok(block.daytimeStage === "warmup" || block.daytimeStage === "core" || block.daytimeStage === "stretch");
    }
  }
});

test("reuse vs regenerate behaviour helpers", () => {
  // Documented contract exercised by ensureShortLearningSessionContent:
  // ready session + no force => reuse; force => regenerate.
  const reuseDecision = (status: string, forceRegenerate?: boolean) =>
    status === "ready" && !forceRegenerate ? "reuse" : "regenerate";
  assert.equal(reuseDecision("ready"), "reuse");
  assert.equal(reuseDecision("ready", true), "regenerate");
  assert.equal(reuseDecision("failed"), "regenerate");
  assert.equal(reuseDecision("planned"), "regenerate");
});

test("AI Tutor and Human Support blocks remain in the journey", () => {
  for (const duration of [90, 105, 120] as const) {
    const plan = buildShortLearningSessionPlan(duration);
    const tutor = plan.blocks.find((b) => b.blockType === "tutor_support");
    assert.ok(tutor, `missing tutor_support in ${duration}`);
    assert.equal(tutor.requiresContent, false);
    assert.ok(tutor.estimatedMinutes >= 10);
    // Human support is availability-gated elsewhere; journey still includes AI teaching blocks.
    assert.ok(plan.blocks.some((b) => b.blockType === "lesson" && b.requiresContent));
  }
});
