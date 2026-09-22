import test from "node:test";
import assert from "node:assert/strict";
import { buildShortLearningSessionPlan } from "../src/lib/schools/short-learning-session-plan";
import {
  expectedMathQuestionsForDuration,
  formatSessionCountdown,
  isShortLearningClockOpen,
  remainingMsUntilIso,
  SHORT_LEARNING_LAST_MINUTES,
  SHORT_LEARNING_WARNING_MINUTES,
  shortLearningClockCopy,
  shortLearningClockPhase,
} from "../src/lib/schools/short-learning-session-clock";

test("90-minute Short Learning plan fills the booked window exactly", () => {
  const plan = buildShortLearningSessionPlan(90);
  assert.equal(plan.totalEstimatedMinutes, 90);
  assert.equal(plan.durationMinutes, 90);
  assert.equal(plan.blocks.reduce((sum, block) => sum + block.estimatedMinutes, 0), 90);
});

test("90-minute maths journey asks enough questions for the full session, not a 3-item quiz", () => {
  const count = expectedMathQuestionsForDuration(90);
  assert.ok(count >= 40, `expected a 90-minute practice budget, got ${count}`);
  assert.ok(count <= 80, `90-minute budget should stay teachable, got ${count}`);
});

test("clock warns at 15 minutes, counts down, then ends at the booking instant", () => {
  const endsAt = "2026-09-19T12:00:00.000Z";
  const endMs = Date.parse(endsAt);
  assert.equal(shortLearningClockPhase(SHORT_LEARNING_WARNING_MINUTES * 60_000 + 1), "ok");
  assert.equal(shortLearningClockPhase(SHORT_LEARNING_WARNING_MINUTES * 60_000), "warning");
  assert.equal(shortLearningClockPhase(SHORT_LEARNING_LAST_MINUTES * 60_000), "final");
  assert.equal(shortLearningClockPhase(0), "ended");
  assert.equal(formatSessionCountdown(15 * 60_000), "15:00");
  assert.equal(formatSessionCountdown(61_000), "1:01");
  assert.equal(formatSessionCountdown(9_000), "0:09");
  assert.equal(remainingMsUntilIso(endsAt, endMs), 0);
  assert.equal(remainingMsUntilIso(endsAt, endMs - 1000), 1000);
  const warning = shortLearningClockCopy({ remainingMs: 15 * 60_000, durationMinutes: 90 });
  assert.match(warning.headline, /15 minutes/i);
  assert.match(warning.detail, /15:00/);
  const last = shortLearningClockCopy({ remainingMs: 4 * 60_000, durationMinutes: 90 });
  assert.match(last.headline, /last minutes/i);
  assert.match(last.detail, /4:00/);
  const ended = shortLearningClockCopy({ remainingMs: 0, durationMinutes: 90 });
  assert.match(ended.headline, /time is up/i);
});

test("session window closes at endsAt, not a minute later", () => {
  const startsAtIso = "2026-09-19T10:30:00.000Z";
  const endsAtIso = "2026-09-19T12:00:00.000Z";
  const start = Date.parse(startsAtIso);
  const end = Date.parse(endsAtIso);
  assert.equal(end - start, 90 * 60_000);
  assert.equal(isShortLearningClockOpen({ startsAtIso, endsAtIso, nowMs: start - 5 * 60_000 }), true);
  assert.equal(isShortLearningClockOpen({ startsAtIso, endsAtIso, nowMs: start - 5 * 60_000 - 1 }), false);
  assert.equal(isShortLearningClockOpen({ startsAtIso, endsAtIso, nowMs: end - 1 }), true);
  assert.equal(isShortLearningClockOpen({ startsAtIso, endsAtIso, nowMs: end }), false);
});
