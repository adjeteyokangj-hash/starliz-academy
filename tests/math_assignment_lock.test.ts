import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMathCompletionSnapshot,
  buildMathSessionSummaryMetrics,
  buildMathRequiredItemIds,
  canAutoSelectMathQuestion,
  isStaleAssignmentResponse,
  isTerminalMathLifecycle,
  resolveAssignmentSessionDecision,
  resolveAuthoritativeSessionTotal,
  resolveNextAssignedMathQuestion,
  selectNextPendingAssignment,
  shouldCompleteOnAssignedExhaustion,
  taskPathForAssignedSubject,
  MATH_NEXT_SESSION_DASHBOARD_HREF,
} from "../src/lib/math-assignment-session";
import { computeCanonicalSessionMetrics } from "../src/lib/canonical-learning-state";

test("assigned maths session does not allow static fallback when assigned content is exhausted", () => {
  const decision = resolveAssignmentSessionDecision({
    assignmentLocked: true,
    assignedQuestionAvailable: false,
  });

  assert.equal(decision.assignmentLocked, true);
  assert.equal(decision.assignmentExhausted, true);
  assert.equal(decision.allowStaticFallback, false);
});

test("assigned maths session stays locked when assigned question is available", () => {
  const decision = resolveAssignmentSessionDecision({
    assignmentLocked: true,
    assignedQuestionAvailable: true,
  });

  assert.equal(decision.assignmentLocked, true);
  assert.equal(decision.assignmentExhausted, false);
  assert.equal(decision.allowStaticFallback, false);
});

test("non-assigned maths session allows static fallback", () => {
  const decision = resolveAssignmentSessionDecision({
    assignmentLocked: false,
    assignedQuestionAvailable: false,
  });

  assert.equal(decision.assignmentLocked, false);
  assert.equal(decision.assignmentExhausted, false);
  assert.equal(decision.allowStaticFallback, true);
});

test("assigned maths uses preloaded 10-question IDs as required steps", () => {
  const assignedQuestions = Array.from({ length: 10 }, (_, index) => ({ id: `assigned-${index + 1}` }));
  const requiredIds = buildMathRequiredItemIds({
    assignmentLocked: true,
    assignedQuestions,
    sessionQuestionTarget: 10,
  });

  assert.equal(requiredIds.length, 10);
  assert.deepEqual(requiredIds, assignedQuestions.map((question) => question.id));
});

test("progress consistency: 9-question assigned session stays 0/9 → 9/9 and never 9/12", () => {
  const assignedQuestions = Array.from({ length: 9 }, (_, index) => ({ id: `assigned-${index + 1}` }));
  const frozenTotal = resolveAuthoritativeSessionTotal({
    assignmentLocked: true,
    assignedQuestionCount: assignedQuestions.length,
    frozenAssignedTotal: assignedQuestions.length,
    retryPackMode: false,
    retryInitialCount: 0,
    standardTarget: 10,
  });
  assert.equal(frozenTotal, 9);

  const requiredIds = buildMathRequiredItemIds({
    assignmentLocked: true,
    assignedQuestions,
    sessionQuestionTarget: frozenTotal,
  });
  assert.equal(requiredIds.length, 9);

  const emptyOutcomes = computeCanonicalSessionMetrics({
    requiredItemIds: requiredIds,
    outcomes: {},
  });
  assert.equal(emptyOutcomes.totalRequired, 9);
  assert.equal(emptyOutcomes.answeredCount, 0);

  const completedOutcomes = Object.fromEntries(
    requiredIds.map((id) => [id, { state: "answered" as const, correct: true }]),
  );
  const done = computeCanonicalSessionMetrics({
    requiredItemIds: requiredIds,
    outcomes: completedOutcomes,
  });
  assert.equal(done.totalRequired, 9);
  assert.equal(done.answeredCount, 9);
  assert.equal(done.canComplete, true);

  const summary = buildMathSessionSummaryMetrics({
    canonical: { totalRequired: done.totalRequired, correctCount: done.correctCount },
    sessionQuestionTarget: frozenTotal,
    sessionCorrect: 9,
    sessionAttempts: 9,
  });
  assert.equal(summary.totalQuestions, 9);
  assert.equal(summary.correctQuestions, 9);

  const snapshot = buildMathCompletionSnapshot({
    assignmentId: "assignment-a",
    answeredCount: 9,
    totalCount: frozenTotal,
    correctCount: 9,
    skippedCount: 0,
  });
  assert.equal(snapshot.totalCount, 9);
  assert.equal(`${snapshot.correctCount}/${snapshot.totalCount}`, "9/9");
  assert.notEqual(`${snapshot.correctCount}/${snapshot.totalCount}`, "9/12");

  // Library/daily target of 12 must not change the frozen assigned total.
  const stillNine = resolveAuthoritativeSessionTotal({
    assignmentLocked: true,
    assignedQuestionCount: 0,
    frozenAssignedTotal: 9,
    retryPackMode: false,
    retryInitialCount: 0,
    standardTarget: 12,
  });
  assert.equal(stillNine, 9);
});

