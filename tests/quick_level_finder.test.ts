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
  const plan = buildQuestionPlan({
    scopedSubjects: ["english:reading", "maths"],
    count: 5,
    yearGroup: "Year 5",
    keyStage: "KS2",
    sessionId: "test-session",
  });
  assert.equal(plan.length, 5);
  assert.deepEqual(new Set(plan.map((q) => q.subject)), new Set(["english", "maths"]));
  assert.equal(plan.some((q) => q.strand === "reading"), true);
  assert.equal(plan.every((q) => q.yearGroup === "Year 5"), true);
  assert.equal(plan.every((q) => q.choices.length >= 2), true);
  assert.equal(plan.every((q) => q.correctIndex >= 0 && q.correctIndex < q.choices.length), true);
  assert.equal(plan.every((q) => /^qlf-q-\d+$/.test(q.id)), true);
});

test("buildQuestionPlan avoids repeated prompts within each default Year 10 subject", () => {
  const plan = buildQuestionPlan({
    scopedSubjects: ["maths", "english", "science"],
    count: 15,
    yearGroup: "Year 10",
    keyStage: "KS4",
    sessionId: "repeat-check-session",
  });

  const bySubject: Record<string, Set<string>> = {};
  const counts: Record<string, number> = {};
  for (const question of plan) {
    bySubject[question.subject] = bySubject[question.subject] ?? new Set<string>();
    counts[question.subject] = (counts[question.subject] ?? 0) + 1;
    bySubject[question.subject].add(question.prompt);
  }

  for (const subject of ["maths", "english", "science"]) {
    assert.equal(counts[subject], 5);
    assert.equal(bySubject[subject].size, 5);
  }
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
    questions: [{
      id: "qlf-q-1",
      subject: "english",
      strand: "reading",
      topic: "Vocabulary and meaning",
      prompt: "Year 5 English reading: read a short passage and choose the best answer about vocabulary and meaning.",
      choices: [
        "Pick the answer directly supported by the text.",
        "Choose the option with the longest sentence.",
        "Pick the answer with the hardest word.",
        "Choose any option with punctuation.",
      ],
      correctIndex: 0,
      difficulty: 3,
      yearGroup: "Year 5",
      keyStage: "KS2",
    }],
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
      questions: [{
        id: "qlf-q-1",
        subject: "maths",
        strand: null,
        topic: "Calculation and number",
        prompt: "Year 5 Maths: solve a calculation and number question at a secure level.",
        choices: [
          "Use place value and operations correctly to solve the problem.",
          "Round every number before solving.",
          "Always multiply first regardless of context.",
          "Choose the largest number shown.",
        ],
        correctIndex: 0,
        difficulty: 3,
        yearGroup: "Year 5",
        keyStage: "KS2",
      }],
      cursor: 1,
      responses: [{ questionId: "qlf-q-1", subject: "maths", correct: true, timeSpentMs: 1200, answeredAt: new Date().toISOString() }],
      levels: { maths: { accuracy: 100, level: "advanced" } },
    },
  });

  assert.equal(quickLevelFinderPlacementCompleted(profileJson), true);
  assert.equal(quickLevelFinderResponseCount(profileJson), 1);
});
