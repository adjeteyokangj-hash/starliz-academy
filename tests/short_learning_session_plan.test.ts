import test from "node:test";
import assert from "node:assert/strict";
import {
  buildShortLearningSessionPlan,
  isShortLearningPlanDuration,
  shortLearningBlockSequence,
  shortLearningPlanStaysInsideDuration,
} from "../src/lib/schools/short-learning-session-plan";

test("session planning for 45, 60 and 70 minute bookings, plus legacy lengths", () => {
  for (const duration of [45, 60, 70, 90, 105, 120] as const) {
    assert.equal(isShortLearningPlanDuration(duration), true);
    const plan = buildShortLearningSessionPlan(duration);
    assert.equal(plan.durationMinutes, duration);
    assert.equal(plan.totalEstimatedMinutes, duration);
    assert.equal(shortLearningPlanStaysInsideDuration(plan), true);
    assert.ok(plan.generativeBlockCount >= 4);
  }
  assert.equal(isShortLearningPlanDuration(30), false);
  assert.throws(() => buildShortLearningSessionPlan(30));
});

test("60-minute sequencing keeps teaching, practice, support and an ending", () => {
  const plan = buildShortLearningSessionPlan(60);
  const sequence = shortLearningBlockSequence(plan);
  assert.deepEqual(
    plan.blocks.map((b) => b.blockType),
    [
      "welcome",
      "lesson",
      "recap",
      "lesson",
      "challenge",
      "tutor_support",
      "review",
      "progress_report",
    ],
  );
  assert.equal(plan.blocks[0]?.title.includes("Welcome"), true);
  assert.equal(plan.blocks.some((b) => b.blockType === "tutor_support" && !b.requiresContent), true);
  assert.ok(sequence[0]?.startsWith("0:welcome:"));
  const lessonObjectives = plan.blocks.filter((b) => b.blockType === "lesson").map((b) => b.learningObjectiveLabel);
  assert.ok(lessonObjectives[0]?.includes("LO1"));
  assert.ok(lessonObjectives[1]?.includes("LO2"));
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
  const reuseDecision = (status: string, forceRegenerate?: boolean) =>
    status === "ready" && !forceRegenerate ? "reuse" : "regenerate";
  assert.equal(reuseDecision("ready"), "reuse");
  assert.equal(reuseDecision("ready", true), "regenerate");
  assert.equal(reuseDecision("failed"), "regenerate");
  assert.equal(reuseDecision("planned"), "regenerate");
});

test("current sessions include a finish, and legacy journeys still include tutor support", () => {
  for (const duration of [45, 60, 70] as const) {
    const plan = buildShortLearningSessionPlan(duration);
    assert.equal(plan.blocks.at(-1)?.blockType, "progress_report");
    assert.ok(plan.blocks.some((b) => b.blockType === "lesson" && b.requiresContent));
  }
  for (const duration of [90, 105, 120] as const) {
    const plan = buildShortLearningSessionPlan(duration);
    const tutor = plan.blocks.find((b) => b.blockType === "tutor_support");
    assert.ok(tutor, `missing tutor_support in ${duration}`);
    assert.equal(tutor.requiresContent, false);
    assert.ok(tutor.estimatedMinutes >= 10);
  }
  const standardTutor = buildShortLearningSessionPlan(60).blocks.find((b) => b.blockType === "tutor_support");
  assert.ok(standardTutor);
  assert.ok((standardTutor?.estimatedMinutes ?? 0) < 10);
});