test("assigned locked mode does not call cursor fetch per question", async () => {
  const assignedQuestions = [{ id: "assigned-1" }, { id: "assigned-2" }, { id: "assigned-3" }];
  let cursorFetchCalls = 0;

  const question = await resolveNextAssignedMathQuestion({
    assignmentLocked: true,
    assignedQuestions,
    sessionStep: 1,
    fetchCursorQuestion: async () => {
      cursorFetchCalls += 1;
      return { id: "cursor-question" };
    },
  });

  assert.deepEqual(question, { id: "assigned-2" });
  assert.equal(cursorFetchCalls, 0);
});

test("advancing from Q1 must request sessionStep 1 (not stale 0) so Q2 is not a duplicate", async () => {
  // Regression: advanceSession used to call moveToNextQuestion with a closed-over
  // pre-increment sessionStep, so Question 2 of N showed assignedQuestions[0] again.
  const assignedQuestions = [
    { id: "farmer-7x8", prompt: "A farmer has 7 fields..." },
    { id: "different-q2", prompt: "Different second question" },
    { id: "q3", prompt: "Third" },
  ];

  const question1 = await resolveNextAssignedMathQuestion({
    assignmentLocked: true,
    assignedQuestions,
    sessionStep: 0,
  });
  const staleAdvanceWouldReload = await resolveNextAssignedMathQuestion({
    assignmentLocked: true,
    assignedQuestions,
    sessionStep: 0,
  });
  const correctAdvance = await resolveNextAssignedMathQuestion({
    assignmentLocked: true,
    assignedQuestions,
    sessionStep: 1,
  });

  assert.equal(question1?.id, "farmer-7x8");
  assert.equal(staleAdvanceWouldReload?.id, question1?.id, "stale step 0 would duplicate Q1 as Q2");
  assert.equal(correctAdvance?.id, "different-q2");
  assert.notEqual(correctAdvance?.id, question1?.id);
});

test("completing 5 of 9 does not satisfy canonical exhaustion completion gate", () => {
  const shouldComplete = shouldCompleteOnAssignedExhaustion(false);
  assert.equal(shouldComplete, false);
});

test("assignment exhaustion completion requires canonical completion", () => {
  assert.equal(shouldCompleteOnAssignedExhaustion(false), false);
  assert.equal(shouldCompleteOnAssignedExhaustion(true), true);
});

test("session summary for a 9-question assigned run reports 9/9 when all required questions are correct", () => {
  const summary = buildMathSessionSummaryMetrics({
    canonical: {
      totalRequired: 9,
      correctCount: 9,
    },
    sessionQuestionTarget: 9,
    sessionCorrect: 9,
    sessionAttempts: 9,
  });

  assert.equal(summary.totalQuestions, 9);
  assert.equal(summary.correctQuestions, 9);
  assert.equal(summary.accuracyPct, 100);
});

