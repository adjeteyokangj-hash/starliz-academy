import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseShortLearningSupportScopeKey,
  shortLearningSupportMetadata,
  shortLearningSupportScopeKey,
} from "../src/lib/schools/short-learning-support-context";
import {
  resolveEscalationQueueDecision,
  resolveStudentHumanSupportEligibility,
  isShortLearningBookingActive,
} from "../src/lib/schools/support-eligibility";

describe("Short Learning support context helpers", () => {
  it("builds and parses support scope keys", () => {
    const key = shortLearningSupportScopeKey("book1", "block2");
    assert.equal(key, "sl:book1:block2");
    assert.deepEqual(parseShortLearningSupportScopeKey(key), {
      bookingId: "book1",
      blockId: "block2",
    });
    assert.equal(parseShortLearningSupportScopeKey("day-lesson-1"), null);
  });

  it("stores SHORT_LEARNING metadata contract", () => {
    const meta = shortLearningSupportMetadata({
      supportMode: "SHORT_LEARNING",
      bookingId: "b1",
      sessionId: "s1",
      blockId: "bl1",
      assignmentId: "a1",
      contentId: "c1",
      studentId: "st1",
      schoolId: "sc1",
      classroomId: null,
      subject: "maths",
      yearGroup: "Year 6",
      bookingStartsAt: new Date("2026-07-26T10:00:00Z"),
      bookingEndsAt: new Date("2026-07-26T11:30:00Z"),
      blockOrder: 1,
      blockType: "lesson",
      learningObjective: "LO1",
      supportScopeKey: "sl:b1:bl1",
    }, { questionId: "q1" });
    assert.equal(meta.supportMode, "SHORT_LEARNING");
    assert.equal(meta.shortLearningBookingId, "b1");
    assert.equal(meta.shortLearningBlockId, "bl1");
    assert.equal(meta.questionId, "q1");
  });

  it("booking window: before start closed, during open, after end closed", () => {
    const startsAt = new Date("2026-07-26T12:00:00Z");
    const endsAt = new Date("2026-07-26T13:30:00Z");
    assert.equal(
      isShortLearningBookingActive({
        startsAt,
        endsAt,
        status: "booked",
        now: new Date("2026-07-26T11:40:00Z"),
        earlyEntryMinutes: 10,
      }),
      false,
    );
    assert.equal(
      isShortLearningBookingActive({
        startsAt,
        endsAt,
        status: "booked",
        now: new Date("2026-07-26T11:55:00Z"),
        earlyEntryMinutes: 10,
      }),
      true,
    );
    assert.equal(
      isShortLearningBookingActive({
        startsAt,
        endsAt,
        status: "booked",
        now: new Date("2026-07-26T12:30:00Z"),
        earlyEntryMinutes: 10,
      }),
      true,
    );
    assert.equal(
      isShortLearningBookingActive({
        startsAt,
        endsAt,
        status: "booked",
        now: new Date("2026-07-26T13:31:00Z"),
        earlyEntryMinutes: 10,
      }),
      false,
    );
  });

  it("AI exhaustion eligibility + no tutor → continue AI / unmet escalation", () => {
    const student = resolveStudentHumanSupportEligibility({
      mode: "SHORT_LEARNING",
      aiExhausted: true,
      studentRecovered: false,
      bookingActive: true,
    });
    assert.equal(student.humanTutorEligible, true);
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
  });

  it("available tutor capacity allows enqueue", () => {
    const student = resolveStudentHumanSupportEligibility({
      mode: "SHORT_LEARNING",
      aiExhausted: true,
      studentRecovered: false,
      bookingActive: true,
    });
    const decision = resolveEscalationQueueDecision({
      student,
      capacity: {
        onlineTutorCount: 1,
        availableTutorCount: 1,
        acceptReadyTutorCount: 1,
        hasEligibleCapacity: true,
      },
    });
    assert.equal(decision.shouldEnqueue, true);
    assert.equal(decision.continueAi, false);
  });

  it("tutor_support planner block alone does not imply human eligibility", () => {
    const notExhausted = resolveStudentHumanSupportEligibility({
      mode: "SHORT_LEARNING",
      aiExhausted: false,
      studentRecovered: false,
      bookingActive: true,
    });
    assert.equal(notExhausted.humanTutorEligible, false);
  });
});
