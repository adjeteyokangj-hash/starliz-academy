import test from "node:test";
import assert from "node:assert/strict";

import { resolveAssignmentSessionDecision } from "../src/lib/math-assignment-session";

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
