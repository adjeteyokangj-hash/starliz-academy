import test from "node:test";
import assert from "node:assert/strict";

import {
  filterSessionCandidatesWithoutRepeats,
  nextPlannedStepIndex,
  shouldCompleteSessionAtStep,
  shouldReloadSessionPlan,
} from "../src/lib/spelling-session-runtime";

test("session plan does not regenerate mid-session", () => {
  assert.equal(shouldReloadSessionPlan(0), true);
  assert.equal(shouldReloadSessionPlan(1), false);
  assert.equal(shouldReloadSessionPlan(9), false);
});

test("question count/index remains stable and bounded by planned steps", () => {
  const totalSteps = 24;
  assert.equal(nextPlannedStepIndex(0, totalSteps), 1);
  assert.equal(nextPlannedStepIndex(18, totalSteps), 19);
  assert.equal(nextPlannedStepIndex(23, totalSteps), 23);
});

test("completion only triggers at final planned step", () => {
  const totalSteps = 24;
  assert.equal(shouldCompleteSessionAtStep({ reviewMode: false, sessionStepIndex: 18, totalSteps }), false);
  assert.equal(shouldCompleteSessionAtStep({ reviewMode: false, sessionStepIndex: 22, totalSteps }), false);
  assert.equal(shouldCompleteSessionAtStep({ reviewMode: false, sessionStepIndex: 23, totalSteps }), true);
  assert.equal(shouldCompleteSessionAtStep({ reviewMode: true, sessionStepIndex: 23, totalSteps }), false);
});

test("fallback selection avoids repeats before pool exhaustion", () => {
  const allWords = [
    { id: "w1", word: "cat" },
    { id: "w2", word: "dog" },
    { id: "w3", word: "sun" },
    { id: "w4", word: "book" },
  ];

  const candidates = filterSessionCandidatesWithoutRepeats({
    allWords,
    sessionWords: ["cat", "dog", "sun", "book"],
    recentIds: ["w2"],
    usedIds: new Set(["w1", "w3"]),
  });

  assert.deepEqual(candidates.map((entry) => entry.id), ["w4"]);
});