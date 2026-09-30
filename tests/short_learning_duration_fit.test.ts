import test from "node:test";
import assert from "node:assert/strict";
import {
  SHORT_LEARNING_ALLOWED_DURATIONS,
  SHORT_LEARNING_DEFAULT_DURATION,
  canKeepExistingShortLearningDuration,
  formatShortLearningDurationMinutes,
  isLegacyShortLearningDuration,
} from "../src/lib/schools/short-learning-constants";
import {
  buildShortLearningSessionPlan,
  isShortLearningAdminDuration,
  isShortLearningPlanDuration,
  shortLearningBlockCanStart,
  shortLearningPlanStaysInsideDuration,
} from "../src/lib/schools/short-learning-session-plan";
import { selectShortLearningBlockWithinRemainingTime } from "../src/lib/schools/short-learning-classroom";
import {
  generateSlotStartMinutes,
  isAllowedShortLearningDuration,
  parseTimeHm,
} from "../src/lib/schools/short-learning-bookings";
import { expectedMathQuestionsForDuration } from "../src/lib/schools/short-learning-session-clock";
import { capHumanSupportToRemainingSession, estimateWaitSeconds } from "../src/lib/schools/human-support-timing";
import { buildDaytimeSessionPlan } from "../src/lib/schools/daytime-session-plan";
import { estimatedDurationMinutes } from "../src/lib/lesson-pack-import/transform";

const policy = {
  minimumSessionMinutes: 5,
  maximumSessionMinutes: 15,
  closeoutReserveMinutes: 2,
  transitionMinutes: 0.5,
};

test("45, 60 and 70 minute plans fill the booking and finish naturally", () => {
  const questions = {
    45: expectedMathQuestionsForDuration(45),
    60: expectedMathQuestionsForDuration(60),
    70: expectedMathQuestionsForDuration(70),
  };

  for (const duration of [45, 60, 70] as const) {
    const plan = buildShortLearningSessionPlan(duration);
    assert.equal(plan.durationMinutes, duration);
    assert.equal(plan.totalEstimatedMinutes, duration);
    assert.equal(shortLearningPlanStaysInsideDuration(plan), true);
    assert.equal(plan.blocks[0]?.blockType, "welcome");
    assert.equal(plan.blocks.at(-1)?.blockType, "progress_report");
    assert.equal(plan.blocks.some((block) => block.blockType === "lesson"), true);
    assert.equal(plan.blocks.some((block) => block.title.toLowerCase().includes("guided")), true);
    assert.equal(plan.blocks.some((block) => block.blockType === "challenge"), true);
    assert.equal(plan.blocks.some((block) => block.blockType === "review"), true);
    assert.ok(questions[duration] >= 12, `${duration} needs a real practice budget, got ${questions[duration]}`);
    assert.ok(questions[duration] <= 70, `${duration} practice budget should stay finishable, got ${questions[duration]}`);
  }

  assert.ok(questions[45] < questions[60], "45-minute session should contain less practice than 60");
  assert.ok(questions[60] < questions[70], "70-minute session should add practice beyond 60");

  const standard = buildShortLearningSessionPlan(60);
  const extended = buildShortLearningSessionPlan(70);
  const extra = extended.blocks.find((block) => block.title.includes("Extra practice"));
  assert.ok(extra);
  assert.equal(extra?.estimatedMinutes, 10);
  assert.equal(standard.blocks.some((block) => block.title.includes("Extra practice")), false);
  assert.equal(extended.generativeBlockCount, standard.generativeBlockCount + 1);
  assert.equal(extended.totalEstimatedMinutes - standard.totalEstimatedMinutes, 10);
});

