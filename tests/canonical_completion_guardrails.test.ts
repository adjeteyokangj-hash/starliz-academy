import test from "node:test";
import assert from "node:assert/strict";

import { computeCanonicalSessionMetrics, evaluateCanonicalProgressCompletion } from "../src/lib/canonical-learning-state";

test("Reading Try Another cannot complete unresolved session", () => {
  const session = computeCanonicalSessionMetrics({
    requiredItemIds: ["reading-1", "reading-2"],
    outcomes: {
      "reading-1": { state: "answered", correct: true },
      "reading-2": { state: "skipped", correct: false },
    },
  });

  assert.equal(session.canComplete, false);
  assert.equal(session.unresolvedCount, 1);
  assert.equal(session.completionReason, "unresolved_required_items");
});

test("Maths Try Another cannot complete unresolved session", () => {
  const session = computeCanonicalSessionMetrics({
    requiredItemIds: ["maths-1", "maths-2", "maths-3"],
    outcomes: {
      "maths-1": { state: "answered", correct: true },
      "maths-2": { state: "answered", correct: false },
      "maths-3": { state: "skipped", correct: false },
    },
  });

  assert.equal(session.canComplete, false);
  assert.equal(session.unresolvedCount, 1);
  assert.equal(session.skippedCount, 1);
});

test("/api/student/progress downgrades false completion when required count is not met", () => {
  const completion = evaluateCanonicalProgressCompletion({
    requiredQuestionCount: 5,
    answeredCount: 3,
    approvedSkippedCount: 1,
    attempts: 3,
    correct: 2,
    incorrect: 1,
    skippedCount: 1,
  });

  assert.equal(completion.canComplete, false);
  assert.equal(completion.downgraded, true);
  assert.equal(completion.resolvedCount, 4);
  assert.equal(completion.totalRequired, 5);
});
