import test from "node:test";
import assert from "node:assert/strict";
import {
  hasEligibleTutorCapacity,
  isShortLearningBookingActive,
  resolveEscalationQueueDecision,
  resolveStudentHumanSupportEligibility,
} from "../src/lib/schools/support-eligibility";

test("Short Learning: AI not exhausted → no human; continue AI", () => {
  const result = resolveStudentHumanSupportEligibility({
    mode: "SHORT_LEARNING",
    aiExhausted: false,
    studentRecovered: false,
    bookingActive: true,
  });
  assert.equal(result.humanTutorEligible, false);
  assert.equal(result.continueAi, true);
  assert.match(result.reason, /not exhausted/i);
});

test("Day School: AI not exhausted → no human tutor eligibility", () => {
  const result = resolveStudentHumanSupportEligibility({
    mode: "DAY_SCHOOL",
    aiSupportState: "live-ai",
    studentRecovered: false,
    assignmentStillActive: true,
    periodStillActive: true,
  });
  assert.equal(result.humanTutorEligible, false);
  assert.equal(result.continueAi, true);
});

test("Short Learning: exhausted with active booking is human-eligible", () => {
  const result = resolveStudentHumanSupportEligibility({
    mode: "SHORT_LEARNING",
    aiExhausted: true,
    studentRecovered: false,
    bookingActive: true,
  });
  assert.equal(result.humanTutorEligible, true);
  assert.equal(result.continueAi, false);
});

test("no on-shift tutor capacity → continue AI with unmet escalation", () => {
  const student = resolveStudentHumanSupportEligibility({
    mode: "SHORT_LEARNING",
    aiExhausted: true,
    studentRecovered: false,
    bookingActive: true,
  });
  const decision = resolveEscalationQueueDecision({
    student,
    capacity: {
      onlineTutorCount: 0,
      availableTutorCount: 0,
      acceptReadyTutorCount: 0,
      hasEligibleCapacity: false,
    },
  });
  assert.equal(decision.shouldEnqueue, false);
  assert.equal(decision.continueAi, true);
  assert.equal(decision.unmetEscalation, true);
  assert.match(decision.reason, /continue AI/i);
});

test("eligible student with accept-ready tutor can enqueue", () => {
  const student = resolveStudentHumanSupportEligibility({
    mode: "SHORT_LEARNING",
    aiExhausted: true,
    studentRecovered: false,
    bookingActive: true,
  });
  const capacity = {
    onlineTutorCount: 2,
    availableTutorCount: 1,
    acceptReadyTutorCount: 1,
    hasEligibleCapacity: true,
  };
  assert.equal(hasEligibleTutorCapacity(capacity), true);
  const decision = resolveEscalationQueueDecision({ student, capacity });
  assert.equal(decision.shouldEnqueue, true);
  assert.equal(decision.continueAi, false);
});

test("recovered student after exhaustion is not human-eligible", () => {
  const result = resolveStudentHumanSupportEligibility({
    mode: "SHORT_LEARNING",
    aiExhausted: true,
    studentRecovered: true,
    bookingActive: true,
  });
  assert.equal(result.humanTutorEligible, false);
  assert.equal(result.continueAi, true);
});

test("isShortLearningBookingActive respects early entry window", () => {
  const startsAt = new Date("2026-07-25T18:00:00.000Z");
  const endsAt = new Date("2026-07-25T19:30:00.000Z");
  assert.equal(
    isShortLearningBookingActive({
      startsAt,
      endsAt,
      status: "booked",
      now: new Date("2026-07-25T17:55:00.000Z"),
      earlyEntryMinutes: 10,
    }),
    true,
  );
  assert.equal(
    isShortLearningBookingActive({
      startsAt,
      endsAt,
      status: "cancelled",
      now: new Date("2026-07-25T18:00:00.000Z"),
    }),
    false,
  );
});
