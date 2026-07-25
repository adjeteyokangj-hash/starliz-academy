import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateSessionBudgetMinutes,
  canAssignImmediately,
  deriveHumanSupportSummary,
  estimateWaitSeconds,
  rollingMedian,
  shouldEnqueueStudent,
} from "../src/lib/schools/human-support-timing";

const policy = {
  minimumSessionMinutes: 5,
  maximumSessionMinutes: 15,
  closeoutReserveMinutes: 2,
  transitionMinutes: 0.5,
};

test("no online tutors → ai-only and no queue", () => {
  assert.equal(
    shouldEnqueueStudent({
      humanTutorEligible: true,
      onlineTutorCount: 0,
      availableTutorCount: 0,
    }),
    false,
  );
  assert.deepEqual(
    deriveHumanSupportSummary({
      onlineTutorCount: 0,
      availableTutorCount: 0,
      busyTutorCount: 0,
    }),
    { state: "ai-only", label: "Human support: AI only" },
  );
});

test("eligible + available tutor → assign immediately, do not queue", () => {
  assert.equal(
    canAssignImmediately({ humanTutorEligible: true, availableTutorCount: 2 }),
    true,
  );
  assert.equal(
    shouldEnqueueStudent({
      humanTutorEligible: true,
      onlineTutorCount: 2,
      availableTutorCount: 1,
    }),
    false,
  );
});

test("eligible + tutors busy → queue open", () => {
  assert.equal(
    shouldEnqueueStudent({
      humanTutorEligible: true,
      onlineTutorCount: 2,
      availableTutorCount: 0,
    }),
    true,
  );
  const summary = deriveHumanSupportSummary({
    onlineTutorCount: 2,
    availableTutorCount: 0,
    busyTutorCount: 2,
  });
  assert.equal(summary.state, "tutors-busy");
  assert.match(summary.label, /queue open/i);
});

test("session budget uses waves and clamps to policy", () => {
  // 30 min remaining, reserve 2 → 28 usable; 6 students / 2 tutors = 3 waves → ~9
  const budget = calculateSessionBudgetMinutes({
    minutesUntilPeriodEnd: 30,
    eligibleStudentCount: 6,
    onlineTutorCount: 2,
    policy,
  });
  assert.ok(budget >= 5 && budget <= 15);
  assert.equal(budget, 9); // floor((28 - 1.0) / 3) = 9
});

test("session budget example 20 min / 3 students / 1 tutor", () => {
  const budget = calculateSessionBudgetMinutes({
    minutesUntilPeriodEnd: 20,
    eligibleStudentCount: 3,
    onlineTutorCount: 1,
    policy,
  });
  // usable = 20-2 - 0.5*2 = 17; waves=3; floor(17/3)=5 → clamp min 5
  assert.equal(budget, 5);
});

test("zero online tutors yields zero budget", () => {
  assert.equal(
    calculateSessionBudgetMinutes({
      minutesUntilPeriodEnd: 30,
      eligibleStudentCount: 4,
      onlineTutorCount: 0,
      policy,
    }),
    0,
  );
});

test("wait estimate scales with queue depth", () => {
  const short = estimateWaitSeconds({
    waitingAhead: 0,
    onlineTutorCount: 2,
    sessionBudgetMinutes: 10,
    minutesUntilPeriodEnd: 40,
  });
  const long = estimateWaitSeconds({
    waitingAhead: 5,
    onlineTutorCount: 2,
    sessionBudgetMinutes: 10,
    minutesUntilPeriodEnd: 40,
  });
  assert.ok(long > short);
});

test("rolling median supports capacity prediction", () => {
  assert.equal(rollingMedian([10, 8, 12, 9, 11]), 10);
  assert.equal(rollingMedian([]), null);
});
