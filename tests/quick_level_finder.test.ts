import test from "node:test";
import assert from "node:assert/strict";

import {
  buildQuestionPlan,
  deriveQuickLevelFinderLevels,
  parseQuickLevelFinderSession,
  questionRangeBySubjectCount,
  quickLevelFinderPlacementCompleted,
  quickLevelFinderResponseCount,
  upsertQuickLevelFinderSession,
  type QuickLevelFinderSession,
} from "../src/lib/quick-level-finder";

test("questionRangeBySubjectCount returns expected ranges", () => {
  assert.deepEqual(questionRangeBySubjectCount(2), { min: 18, max: 24 });
  assert.deepEqual(questionRangeBySubjectCount(4), { min: 24, max: 32 });
  assert.deepEqual(questionRangeBySubjectCount(5), { min: 25, max: 35 });
});

test("buildQuestionPlan distributes subjects in round robin", () => {
  const plan = buildQuestionPlan(["english:reading", "maths"], 5);
  assert.equal(plan.length, 5);
  assert.deepEqual(plan.map((q) => q.subject), ["english:reading", "maths", "english:reading", "maths", "english:reading"]);
  assert.equal(plan[0].id, "qlf-q-1");
  assert.equal(plan[4].id, "qlf-q-5");
});

test("deriveQuickLevelFinderLevels computes below and advanced levels", () => {
  const levels = deriveQuickLevelFinderLevels({
    scopedSubjects: ["maths", "english:grammar"],
    responses: [
      { questionId: "q1", subject: "maths", correct: true, timeSpentMs: 0, answeredAt: new Date().toISOString() },
      { questionId: "q2", subject: "maths", correct: false, timeSpentMs: 0, answeredAt: new Date().toISOString() },
      { questionId: "q3", subject: "english:grammar", correct: true, timeSpentMs: 0, answeredAt: new Date().toISOString() },
      { questionId: "q4", subject: "english:grammar", correct: true, timeSpentMs: 0, answeredAt: new Date().toISOString() },
    ],
  });

  assert.equal(levels.maths.accuracy, 50);
  assert.equal(levels.maths.level, "below");
  assert.equal(levels["english:grammar"].accuracy, 100);
  assert.equal(levels["english:grammar"].level, "advanced");
});

test("upsert and parse roundtrip keeps session state", () => {
  const session: QuickLevelFinderSession = {
    sessionId: "session-1",
    status: "in_progress",
    startedAt: new Date().toISOString(),
    completedAt: null,
    selectedSubjects: ["english", "maths"],
    scopedSubjects: ["english:reading", "maths"],
    questions: [{ id: "qlf-q-1", subject: "english:reading" }],
    cursor: 0,
    responses: [],
    levels: {},
  };

  const merged = upsertQuickLevelFinderSession(JSON.stringify({ foo: "bar" }), session);
  const parsed = parseQuickLevelFinderSession(merged);

  assert.ok(parsed);
  assert.equal(parsed?.sessionId, "session-1");
  assert.deepEqual(parsed?.selectedSubjects, ["english", "maths"]);
});

test("placement helpers read completion and response counts", () => {
  const profileJson = JSON.stringify({
    quickLevelFinder: {
      sessionId: "session-2",
      status: "completed",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      selectedSubjects: ["maths"],
      scopedSubjects: ["maths"],
      questions: [{ id: "qlf-q-1", subject: "maths" }],
      cursor: 1,
      responses: [{ questionId: "qlf-q-1", subject: "maths", correct: true, timeSpentMs: 1200, answeredAt: new Date().toISOString() }],
      levels: { maths: { accuracy: 100, level: "advanced" } },
    },
  });

  assert.equal(quickLevelFinderPlacementCompleted(profileJson), true);
  assert.equal(quickLevelFinderResponseCount(profileJson), 1);
});