test("next pending assignment selection does not return the completed current assignment", () => {
  const next = selectNextPendingAssignment({
    currentAssignmentId: "assignment-1",
    assignments: [
      { id: "assignment-1", status: "in_progress", href: "/games/math?assignmentId=assignment-1", createdAt: "2026-07-01T10:00:00.000Z" },
      { id: "assignment-2", status: "assigned", href: "/games/reading?assignmentId=assignment-2", createdAt: "2026-07-01T11:00:00.000Z" },
    ],
  });

  assert.equal(next?.id, "assignment-2");
});

test("next assignment preserves API response order", () => {
  const next = selectNextPendingAssignment({
    currentAssignmentId: "assignment-a",
    assignments: [
      { id: "assignment-c", status: "assigned", createdAt: "2026-07-03T10:00:00.000Z" },
      { id: "assignment-b", status: "assigned", createdAt: "2026-07-02T10:00:00.000Z" },
      { id: "assignment-a", status: "completed", createdAt: "2026-07-01T10:00:00.000Z" },
    ],
  });

  // First eligible entry in the API array wins (no createdAt re-sort).
  assert.equal(next?.id, "assignment-c");
});

test("empty locked assigned total does not invent 1", () => {
  const total = resolveAuthoritativeSessionTotal({
    assignmentLocked: true,
    assignedQuestionCount: 0,
    frozenAssignedTotal: null,
    retryPackMode: false,
    retryInitialCount: 0,
    standardTarget: 10,
  });
  assert.equal(total, 0);
});

test("next pending assignment selection returns null when no other pending assignment exists", () => {
  const next = selectNextPendingAssignment({
    currentAssignmentId: "assignment-1",
    assignments: [
      { id: "assignment-1", status: "in_progress" },
      { id: "assignment-3", status: "completed" },
      { id: "assignment-4", status: "archived" },
      { id: "assignment-5", status: "cancelled" },
      { id: "assignment-6", status: "expired" },
    ],
  });

  assert.equal(next, null);
});

test("final assignment: next picker never restarts the completed assignment id", () => {
  const next = selectNextPendingAssignment({
    currentAssignmentId: "assignment-only",
    assignments: [
      { id: "assignment-only", status: "completed", createdAt: "2026-07-01T10:00:00.000Z" },
    ],
  });
  assert.equal(next, null);

  const stillSelf = selectNextPendingAssignment({
    currentAssignmentId: "assignment-only",
    assignments: [
      { id: "assignment-only", status: "assigned", createdAt: "2026-07-01T10:00:00.000Z" },
    ],
  });
  assert.equal(stillSelf, null);
});

test("final assignment dashboard href stays on student refresh route", () => {
  assert.equal(MATH_NEXT_SESSION_DASHBOARD_HREF, "/student/dashboard?refresh=1");
});

test("completion lifecycle blocks auto-selection until explicit launch", () => {
  assert.equal(canAutoSelectMathQuestion("idle"), true);
  assert.equal(canAutoSelectMathQuestion("loading"), true);
  assert.equal(canAutoSelectMathQuestion("active"), true);
  assert.equal(canAutoSelectMathQuestion("completing"), false);
  assert.equal(canAutoSelectMathQuestion("completed"), false);
  assert.equal(canAutoSelectMathQuestion("launching-next"), false);
  assert.equal(isTerminalMathLifecycle("completed"), true);
  assert.equal(isTerminalMathLifecycle("launching-next"), true);
  assert.equal(isTerminalMathLifecycle("active"), false);
});