test("new bookings cannot select 90 or 120, and historical lengths still display", () => {
  assert.deepEqual([...SHORT_LEARNING_ALLOWED_DURATIONS], [45, 60, 70]);
  assert.equal(SHORT_LEARNING_DEFAULT_DURATION, 60);
  assert.equal(isAllowedShortLearningDuration(45), true);
  assert.equal(isAllowedShortLearningDuration(60), true);
  assert.equal(isAllowedShortLearningDuration(70), true);
  assert.equal(isAllowedShortLearningDuration(90), false);
  assert.equal(isAllowedShortLearningDuration(105), false);
  assert.equal(isAllowedShortLearningDuration(120), false);
  assert.equal(isShortLearningAdminDuration(90), false);
  assert.equal(isShortLearningAdminDuration(120), false);
  assert.equal(isShortLearningPlanDuration(90), true);
  assert.equal(isShortLearningPlanDuration(120), true);

  assert.deepEqual(generateSlotStartMinutes({
    openMin: parseTimeHm("16:00"),
    closeMin: parseTimeHm("20:00"),
    durationMinutes: 90,
  }), []);
  assert.deepEqual(generateSlotStartMinutes({
    openMin: parseTimeHm("16:00"),
    closeMin: parseTimeHm("20:00"),
    durationMinutes: 120,
  }), []);
  assert.ok(generateSlotStartMinutes({
    openMin: parseTimeHm("16:00"),
    closeMin: parseTimeHm("20:00"),
    durationMinutes: 45,
  }).length > 0);

  assert.equal(formatShortLearningDurationMinutes(90), "90 minutes");
  assert.equal(formatShortLearningDurationMinutes(120), "120 minutes");
  assert.equal(isLegacyShortLearningDuration(90), true);
  assert.equal(canKeepExistingShortLearningDuration(90, 90), true);
  assert.equal(canKeepExistingShortLearningDuration(120, 90), false);
  assert.equal(canKeepExistingShortLearningDuration(60, 90), true);

  const historical = buildShortLearningSessionPlan(90);
  assert.equal(historical.totalEstimatedMinutes, 90);
  assert.equal(buildShortLearningSessionPlan(120).totalEstimatedMinutes, 120);
  assert.equal(historical.blocks.some((block) => block.blockType === "break"), true);
});

test("no activity is scheduled past the session end, and a short remainder skips a new lesson", () => {
  for (const duration of [45, 60, 70, 90, 105, 120] as const) {
    const plan = buildShortLearningSessionPlan(duration);
    let cursor = 0;
    for (const block of plan.blocks) {
      cursor += block.estimatedMinutes;
      assert.ok(cursor <= duration, `${block.title} passes ${duration}`);
    }
    assert.equal(cursor, duration);
  }

  const plan = buildShortLearningSessionPlan(45);
  const blocks = plan.blocks.map((block, index) => ({
    id: `b${index}`,
    order: block.order,
    blockType: block.blockType,
    estimatedMinutes: block.estimatedMinutes,
    status: "ready",
    contentId: block.requiresContent ? `c${index}` : null,
  }));
  const timed = selectShortLearningBlockWithinRemainingTime({
    blocks,
    preferredOrder: 1,
    remainingMinutes: 9,
  });
  assert.equal(timed.block?.blockType, "review");
  assert.ok(timed.skipIds.includes("b1"));
  assert.equal(shortLearningBlockCanStart({
    blockType: "lesson",
    estimatedMinutes: 14,
    remainingMinutes: 9,
  }), false);
  assert.equal(shortLearningBlockCanStart({
    blockType: "progress_report",
    estimatedMinutes: 0,
    remainingMinutes: 0,
  }), true);
});

test("human support timing stays inside the remaining Short Learning session", () => {
  const longWait = estimateWaitSeconds({
    waitingAhead: 4,
    onlineTutorCount: 1,
    sessionBudgetMinutes: 15,
    minutesUntilPeriodEnd: 8,
  });
  assert.ok(longWait <= 8 * 60);

  const tooLate = capHumanSupportToRemainingSession({
    budgetMinutes: 15,
    estimatedWaitSec: longWait,
    minutesUntilSessionEnd: 4,
    minimumSessionMinutes: policy.minimumSessionMinutes,
  });
  assert.equal(tooLate.enoughTime, false);
  assert.equal(tooLate.canAllocate, false);
  assert.equal(tooLate.budgetMinutes, 0);
  assert.ok(tooLate.estimatedWaitSec <= 4 * 60);

  const fits = capHumanSupportToRemainingSession({
    budgetMinutes: 15,
    estimatedWaitSec: 20 * 60,
    minutesUntilSessionEnd: 12,
    minimumSessionMinutes: policy.minimumSessionMinutes,
  });
  assert.equal(fits.enoughTime, true);
  assert.equal(fits.canAllocate, true);
  assert.ok(fits.budgetMinutes <= 12);
  assert.ok(fits.budgetMinutes >= policy.minimumSessionMinutes);
  assert.ok(fits.estimatedWaitSec <= 12 * 60);
});

test("School Day session planning is unchanged by Short Learning durations", () => {
  const schoolDay = buildDaytimeSessionPlan("09:00", "09:50");
  assert.equal(schoolDay.periodMinutes, 50);
  assert.deepEqual(schoolDay.stages.map((stage) => stage.stage), ["warmup", "core", "stretch"]);
  assert.equal(estimatedDurationMinutes("school_day", 55), 60);
  assert.equal(estimatedDurationMinutes("short_learning_45", 55), 45);
  assert.equal(estimatedDurationMinutes("short_learning_60", 55), 60);
  assert.equal(estimatedDurationMinutes("short_learning_70", 55), 70);
  assert.equal(estimatedDurationMinutes("short_learning_90", 55), 90);
  assert.equal(estimatedDurationMinutes("short_learning_120", 55), 120);
});
