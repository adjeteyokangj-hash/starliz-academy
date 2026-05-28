import test from "node:test";
import assert from "node:assert/strict";

import {
  autoQuickLevelFinderSubjectsForYearGroup,
  buildQuestionPlan,
  containsBlockedPhrase,
  deriveQuickLevelFinderLevels,
  normaliseSubjectStrandForQlf,
  parseQuickLevelFinderSession,
  questionHasBlockedContent,
  questionRangeBySubjectCount,
  quickLevelFinderPlacementCompleted,
  quickLevelFinderResponseCount,
  sanitiseQuestion,
  upsertQuickLevelFinderSession,
  type QuickLevelFinderQuestion,
  type QuickLevelFinderSession,
} from "../src/lib/quick-level-finder";

const BLOCKED_PHRASES = [
  "Subject check",
  "Which answer is most accurate for this topic",
  "The evidence-based answer",
  "The answer with the longest sentence",
  "The answer with unusual punctuation",
  "The first answer shown",
] as const;

const ALL_YEAR_GROUPS = [
  "Reception",
  "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6",
  "Year 7", "Year 8", "Year 9", "Year 10", "Year 11",
];

function hasBlockedWording(text: string): boolean {
  const lower = text.toLowerCase();
  return BLOCKED_PHRASES.some((p) => lower.includes(p.toLowerCase()));
}

function questionContainsBlockedWording(q: QuickLevelFinderQuestion): boolean {
  return hasBlockedWording(q.topic) || hasBlockedWording(q.prompt) || q.choices.some((c) => hasBlockedWording(c));
}

// ----- normalisation helpers -----

test("normaliseSubjectStrandForQlf maps reading to english:reading", () => {
  assert.deepEqual(normaliseSubjectStrandForQlf("reading", null), { subject: "english", strand: "reading" });
});

test("normaliseSubjectStrandForQlf maps spelling to english:spelling", () => {
  assert.deepEqual(normaliseSubjectStrandForQlf("spelling", null), { subject: "english", strand: "spelling" });
});

test("normaliseSubjectStrandForQlf maps grammar to english:grammar", () => {
  assert.deepEqual(normaliseSubjectStrandForQlf("grammar", null), { subject: "english", strand: "grammar" });
});

test("normaliseSubjectStrandForQlf maps vocabulary to english:vocabulary", () => {
  assert.deepEqual(normaliseSubjectStrandForQlf("vocabulary", null), { subject: "english", strand: "vocabulary" });
});

test("normaliseSubjectStrandForQlf keeps maths unchanged", () => {
  assert.deepEqual(normaliseSubjectStrandForQlf("maths", null), { subject: "maths", strand: null });
});

test("normaliseSubjectStrandForQlf keeps english with existing strand", () => {
  assert.deepEqual(normaliseSubjectStrandForQlf("english", "reading"), { subject: "english", strand: "reading" });
});

// ----- blocked phrase detection -----

test("containsBlockedPhrase detects known placeholder phrases", () => {
  assert.equal(containsBlockedPhrase("Subject check"), true);
  assert.equal(containsBlockedPhrase("Which answer is most accurate for this topic"), true);
  assert.equal(containsBlockedPhrase("The evidence-based answer."), true);
  assert.equal(containsBlockedPhrase("The answer with the longest sentence."), true);
  assert.equal(containsBlockedPhrase("The answer with unusual punctuation."), true);
  assert.equal(containsBlockedPhrase("The first answer shown."), true);
});

test("containsBlockedPhrase does not flag real question content", () => {
  assert.equal(containsBlockedPhrase("Year 4 Reading: In the phrase \"over the moon\", what does it mean?"), false);
  assert.equal(containsBlockedPhrase("Very happy"), false);
  assert.equal(containsBlockedPhrase("necessary"), false);
});

// ----- primary auto subjects produce real questions -----

