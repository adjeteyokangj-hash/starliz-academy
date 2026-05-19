/**
 * tests/tutor_runtime_state_machine.test.ts
 *
 * Pure function tests for state machine transitions.
 * No external dependencies, no side effects.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  createInitialContext,
  transition,
} from "@/lib/tutor-runtime/state-machine";
import type {
  AssignmentLoadedPayload,
  LessonStartedPayload,
  AnswerSubmittedPayload,
  AnswerCorrectPayload,
  AnswerWrongRetryPayload,
  AnswerFinalWrongPayload,
  ContinuedPayload,
  RetryClearedPayload,
  ReviewTriggeredPayload,
  ReviewBeganPayload,
  ReviewCompletePayload,
  LessonCompletedPayload,
  NextItemPayload,
} from "@/lib/tutor-runtime/types";

// ---------------------------------------------------------------------------
// Lifecycle Tests: Happy Path
// ---------------------------------------------------------------------------

test("ASSIGNMENT_LOADED: idle → lesson_active", () => {
  const context = createInitialContext("assign-1", 5);
  assert.equal(context.sessionState, "idle");

  const event: AssignmentLoadedPayload = {
    name: "ASSIGNMENT_LOADED",
    data: { assignmentId: "assign-1", itemCount: 5 },
  };

  const result = transition(context, event);
  assert.equal(result.ok, true);
  assert.equal(result.nextContext.sessionState, "lesson_active");
  assert.equal(result.nextContext.assignmentId, "assign-1");
  assert.equal(result.nextContext.itemCount, 5);
});

test("LESSON_STARTED: lesson_active → question_active", () => {
  const context = createInitialContext("assign-1", 5);
  context.sessionState = "lesson_active";

  const event: LessonStartedPayload = {
    name: "LESSON_STARTED",
    data: { gentleStart: false, startIndex: 0 },
  };

  const result = transition(context, event);
  assert.equal(result.ok, true);
  assert.equal(result.nextContext.sessionState, "question_active");
  assert.equal(result.nextContext.currentQuestionIndex, 0);
});

test("ANSWER_SUBMITTED: question_active → tracks attempt", () => {
  const context = createInitialContext("assign-1", 5);
  context.sessionState = "question_active";
  context.currentQuestionIndex = 0;

  const event: AnswerSubmittedPayload = {
    name: "ANSWER_SUBMITTED",
    data: {
      questionIndex: 0,
      answer: "test",
      attemptNumber: 1,
    },
  };

  const result = transition(context, event);
  assert.equal(result.ok, true);
  assert.equal(result.nextContext.totalAttempts, 1);

  const record = result.nextContext.questionRecords.get(0);
  assert.ok(record);
  assert.equal(record.state, "awaiting_evaluation");
  assert.equal(record.attemptCount, 1);
});

test("ANSWER_CORRECT: awaiting_evaluation → correct", () => {
  const context = createInitialContext("assign-1", 5);
  context.sessionState = "question_active";
  context.currentQuestionIndex = 0;

  // First submit answer
  const submitEvent: AnswerSubmittedPayload = {
    name: "ANSWER_SUBMITTED",
    data: {
      questionIndex: 0,
      answer: "correct",
      attemptNumber: 1,
    },
  };
  let result = transition(context, submitEvent);
  assert.equal(result.ok, true);

  // Then mark correct
  const correctEvent: AnswerCorrectPayload = {
    name: "ANSWER_CORRECT",
    data: { questionIndex: 0, firstTry: true, score: 100 },
  };
  result = transition(result.nextContext, correctEvent);
  assert.equal(result.ok, true);

  const record = result.nextContext.questionRecords.get(0);
  assert.ok(record);
  assert.equal(record.state, "correct");
  assert.equal(record.score, 100);
  assert.equal(record.firstTryCorrect, true);
});

test("ANSWER_WRONG_RETRY: awaiting_evaluation → wrong_retry", () => {
  const context = createInitialContext("assign-1", 5);
  context.sessionState = "question_active";
  context.currentQuestionIndex = 0;

  const submitEvent: AnswerSubmittedPayload = {
    name: "ANSWER_SUBMITTED",
    data: { questionIndex: 0, answer: "wrong", attemptNumber: 1 },
  };
  let result = transition(context, submitEvent);

  const wrongRetryEvent: AnswerWrongRetryPayload = {
    name: "ANSWER_WRONG_RETRY",
    data: { questionIndex: 0, attemptNumber: 1 },
  };
  result = transition(result.nextContext, wrongRetryEvent);
  assert.equal(result.ok, true);

  const record = result.nextContext.questionRecords.get(0);
  assert.ok(record);
  assert.equal(record.state, "wrong_retry");
});

test("ANSWER_FINAL_WRONG: awaiting_evaluation → wrong_skipped", () => {
  const context = createInitialContext("assign-1", 5);
  context.sessionState = "question_active";
  context.currentQuestionIndex = 0;

  const submitEvent: AnswerSubmittedPayload = {
    name: "ANSWER_SUBMITTED",
    data: { questionIndex: 0, answer: "wrong", attemptNumber: 1 },
  };
  let result = transition(context, submitEvent);

  const finalWrongEvent: AnswerFinalWrongPayload = {
    name: "ANSWER_FINAL_WRONG",
    data: { questionIndex: 0, attemptNumber: 1 },
  };
  result = transition(result.nextContext, finalWrongEvent);
  assert.equal(result.ok, true);

  const record = result.nextContext.questionRecords.get(0);
  assert.ok(record);
  assert.equal(record.state, "wrong_skipped");
});

test("RETRY_CLEARED: wrong_retry → unseen", () => {
  const context = createInitialContext("assign-1", 5);
  context.sessionState = "question_active";
  context.currentQuestionIndex = 0;

  let result = transition(context, {
    name: "ANSWER_SUBMITTED",
    data: { questionIndex: 0, answer: "wrong", attemptNumber: 1 },
  });
  assert.equal(result.ok, true);

  result = transition(result.nextContext, {
    name: "ANSWER_WRONG_RETRY",
    data: { questionIndex: 0, attemptNumber: 1 },
  });
  assert.equal(result.ok, true);

  const retryClearedEvent: RetryClearedPayload = {
    name: "RETRY_CLEARED",
    data: { questionIndex: 0 },
  };

  result = transition(result.nextContext, retryClearedEvent);
  assert.equal(result.ok, true);

  const record = result.nextContext.questionRecords.get(0);
  assert.ok(record);
  assert.equal(record.state, "unseen");
});

test("CONTINUED: allowed after correct feedback", () => {
  const context = createInitialContext("assign-1", 5);
  context.sessionState = "question_active";
  context.currentQuestionIndex = 0;

  let result = transition(context, {
    name: "ANSWER_SUBMITTED",
    data: { questionIndex: 0, answer: "correct", attemptNumber: 1 },
  });
  assert.equal(result.ok, true);

  result = transition(result.nextContext, {
    name: "ANSWER_CORRECT",
    data: { questionIndex: 0, firstTry: true, score: 100 },
  });
  assert.equal(result.ok, true);

  const continuedEvent: ContinuedPayload = {
    name: "CONTINUED",
    data: { questionIndex: 0 },
  };

  result = transition(result.nextContext, continuedEvent);
  assert.equal(result.ok, true);
  assert.equal(result.nextContext.sessionState, "question_active");
});

test("NEXT_ITEM: advance question index", () => {
  const context = createInitialContext("assign-1", 5);
  context.sessionState = "question_active";
  context.currentQuestionIndex = 0;

  const event: NextItemPayload = {
    name: "NEXT_ITEM",
    data: { currentIndex: 0, nextIndex: 1 },
  };

  const result = transition(context, event);
  assert.equal(result.ok, true);
  assert.equal(result.nextContext.currentQuestionIndex, 1);
});

test("REVIEW_TRIGGERED: question_active → review_active with queue", () => {
  const context = createInitialContext("assign-1", 5);
  context.sessionState = "question_active";
  context.currentQuestionIndex = 4;

  const event: ReviewTriggeredPayload = {
    name: "REVIEW_TRIGGERED",
    data: { reviewQueue: [1, 3] },
  };

  const result = transition(context, event);
  assert.equal(result.ok, true);
  assert.equal(result.nextContext.sessionState, "review_active");
  assert.equal(result.nextContext.reviewTriggered, true);
  assert.deepEqual(result.nextContext.reviewQueue, [1, 3]);
  assert.equal(result.nextContext.currentQuestionIndex, 1);
});

test("REVIEW_BEGAN: review_active → reviewInProgress", () => {
  const context = createInitialContext("assign-1", 5);
  context.sessionState = "review_active";
  context.reviewTriggered = true;

  const event: ReviewBeganPayload = {
    name: "REVIEW_BEGAN",
    data: { itemCount: 2 },
  };

  const result = transition(context, event);
  assert.equal(result.ok, true);
  assert.equal(result.nextContext.reviewInProgress, true);
});

test("REVIEW_COMPLETE: review_active → question_active", () => {
  const context = createInitialContext("assign-1", 5);
  context.sessionState = "review_active";
  context.reviewInProgress = true;

  const event: ReviewCompletePayload = {
    name: "REVIEW_COMPLETE",
    data: { improved: true },
  };

  const result = transition(context, event);
  assert.equal(result.ok, true);
  assert.equal(result.nextContext.sessionState, "question_active");
  assert.equal(result.nextContext.reviewInProgress, false);
});

test("LESSON_COMPLETED: any → completed with score", () => {
  const context = createInitialContext("assign-1", 5);
  context.sessionState = "question_active";

  const event: LessonCompletedPayload = {
    name: "LESSON_COMPLETED",
    data: { finalScore: 85, masteryReady: true },
  };

  const result = transition(context, event);
  assert.equal(result.ok, true);
  assert.equal(result.nextContext.sessionState, "completed");
  assert.equal(result.nextContext.finalScore, 85);
  assert.equal(result.nextContext.masteryReady, true);
});

// ---------------------------------------------------------------------------
// Rejection Tests: Invalid Transitions
// ---------------------------------------------------------------------------

test("LESSON_STARTED: rejected when not in lesson_active", () => {
  const context = createInitialContext("assign-1", 5);
  context.sessionState = "idle";

  const event: LessonStartedPayload = {
    name: "LESSON_STARTED",
    data: { gentleStart: false },
  };

  const result = transition(context, event);
  assert.equal(result.ok, false);
  assert.match(result.reason!, /only valid in lesson_active/);
});

test("ANSWER_SUBMITTED: rejected when not in question_active or review_active", () => {
  const context = createInitialContext("assign-1", 5);
  context.sessionState = "idle";

  const event: AnswerSubmittedPayload = {
    name: "ANSWER_SUBMITTED",
    data: { questionIndex: 0, answer: "test", attemptNumber: 1 },
  };

  const result = transition(context, event);
  assert.equal(result.ok, false);
});

test("ANSWER_CORRECT: rejected when question not in awaiting_evaluation", () => {
  const context = createInitialContext("assign-1", 5);
  context.sessionState = "question_active";
  context.currentQuestionIndex = 0;

  const event: AnswerCorrectPayload = {
    name: "ANSWER_CORRECT",
    data: { questionIndex: 0, firstTry: true, score: 100 },
  };

  const result = transition(context, event);
  assert.equal(result.ok, false);
  assert.match(result.reason!, /not in awaiting_evaluation/);
});

test("NEXT_ITEM: rejected when index out of bounds", () => {
  const context = createInitialContext("assign-1", 5);
  context.sessionState = "question_active";

  const event: NextItemPayload = {
    name: "NEXT_ITEM",
    data: { currentIndex: 4, nextIndex: 10 },
  };

  const result = transition(context, event);
  assert.equal(result.ok, false);
  assert.match(result.reason!, /out of bounds/);
});

test("RETRY_CLEARED: rejected when not in wrong_retry state", () => {
  const context = createInitialContext("assign-1", 5);
  context.sessionState = "question_active";
  context.currentQuestionIndex = 0;

  const event: RetryClearedPayload = {
    name: "RETRY_CLEARED",
    data: { questionIndex: 0 },
  };

  const result = transition(context, event);
  assert.equal(result.ok, false);
  assert.match(result.reason!, /not in wrong_retry/);
});

test("CONTINUED: rejected when question has no resolved outcome", () => {
  const context = createInitialContext("assign-1", 5);
  context.sessionState = "question_active";
  context.currentQuestionIndex = 0;

  const event: ContinuedPayload = {
    name: "CONTINUED",
    data: { questionIndex: 0 },
  };

  const result = transition(context, event);
  assert.equal(result.ok, false);
  assert.match(result.reason!, /cannot continue/);
});

// ---------------------------------------------------------------------------
// State Invariant Tests
// ---------------------------------------------------------------------------

test("Question records are immutable; original not modified", () => {
  const context = createInitialContext("assign-1", 5);
  context.sessionState = "question_active";

  const event: AnswerSubmittedPayload = {
    name: "ANSWER_SUBMITTED",
    data: { questionIndex: 0, answer: "test", attemptNumber: 1 },
  };

  const result = transition(context, event);
  assert.equal(result.ok, true);

  // Original context unchanged
  assert.equal(context.questionRecords.size, 0);
  // New context has the record
  assert.equal(result.nextContext.questionRecords.size, 1);
});

test("Multiple attempts on same question accumulate", () => {
  let context = createInitialContext("assign-1", 5);
  context.sessionState = "question_active";

  // First attempt
  let event: AnswerSubmittedPayload = {
    name: "ANSWER_SUBMITTED",
    data: { questionIndex: 0, answer: "wrong1", attemptNumber: 1 },
  };
  let result = transition(context, event);
  assert.equal(result.nextContext.totalAttempts, 1);

  context = result.nextContext;

  // Second attempt (after wrong_retry)
  const retryEvent: AnswerWrongRetryPayload = {
    name: "ANSWER_WRONG_RETRY",
    data: { questionIndex: 0, attemptNumber: 1 },
  };
  result = transition(context, retryEvent);
  context = result.nextContext;

  // Retry cleared
  event = {
    name: "ANSWER_SUBMITTED",
    data: { questionIndex: 0, answer: "wrong2", attemptNumber: 2 },
  };
  result = transition(context, event);
  assert.equal(result.nextContext.totalAttempts, 2);

  const record = result.nextContext.questionRecords.get(0);
  assert.ok(record);
  assert.equal(record.attemptCount, 2);
});

test("Context timestamps update on each transition", () => {
  const context = createInitialContext("assign-1", 5);
  const initialUpdatedAt = context.updatedAt;

  const event: AssignmentLoadedPayload = {
    name: "ASSIGNMENT_LOADED",
    data: { assignmentId: "assign-1", itemCount: 5 },
  };

  // Wait a tiny bit to ensure timestamp differs
  const start = Date.now();
  const result = transition(context, event);
  while (Date.now() === start) {
    // Spin to ensure time passes
  }

  assert.ok(result.nextContext.updatedAt > initialUpdatedAt);
});

// ---------------------------------------------------------------------------
// Complex Scenario Tests
// ---------------------------------------------------------------------------

test("Full lesson flow: ASSIGNMENT_LOADED → LESSON_STARTED → Q1 correct → LESSON_COMPLETED", () => {
  let context = createInitialContext("assign-1", 1);

  // ASSIGNMENT_LOADED
  let result = transition(context, {
    name: "ASSIGNMENT_LOADED" as const,
    data: { assignmentId: "assign-1", itemCount: 1 },
  });
  assert.equal(result.ok, true);
  context = result.nextContext;

  // LESSON_STARTED
  result = transition(context, {
    name: "LESSON_STARTED" as const,
    data: { startIndex: 0 },
  });
  assert.equal(result.ok, true);
  context = result.nextContext;

  // ANSWER_SUBMITTED
  result = transition(context, {
    name: "ANSWER_SUBMITTED" as const,
    data: { questionIndex: 0, answer: "correct", attemptNumber: 1 },
  });
  assert.equal(result.ok, true);
  context = result.nextContext;

  // ANSWER_CORRECT
  result = transition(context, {
    name: "ANSWER_CORRECT" as const,
    data: { questionIndex: 0, firstTry: true, score: 100 },
  });
  assert.equal(result.ok, true);
  context = result.nextContext;

  // LESSON_COMPLETED
  result = transition(context, {
    name: "LESSON_COMPLETED" as const,
    data: { finalScore: 100, masteryReady: true },
  });
  assert.equal(result.ok, true);
  assert.equal(result.nextContext.sessionState, "completed");
  assert.equal(result.nextContext.masteryReady, true);
});

test("Review flow: question wrong → REVIEW_TRIGGERED → correct in review → REVIEW_COMPLETE", () => {
  let context = createInitialContext("assign-1", 2);
  context.sessionState = "question_active";
  context.currentQuestionIndex = 0;

  // ANSWER_SUBMITTED
  let result = transition(context, {
    name: "ANSWER_SUBMITTED" as const,
    data: { questionIndex: 0, answer: "wrong", attemptNumber: 1 },
  });
  context = result.nextContext;

  // ANSWER_FINAL_WRONG
  result = transition(context, {
    name: "ANSWER_FINAL_WRONG" as const,
    data: { questionIndex: 0, attemptNumber: 1 },
  });
  context = result.nextContext;

  // NEXT_ITEM (go to Q2)
  result = transition(context, {
    name: "NEXT_ITEM" as const,
    data: { currentIndex: 0, nextIndex: 1 },
  });
  context = result.nextContext;

  // ... complete Q2 ...

  // REVIEW_TRIGGERED
  result = transition(context, {
    name: "REVIEW_TRIGGERED" as const,
    data: { reviewQueue: [0] },
  });
  assert.equal(result.nextContext.sessionState, "review_active");
  context = result.nextContext;

  // REVIEW_BEGAN
  result = transition(context, {
    name: "REVIEW_BEGAN" as const,
    data: { itemCount: 1 },
  });
  context = result.nextContext;

  // ANSWER_SUBMITTED (review Q0)
  result = transition(context, {
    name: "ANSWER_SUBMITTED" as const,
    data: { questionIndex: 0, answer: "correct", attemptNumber: 2 },
  });
  context = result.nextContext;

  // ANSWER_CORRECT
  result = transition(context, {
    name: "ANSWER_CORRECT" as const,
    data: { questionIndex: 0, firstTry: false, score: 80 },
  });
  context = result.nextContext;

  // REVIEW_COMPLETE
  result = transition(context, {
    name: "REVIEW_COMPLETE" as const,
    data: { improved: true },
  });
  assert.equal(result.ok, true);
  assert.equal(result.nextContext.sessionState, "question_active");
  assert.equal(result.nextContext.reviewTriggered, false);
});