test("completion snapshot stays stable when later totals change", () => {
  const snapshot = buildMathCompletionSnapshot({
    assignmentId: "assignment-a",
    contentId: "content-a",
    answeredCount: 8,
    totalCount: 9,
    correctCount: 8,
    skippedCount: 1,
  });

  const laterLibraryTotal = resolveAuthoritativeSessionTotal({
    assignmentLocked: true,
    assignedQuestionCount: 12,
    frozenAssignedTotal: snapshot.totalCount,
    retryPackMode: false,
    retryInitialCount: 0,
    standardTarget: 12,
  });

  assert.equal(laterLibraryTotal, 9);
  assert.equal(snapshot.totalCount, 9);
  assert.equal(snapshot.answeredCount + snapshot.skippedCount, 9);
  assert.equal(`${snapshot.correctCount}/${snapshot.totalCount}`, "8/9");
  assert.equal(snapshot.assignmentId, "assignment-a");
});

test("stale assignment response protection rejects late responses from prior assignment", () => {
  assert.equal(isStaleAssignmentResponse({
    requestToken: 1,
    activeToken: 2,
    requestAssignmentId: "assignment-a",
    activeAssignmentId: "assignment-b",
    requestContentId: "content-a",
    activeContentId: "content-b",
  }), true);

  assert.equal(isStaleAssignmentResponse({
    requestToken: 2,
    activeToken: 2,
    requestAssignmentId: "assignment-b",
    activeAssignmentId: "assignment-b",
    requestContentId: "content-b",
    activeContentId: "content-b",
  }), false);

  assert.equal(isStaleAssignmentResponse({
    requestToken: 2,
    activeToken: 2,
    requestAssignmentId: "assignment-a",
    activeAssignmentId: "assignment-b",
    requestContentId: "content-a",
    activeContentId: "content-b",
  }), true);
});

test("next assignment B uses its own identity and question set start index", async () => {
  const assignmentAQuestions = Array.from({ length: 9 }, (_, index) => ({ id: `a-${index + 1}` }));
  const assignmentBQuestions = Array.from({ length: 5 }, (_, index) => ({ id: `b-${index + 1}` }));

  const next = selectNextPendingAssignment({
    currentAssignmentId: "assignment-a",
    assignments: [
      { id: "assignment-a", status: "completed", contentId: "content-a", createdAt: "2026-07-01T10:00:00.000Z" },
      { id: "assignment-b", status: "assigned", contentId: "content-b", createdAt: "2026-07-02T10:00:00.000Z" },
    ],
  });
  assert.equal(next?.id, "assignment-b");
  assert.notEqual(next?.id, "assignment-a");
  assert.equal(next?.contentId, "content-b");

  const bTotal = resolveAuthoritativeSessionTotal({
    assignmentLocked: true,
    assignedQuestionCount: assignmentBQuestions.length,
    frozenAssignedTotal: assignmentBQuestions.length,
    retryPackMode: false,
    retryInitialCount: 0,
    standardTarget: assignmentAQuestions.length,
  });
  assert.equal(bTotal, 5);

  const firstB = await resolveNextAssignedMathQuestion({
    assignmentLocked: true,
    assignedQuestions: assignmentBQuestions,
    sessionStep: 0,
  });
  assert.deepEqual(firstB, { id: "b-1" });
  assert.equal(`0/${bTotal}`, "0/5");
});

test("session summary avoids 0/0 after answered session even when canonical required count is missing", () => {
  const summary = buildMathSessionSummaryMetrics({
    canonical: {
      totalRequired: 0,
      correctCount: 0,
    },
    sessionQuestionTarget: 9,
    sessionCorrect: 6,
    sessionAttempts: 9,
  });

  assert.equal(summary.totalQuestions, 9);
  assert.equal(summary.correctQuestions, 6);
  assert.equal(summary.accuracyPct, 67);
});

test("subject routing helper maps queue subjects to game paths", () => {
  assert.equal(taskPathForAssignedSubject("math"), "math");
  assert.equal(taskPathForAssignedSubject("maths"), "math");
  assert.equal(taskPathForAssignedSubject("reading"), "reading");
  assert.equal(taskPathForAssignedSubject("spelling"), "spelling");
  assert.equal(taskPathForAssignedSubject("unknown"), "spelling");
});
