import test from "node:test";
import assert from "node:assert/strict";

import { buildSubjectLevelProgression } from "../src/lib/subject-level-progression";
import { selectPlacementLessons, type PlacementRecommendation } from "../src/lib/placement-lesson-selector";

type Overrides = Partial<Parameters<typeof buildSubjectLevelProgression>[0]>;

function basePlacementRecommendations(): PlacementRecommendation[] {
  return [
    {
      scopedSubject: "english:reading",
      parentSubject: "english",
      strand: "reading",
      subjectLabel: "English",
      strandLabel: "Reading",
      status: "ready",
      reason: "Ready",
      accuracy: 75,
      levelBand: "secure",
      level: 3,
      levelLabel: "Expected",
      contentId: "content-reading",
      assignmentId: null,
      href: "/games/reading",
      contentStatus: "reviewed",
      generatorHint: null,
    },
    {
      scopedSubject: "english:spelling",
      parentSubject: "english",
      strand: "spelling",
      subjectLabel: "English",
      strandLabel: "Spelling",
      status: "content_needed",
      reason: "Needs content",
      accuracy: 20,
      levelBand: "below",
      level: 1,
      levelLabel: "Foundation",
      contentId: null,
      assignmentId: null,
      href: null,
      contentStatus: null,
      generatorHint: {
        subject: "english",
        strand: "spelling",
        level: 1,
        yearGroup: "Year 1",
        keyStage: "KS1",
        skillFocus: "Spelling",
        reason: "No matching content",
      },
    },
  ];
}

function buildInput(overrides: Overrides = {}) {
  return {
    studentId: "student-1",
    yearGroup: "Year 5",
    keyStage: "KS2",
    selectedSubjects: ["english", "maths"],
    placementLevels: {
      "english:reading": { accuracy: 75, level: "secure" as const },
      "english:spelling": { accuracy: 20, level: "below" as const },
      maths: { accuracy: 64, level: "secure" as const },
    },
    attempts: [],
    assignments: [],
    weakAreas: [],
    studentSkills: [],
    progressRecords: [],
    placementRecommendations: basePlacementRecommendations(),
    ...overrides,
  };
}

test("placement completed but no evidence returns review_needed/developing states", () => {
  const result = buildSubjectLevelProgression(buildInput());

  const reading = result.recommendations.find((row) => row.scopedSubject === "english:reading");
  assert.ok(reading);
  assert.ok(reading?.status === "review_needed" || reading?.status === "developing");
  assert.equal(reading?.action, "keep_current_level");
});

test("active weak area returns needs_support and assign_catch_up", () => {
  const result = buildSubjectLevelProgression(buildInput({
    weakAreas: [{ subject: "english", skillFocus: "reading comprehension", status: "active" }],
    attempts: [{ subject: "reading", skillFocus: "inference", correct: false }],
  }));

  const reading = result.recommendations.find((row) => row.scopedSubject === "english:reading");
  assert.equal(reading?.status, "needs_support");
  assert.equal(reading?.action, "assign_catch_up");
});

test("strong scores but low activity count does not level up early", () => {
  const result = buildSubjectLevelProgression(buildInput({
    attempts: [{ subject: "reading", skillFocus: "inference", correct: true }],
    progressRecords: [{ activityType: "reading", activityName: "Reading quick check", score: 95, accuracy: 95, completed: true }],
  }));

  const reading = result.recommendations.find((row) => row.scopedSubject === "english:reading");
  assert.notEqual(reading?.status, "ready_to_advance");
  assert.notEqual(reading?.action, "recommend_level_up");
});

test("strong scores across enough activities returns ready_to_advance", () => {
  const result = buildSubjectLevelProgression(buildInput({
    attempts: [
      { subject: "reading", skillFocus: "inference", correct: true },
      { subject: "reading", skillFocus: "retrieval", correct: true },
      { subject: "reading", skillFocus: "comprehension", correct: true },
    ],
    assignments: [
      { status: "completed", contentType: "reading", topic: "Reading mastery check", skillFocus: "inference", metadataJson: null },
    ],
    progressRecords: [
      { activityType: "reading", activityName: "Reading mastery gate", score: 91, accuracy: 91, completed: true },
    ],
    weakAreas: [],
  }));

  const reading = result.recommendations.find((row) => row.scopedSubject === "english:reading");
  assert.equal(reading?.status, "ready_to_advance");
  assert.equal(reading?.action, "recommend_level_up");
  assert.equal(reading?.recommendedLevel, (reading?.currentLevel ?? 0) + 1);
});

test("english reading and spelling progress separately", () => {
  const result = buildSubjectLevelProgression(buildInput({
    attempts: [
      { subject: "reading", skillFocus: "inference", correct: true },
      { subject: "reading", skillFocus: "retrieval", correct: true },
      { subject: "spelling", skillFocus: "suffixes", correct: false },
    ],
    weakAreas: [{ subject: "english", skillFocus: "spelling suffixes", status: "active" }],
  }));

  const reading = result.recommendations.find((row) => row.scopedSubject === "english:reading");
  const spelling = result.recommendations.find((row) => row.scopedSubject === "english:spelling");
  assert.ok(reading && spelling);
  assert.notEqual(reading?.status, spelling?.status);
});

