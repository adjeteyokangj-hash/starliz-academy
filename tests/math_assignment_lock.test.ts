import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMathRequiredItemIds,
  resolveAssignmentSessionDecision,
  resolveNextAssignedMathQuestion,
  shouldCompleteOnAssignedExhaustion,
} from "../src/lib/math-assignment-session";

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

test("completing 5 of 9 does not satisfy canonical exhaustion completion gate", () => {
  const shouldComplete = shouldCompleteOnAssignedExhaustion(false);
  assert.equal(shouldComplete, false);
});

test("assignment exhaustion completion requires canonical completion", () => {
  assert.equal(shouldCompleteOnAssignedExhaustion(false), false);
  assert.equal(shouldCompleteOnAssignedExhaustion(true), true);
});
