import test from "node:test";
import assert from "node:assert/strict";

import { createGeneratedBatchState, applyAdminHomeworkAction } from "../src/lib/homework-phase1a/stateTransitions";
import { evaluateHomeworkSessionGate } from "../src/lib/homework-phase1a/gate";
import { summarizeHomeworkBatchForParentAdmin, type HomeworkBatchView } from "../src/lib/homework-phase1b/service";

function makeBatch(overrides?: Partial<HomeworkBatchView>): HomeworkBatchView {
  return {
    id: "batch-1",
    studentId: "student-1",
    weekStart: "2026-05-25T00:00:00.000Z",
    weekEnd: "2026-05-31T23:59:59.000Z",
    timezone: "Europe/London",
    status: "OVERDUE",
    dueBeforeNextSession: true,
    generatedAt: "2026-05-25T00:00:00.000Z",
    startedAt: "2026-05-26T10:00:00.000Z",
    submittedAt: null,
    markedAt: null,
    completedAt: null,
    frozenAt: "2026-05-26T10:00:00.000Z",
    sourceCompletedSessionCount: 3,
    sourceStartedSessionCount: 4,
    workloadCapMinutes: 20,
    plannedMinutes: 18,
    scorePercent: 44,
    recapOnly: false,
    overrideReason: null,
    excusedReason: null,
    extendedDueAt: null,
    cancelledReason: null,
    markingSummary: {
      scorePercent: 44,
      outcomeBand: "NEEDS_SUPPORT",
      correctCount: 1,
      incorrectCount: 1,
      reviewNeededCount: 0,
      incompleteCount: 0,
      answeredCount: 2,
      totalQuestions: 2,
      feedback: "Needs support in fractions.",
      weakAreas: ["Fractions"],
      requiresRecap: true,
    },
    questions: [
      {
        id: "q1",
        order: 1,
        subject: "Math",
        topic: "Fractions",
        skill: "Equivalent fractions",
        questionType: "mcq",
        prompt: { text: "Q1" },
        options: null,
        expectedAnswer: null,
        markingType: "auto",
        required: true,
        estimatedMinutes: 5,
        difficulty: 2,
        frozenAt: null,
        answer: {
          id: "a1",
          questionId: "q1",
          draftAnswer: null,
          submittedAnswer: null,
          isAnswered: true,
          answeredAt: "2026-05-26T10:00:00.000Z",
          submittedAt: null,
          markingStatus: "not_marked",
          isCorrect: null,
          score: null,
          feedback: null,
          weakArea: "Fractions",
          aiConfidence: null,
          reviewNeeded: false,
        },
      },
    ],
    ...overrides,
  };
}

test("parent sees child homework", () => {
  const summary = summarizeHomeworkBatchForParentAdmin(makeBatch());

  assert.equal(summary.studentId, "student-1");
  assert.equal(summary.statusCategory, "overdue");
  assert.equal(summary.scorePercent, 44);
  assert.deepEqual(summary.weakAreas, ["Fractions"]);
  assert.equal(summary.parentActionNeeded, true);
  assert.equal(summary.homeworkHelpedLearningProgress, null);
  assert.equal(summary.repeatedLowScoreOrMissedPattern, true);
  assert.equal(summary.actionNeededReasons.includes("overdue_homework"), true);
  assert.equal(summary.actionNeededReasons.includes("low_homework_score"), true);
});

test("admin sees student homework", () => {
  const summary = summarizeHomeworkBatchForParentAdmin(makeBatch({ status: "SUBMITTED", scorePercent: null }));

  assert.equal(summary.status, "SUBMITTED");
  assert.equal(summary.statusCategory, "submitted");
  assert.equal(summary.outcome, "NEEDS_SUPPORT");
  assert.equal(summary.repeatedLowScoreOrMissedPattern, false);
});

test("completed high-score homework shows progress helped", () => {
  const summary = summarizeHomeworkBatchForParentAdmin(makeBatch({
    status: "COMPLETED",
    scorePercent: 88,
    recapOnly: false,
    sourceCompletedSessionCount: 3,
    sourceStartedSessionCount: 3,
    markingSummary: {
      scorePercent: 88,
      outcomeBand: "MASTERED",
      correctCount: 2,
      incorrectCount: 0,
      reviewNeededCount: 0,
      incompleteCount: 0,
      answeredCount: 2,
      totalQuestions: 2,
      feedback: "Strong mastery shown.",
      weakAreas: [],
      requiresRecap: false,
    },
  }));

  assert.equal(summary.parentActionNeeded, false);
  assert.equal(summary.homeworkHelpedLearningProgress, true);
  assert.deepEqual(summary.actionNeededReasons, []);
});

test("excuse unlocks next session", () => {
  const state = {
    ...createGeneratedBatchState(["q1"]),
    status: "IN_PROGRESS" as const,
  };
  const result = applyAdminHomeworkAction(state, new Date(), "excuse", "Family emergency");

  assert.equal(result.ok, true);
  if (result.ok) {
    const gate = evaluateHomeworkSessionGate(result.state);
    assert.equal(gate.blockNewLearningSession, false);
  }
});

test("override requires reason", () => {
  const result = applyAdminHomeworkAction(createGeneratedBatchState(["q1"]), new Date(), "override", "");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /reason/i);
  }
});

test("extend records audit", () => {
  const result = applyAdminHomeworkAction(createGeneratedBatchState(["q1"]), new Date(), "extend");

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.audit.length, 1);
    assert.equal(result.audit[0]?.action, "extend");
  }
});

test("regenerate blocked after STARTED", () => {
  const result = applyAdminHomeworkAction(
    { ...createGeneratedBatchState(["q1"]), status: "STARTED", frozenAtIso: new Date().toISOString() },
    new Date(),
    "regenerate",
    "Need updated set",
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /started/i);
  }
});

test("reduce allowed only before STARTED", () => {
  const generated = applyAdminHomeworkAction(createGeneratedBatchState(["q1", "q2", "q3"]), new Date(), "reduce", undefined, { reduceBy: 2 });
  assert.equal(generated.ok, true);
  if (generated.ok) {
    assert.deepEqual(generated.state.requiredQuestionIds, ["q1"]);
  }

  const started = applyAdminHomeworkAction(
    { ...createGeneratedBatchState(["q1", "q2"]), status: "STARTED", frozenAtIso: new Date().toISOString() },
    new Date(),
    "reduce",
  );
  assert.equal(started.ok, false);
});

test("parent/admin action appears in audit trail", () => {
  const result = applyAdminHomeworkAction(createGeneratedBatchState(["q1"]), new Date(), "unlock", "Parent approved alternative evidence");

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.audit[0]?.action, "unlock");
    assert.match(result.audit[0]?.reason ?? "", /alternative/i);
  }
});