test("reading and spelling are not treated as parent subjects", () => {
  const result = buildSubjectLevelProgression(buildInput({
    selectedSubjects: ["english"],
    placementLevels: {
      reading: { accuracy: 72, level: "secure" },
      spelling: { accuracy: 22, level: "below" },
    },
  }));

  const hasReadingParent = result.grouped.some((group) => group.parentSubject === "reading");
  const hasSpellingParent = result.grouped.some((group) => group.parentSubject === "spelling");
  assert.equal(hasReadingParent, false);
  assert.equal(hasSpellingParent, false);
  assert.ok(result.grouped.some((group) => group.parentSubject === "english"));
});

test("content gap returns generatorHint for catch-up/mastery content", () => {
  const result = buildSubjectLevelProgression(buildInput({
    weakAreas: [{ subject: "english", skillFocus: "spelling", status: "active" }],
    attempts: [{ subject: "spelling", skillFocus: "suffixes", correct: false }],
    placementRecommendations: basePlacementRecommendations(),
  }));

  const spelling = result.recommendations.find((row) => row.scopedSubject === "english:spelling");
  assert.equal(spelling?.status, "needs_support");
  assert.equal(spelling?.action, "assign_catch_up");
  assert.ok(spelling?.generatorHint);
});

test("generatorHint uses target learning level, not student school year", () => {
  const result = buildSubjectLevelProgression(buildInput({
    yearGroup: "Year 4",
    keyStage: "KS2",
    selectedSubjects: ["english"],
    placementLevels: {
      "english:grammar": { accuracy: 45, level: "below" as const },
    },
    weakAreas: [{ subject: "english", skillFocus: "grammar", status: "active" }],
    attempts: [{ subject: "grammar", skillFocus: "sentence structure", correct: false }],
    placementRecommendations: [{
      scopedSubject: "english:grammar",
      parentSubject: "english",
      strand: "grammar",
      subjectLabel: "English",
      strandLabel: "Grammar",
      status: "content_needed",
      reason: "Needs grammar content",
      accuracy: 45,
      levelBand: "below",
      level: 2,
      levelLabel: "Developing",
      contentId: null,
      assignmentId: null,
      href: null,
      contentStatus: null,
      generatorHint: null,
    }],
  }));

  const grammar = result.recommendations.find((row) => row.scopedSubject === "english:grammar");
  assert.equal(grammar?.generatorHint?.yearGroup, "Year 3");
  assert.equal(grammar?.generatorHint?.keyStage, "KS2");
  assert.equal(grammar?.generatorHint?.level, 3);
});

test("placement generator hint uses target learning year for Year 4 grammar", () => {
  const result = selectPlacementLessons({
    studentId: "student-year-4",
    selectedSubjects: ["english"],
    placementLevels: {
      "english:grammar": { accuracy: 45, level: "below" },
    },
    availableContent: [],
    existingAssignments: [],
    yearGroup: "Year 4",
    keyStage: "KS2",
  });

  const grammar = result.contentGaps.find((row) => row.scopedSubject === "english:grammar");
  assert.equal(grammar?.generatorHint?.level, 3);
  assert.equal(grammar?.generatorHint?.yearGroup, "Year 3");
  assert.equal(grammar?.generatorHint?.keyStage, "KS2");
});

test("explicit lower evidence preserves Year 2 target for Year 4 grammar", () => {
  const result = selectPlacementLessons({
    studentId: "student-year-4-explicit",
    selectedSubjects: ["english"],
    placementLevels: {
      "english:grammar": {
        accuracy: 45,
        level: "below",
        explicitLearningLevel: 2,
      },
    },
    availableContent: [],
    existingAssignments: [],
    yearGroup: "Year 4",
    keyStage: "KS2",
  });

  const grammar = result.contentGaps.find((row) => row.scopedSubject === "english:grammar");
  assert.equal(grammar?.generatorHint?.level, 2);
  assert.equal(grammar?.generatorHint?.yearGroup, "Year 2");
  assert.equal(grammar?.generatorHint?.keyStage, "KS1");
});

test("placement generator hint uses target learning year for Year 6 maths", () => {
  const result = selectPlacementLessons({
    studentId: "student-year-6",
    selectedSubjects: ["maths"],
    placementLevels: {
      maths: { accuracy: 72, level: "secure" },
    },
    availableContent: [],
    existingAssignments: [],
    yearGroup: "Year 6",
    keyStage: "KS2",
  });

  const maths = result.contentGaps.find((row) => row.scopedSubject === "maths");
  assert.equal(maths?.generatorHint?.level, 3);
  assert.equal(maths?.generatorHint?.yearGroup, "Year 3");
  assert.equal(maths?.generatorHint?.keyStage, "KS2");
});

test("progression does not create fake lesson data", () => {
  const result = buildSubjectLevelProgression(buildInput({
    attempts: [],
    assignments: [],
    progressRecords: [],
  }));

  const withHints = result.recommendations.filter((row) => row.generatorHint);
  for (const row of withHints) {
    assert.equal(typeof row.nextBestStep, "string");
    assert.ok(!row.nextBestStep.toLowerCase().includes("assignmentid="));
    assert.ok(!row.nextBestStep.toLowerCase().includes("contentid="));
  }
});