test("primary year groups auto subjects include reading and spelling", () => {
  for (const yr of ["Reception", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6"]) {
    const subjects = autoQuickLevelFinderSubjectsForYearGroup(yr);
    assert.ok(subjects.includes("reading"), `${yr} should include reading`);
    assert.ok(subjects.includes("spelling"), `${yr} should include spelling`);
  }
});

test("Year 4 reading questions do not return blocked placeholder wording", () => {
  const plan = buildQuestionPlan({
    scopedSubjects: ["reading"],
    count: 3,
    yearGroup: "Year 4",
    keyStage: "KS2",
    sessionId: "test-year4-reading",
  });
  assert.equal(plan.length, 3);
  for (const q of plan) {
    assert.equal(q.subject, "english", "subject should be normalised to english");
    assert.equal(q.strand, "reading", "strand should be reading");
    assert.equal(questionContainsBlockedWording(q), false, `Year 4 reading question has blocked wording: ${q.topic} | ${q.prompt}`);
    assert.ok(q.topic.toLowerCase().includes("reading") || q.topic.toLowerCase().includes("check") || q.topic.toLowerCase().includes("inference") || q.topic.toLowerCase().includes("vocabulary") || q.topic.toLowerCase().includes("author"), `Year 4 reading topic should be reading-specific, got: ${q.topic}`);
  }
});

test("Year 4 spelling questions do not return blocked placeholder wording", () => {
  const plan = buildQuestionPlan({
    scopedSubjects: ["spelling"],
    count: 3,
    yearGroup: "Year 4",
    keyStage: "KS2",
    sessionId: "test-year4-spelling",
  });
  assert.equal(plan.length, 3);
  for (const q of plan) {
    assert.equal(q.subject, "english", "subject should be normalised to english");
    assert.equal(q.strand, "spelling", "strand should be spelling");
    assert.equal(questionContainsBlockedWording(q), false, `Year 4 spelling question has blocked wording: ${q.topic} | ${q.prompt}`);
    assert.ok(q.topic.toLowerCase().includes("spelling") || q.topic.toLowerCase().includes("check") || q.topic.toLowerCase().includes("phonics"), `Year 4 spelling topic should be spelling-specific, got: ${q.topic}`);
  }
});

// ----- all supported year groups -----

test("all supported year groups generate valid Quick Level Finder questions without blocked wording", () => {
  for (const yearGroup of ALL_YEAR_GROUPS) {
    const subjects = autoQuickLevelFinderSubjectsForYearGroup(yearGroup);
    const range = { min: 9, max: 9 };
    const plan = buildQuestionPlan({
      scopedSubjects: subjects,
      count: range.max,
      yearGroup,
      sessionId: `test-all-${yearGroup}`,
    });
    assert.ok(plan.length > 0, `${yearGroup} should produce questions`);
    for (const q of plan) {
      assert.ok(q.prompt.length > 10, `${yearGroup} ${q.subject} prompt too short: "${q.prompt}"`);
      assert.ok(q.choices.length >= 2, `${yearGroup} ${q.subject} should have at least 2 choices`);
      assert.ok(q.correctIndex >= 0 && q.correctIndex < q.choices.length, `${yearGroup} ${q.subject} correctIndex out of range`);
      assert.equal(
        questionContainsBlockedWording(q),
        false,
        `${yearGroup} ${q.subject}:${q.strand ?? "general"} has blocked wording — topic: "${q.topic}" prompt: "${q.prompt}"`,
      );
    }
  }
});

// ----- sanitiseQuestion repairs bad stored questions -----

function makeBadQuestion(overrides: Partial<QuickLevelFinderQuestion> = {}): QuickLevelFinderQuestion {
  return {
    id: "qlf-q-1",
    subject: "reading",
    strand: null,
    topic: "Subject check",
    prompt: "Year 4 reading: Which answer is most accurate for this topic?",
    choices: [
      "The evidence-based answer.",
      "The answer with the longest sentence.",
      "The answer with unusual punctuation.",
      "The first answer shown.",
    ],
    correctIndex: 0,
    difficulty: 2,
    yearGroup: "Year 4",
    keyStage: "KS2",
    ...overrides,
  };
}

test("sanitiseQuestion repairs bad Year 4 reading question (simulated stored session)", () => {
  const bad = makeBadQuestion({ subject: "reading", strand: null });
  assert.equal(questionHasBlockedContent(bad), true);
  const fixed = sanitiseQuestion(bad, 0);
  assert.equal(fixed.subject, "english");
  assert.equal(fixed.strand, "reading");
  assert.equal(questionContainsBlockedWording(fixed), false, `Repaired question still has blocked wording: ${fixed.topic} | ${fixed.prompt}`);
  assert.ok(fixed.topic.toLowerCase().includes("reading") || fixed.topic.toLowerCase().includes("check"), `Repaired reading question should have reading label, got: ${fixed.topic}`);
});

test("sanitiseQuestion repairs bad Year 4 spelling question (simulated stored session)", () => {
  const bad = makeBadQuestion({ subject: "spelling", strand: null, topic: "Subject check", prompt: "Year 4 spelling: Which answer is most accurate for this topic?" });
  const fixed = sanitiseQuestion(bad, 0);
  assert.equal(fixed.subject, "english");
  assert.equal(fixed.strand, "spelling");
  assert.equal(questionContainsBlockedWording(fixed), false, `Repaired spelling question still has blocked wording: ${fixed.topic} | ${fixed.prompt}`);
  assert.ok(fixed.topic.toLowerCase().includes("spelling") || fixed.topic.toLowerCase().includes("check"), `Repaired spelling question should have spelling label, got: ${fixed.topic}`);
});

test("sanitiseQuestion does not modify already-clean question", () => {
  const clean = buildQuestionPlan({ scopedSubjects: ["reading"], count: 1, yearGroup: "Year 4", keyStage: "KS2", sessionId: "clean-test" })[0];
  assert.ok(clean);
  const result = sanitiseQuestion(clean, 0);
  assert.equal(result.prompt, clean.prompt);
  assert.equal(result.topic, clean.topic);
});

test("all year groups: sanitiseQuestion output never contains blocked wording", () => {
  for (const yearGroup of ALL_YEAR_GROUPS) {
    for (const subject of ["reading", "spelling", "grammar", "vocabulary", "maths", "english", "science"]) {
      const bad = makeBadQuestion({ subject, yearGroup, strand: null });
      const fixed = sanitiseQuestion(bad, 0);
      assert.equal(
        questionContainsBlockedWording(fixed),
        false,
        `${yearGroup} ${subject} — sanitiseQuestion output has blocked wording: "${fixed.topic}" | "${fixed.prompt}"`,
      );
      assert.ok(fixed.choices.length >= 2, `${yearGroup} ${subject} repaired question needs at least 2 choices`);
      assert.ok(fixed.correctIndex >= 0 && fixed.correctIndex < fixed.choices.length, `${yearGroup} ${subject} repaired question correctIndex out of range`);
    }
  }
});

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
