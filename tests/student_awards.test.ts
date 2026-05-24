import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAwardNominationsForCohort,
  buildStudentAwardNominations,
  type StudentAwardEvidenceInput,
} from "../src/lib/student-awards";
import type { SubjectProgressionRecommendation } from "../src/lib/subject-level-progression";

function progression(overrides: Partial<SubjectProgressionRecommendation> = {}): SubjectProgressionRecommendation {
  return {
    scopedSubject: "maths",
    subject: "Maths",
    strand: null,
    currentLevel: 2,
    recommendedLevel: 3,
    status: "ready_to_advance",
    action: "recommend_level_up",
    confidence: 85,
    evidenceSummary: {
      activityCount: 8,
      completedAssignments: 6,
      attemptCount: 10,
      averageScore: 78,
      activeWeakAreas: 0,
      masterySignals: 2,
    },
    reasons: ["Strong trend"],
    blockers: [],
    nextBestStep: "Move up",
    generatorHint: null,
    ...overrides,
  };
}

function baseInput(overrides: Partial<StudentAwardEvidenceInput> = {}): StudentAwardEvidenceInput {
  return {
    studentId: "student-1",
    studentName: "Ava Morgan",
    yearGroup: "Year 4",
    keyStage: "KS2",
    term: "Spring",
    academicYear: "2025/2026",
    selectedSubjects: ["english", "maths"],
    placementLevels: {
      "english:reading": { accuracy: 40, level: "below" },
      "english:spelling": { accuracy: 45, level: "below" },
      maths: { accuracy: 48, level: "below" },
    },
    progressionRecommendations: [
      progression({ scopedSubject: "english:reading", subject: "English", strand: "reading" }),
      progression({ scopedSubject: "english:spelling", subject: "English", strand: "spelling" }),
      progression({ scopedSubject: "maths", subject: "Maths", strand: null }),
    ],
    assignments: [
      { status: "completed", contentType: "reading", topic: "Inference", skillFocus: "reading", createdAt: "2026-03-01T10:00:00.000Z" },
      { status: "completed", contentType: "spelling", topic: "Suffixes", skillFocus: "spelling", createdAt: "2026-03-02T10:00:00.000Z" },
      { status: "completed", contentType: "math", topic: "Fractions", skillFocus: "fractions", createdAt: "2026-03-03T10:00:00.000Z" },
      { status: "completed", contentType: "reading", topic: "Comprehension", skillFocus: "reading", createdAt: "2026-03-04T10:00:00.000Z" },
      { status: "assigned", contentType: "math", topic: "Geometry", skillFocus: "geometry", createdAt: "2026-03-05T10:00:00.000Z" },
    ],
    attempts: [
      { subject: "english:reading", skillFocus: "reading", correct: true, responseTimeMs: 2400, hintsUsed: 0, createdAt: "2026-03-01T10:00:00.000Z" },
      { subject: "english:spelling", skillFocus: "spelling", correct: true, responseTimeMs: 2100, hintsUsed: 0, createdAt: "2026-03-02T10:00:00.000Z" },
      { subject: "maths", skillFocus: "fractions", correct: true, responseTimeMs: 2600, hintsUsed: 1, createdAt: "2026-03-03T10:00:00.000Z" },
      { subject: "maths", skillFocus: "number", correct: true, responseTimeMs: 2500, hintsUsed: 0, createdAt: "2026-03-04T10:00:00.000Z" },
      { subject: "english:reading", skillFocus: "comprehension", correct: true, responseTimeMs: 2800, hintsUsed: 0, createdAt: "2026-03-05T10:00:00.000Z" },
      { subject: "english:spelling", skillFocus: "prefixes", correct: true, responseTimeMs: 2300, hintsUsed: 0, createdAt: "2026-03-06T10:00:00.000Z" },
      { subject: "maths", skillFocus: "geometry", correct: false, responseTimeMs: 3200, hintsUsed: 1, createdAt: "2026-03-07T10:00:00.000Z" },
      { subject: "maths", skillFocus: "geometry", correct: true, responseTimeMs: 3000, hintsUsed: 1, createdAt: "2026-03-08T10:00:00.000Z" },
    ],
    weakAreas: [
      { subject: "english", skillFocus: "spelling_suffixes", status: "resolved" },
    ],
    studentSkills: [
      { skill: "english_reading_inference", status: "mastered", accuracy: 88, attempts: 8 },
      { skill: "english_spelling_suffixes", status: "improving", accuracy: 73, attempts: 7 },
      { skill: "maths_fractions", status: "mastered", accuracy: 84, attempts: 9 },
    ],
    progressRecords: [
      { activityType: "end-of-term exam", activityName: "Spring Exam", score: 79, accuracy: 79, completed: true, createdAt: "2026-03-10T10:00:00.000Z" },
      { activityType: "quiz", activityName: "Maths Quiz", score: 82, accuracy: 82, completed: true, createdAt: "2026-03-11T10:00:00.000Z" },
      { activityType: "quiz", activityName: "Reading Quiz", score: 80, accuracy: 80, completed: true, createdAt: "2026-03-12T10:00:00.000Z" },
    ],
    ...overrides,
  };
}

function byType(rows: ReturnType<typeof buildStudentAwardNominations>, type: string) {
  return rows.find((row) => row.awardType === type);
}

test("no evidence returns not_enough_evidence", () => {
  const cohort = buildAwardNominationsForCohort({
    students: [baseInput({ assignments: [], attempts: [], studentSkills: [], progressRecords: [], progressionRecommendations: [], weakAreas: [] })],
  });

  assert.equal(cohort.code, "not_enough_evidence");
  assert.equal(cohort.summary.eligibleCount, 0);
});

test("high score alone does not automatically win Best Student", () => {
  const nominations = buildStudentAwardNominations(baseInput({
    assignments: [{ status: "assigned", contentType: "math", topic: "Algebra", skillFocus: "algebra" }],
    attempts: [{ subject: "maths", skillFocus: "algebra", correct: true, responseTimeMs: 2200, hintsUsed: 0 }],
    studentSkills: [{ skill: "maths_algebra", status: "weak", accuracy: 25, attempts: 1 }],
    progressRecords: [{ activityType: "exam", activityName: "Mock", score: 98, accuracy: 98, completed: true }],
    progressionRecommendations: [progression({ status: "developing", currentLevel: 2, recommendedLevel: 2 })],
    weakAreas: [{ subject: "maths", skillFocus: "algebra", status: "active" }],
  }));

  const best = byType(nominations, "best_student_year_group");
  assert.ok(best);
  assert.equal(best?.eligibleForNomination, false);
  assert.ok(best?.blockers.some((row) => /high score alone/i.test(row) || /active critical weak areas/i.test(row)));
});

test("strong improvement from low baseline can nominate Advancement Award", () => {
  const nominations = buildStudentAwardNominations(baseInput({
    placementLevels: {
      "english:reading": { accuracy: 20, level: "below" },
      "english:spelling": { accuracy: 24, level: "below" },
      maths: { accuracy: 28, level: "below" },
    },
    progressRecords: [
      { activityType: "exam", activityName: "Term exam", score: 85, accuracy: 85, completed: true },
      { activityType: "quiz", activityName: "Progress quiz", score: 84, accuracy: 84, completed: true },
    ],
  }));

  const advancement = byType(nominations, "starliz_advancement_award");
  assert.ok(advancement);
  assert.equal(advancement?.eligibleForNomination, true);
  assert.ok((advancement?.evidenceSummary.improvementPoints ?? 0) > 20);
});

test("fast clicking and low quality evidence does not nominate", () => {
  const nominations = buildStudentAwardNominations(baseInput({
    attempts: Array.from({ length: 12 }).map((_, index) => ({
      subject: "maths",
      skillFocus: "number",
      correct: index % 4 === 0,
      responseTimeMs: 400,
      hintsUsed: 4,
      createdAt: `2026-03-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
    })),
    progressRecords: [{ activityType: "quiz", activityName: "Low quality quiz", score: 34, accuracy: 34, completed: true }],
    studentSkills: [{ skill: "maths_number", status: "weak", accuracy: 32, attempts: 12 }],
  }));

  const best = byType(nominations, "student_of_term");
  assert.ok(best);
  assert.equal(best?.eligibleForNomination, false);
  assert.ok((best?.evidenceSummary.fastLowQualityAttemptRatio ?? 0) >= 0.45);
});

test("active weak areas block best overall but may allow resilience", () => {
  const nominations = buildStudentAwardNominations(baseInput({
    weakAreas: [{ subject: "english", skillFocus: "spelling", status: "active" }],
    placementLevels: {
      "english:reading": { accuracy: 18, level: "below" },
      "english:spelling": { accuracy: 19, level: "below" },
      maths: { accuracy: 22, level: "below" },
    },
    progressRecords: [
      { activityType: "exam", activityName: "Spring exam", score: 78, accuracy: 78, completed: true },
      { activityType: "quiz", activityName: "Recovery quiz", score: 76, accuracy: 76, completed: true },
    ],
  }));

  const best = byType(nominations, "best_student_year_group");
  const resilience = byType(nominations, "resilience_award");
  assert.equal(best?.eligibleForNomination, false);
  assert.ok(resilience);
  assert.equal(resilience?.status, "pending_review");
});

test("English Reading and Spelling awards are under English strands", () => {
  const nominations = buildStudentAwardNominations(baseInput());
  const reading = byType(nominations, "reading_champion");
  const spelling = byType(nominations, "spelling_champion");

  assert.equal(reading?.subject, "English");
  assert.equal(reading?.strand, "reading");
  assert.equal(spelling?.subject, "English");
  assert.equal(spelling?.strand, "spelling");
});

test("Reading and Spelling are not treated as parent subjects", () => {
  const nominations = buildStudentAwardNominations(baseInput({
    selectedSubjects: ["reading", "spelling", "maths"],
    placementLevels: {
      reading: { accuracy: 55, level: "secure" },
      spelling: { accuracy: 51, level: "secure" },
      maths: { accuracy: 55, level: "secure" },
    },
  }));

  const reading = byType(nominations, "reading_champion");
  const spelling = byType(nominations, "spelling_champion");

  assert.equal(reading?.subject, "English");
  assert.equal(spelling?.subject, "English");
});

test("year-group scope uses student year group", () => {
  const nominations = buildStudentAwardNominations(baseInput({ yearGroup: "Year 6" }));
  const best = byType(nominations, "best_student_year_group");
  assert.equal(best?.awardScope, "year_group");
  assert.equal(best?.yearGroup, "Year 6");
});

test("award nomination status is pending_review, not issued", () => {
  const nominations = buildStudentAwardNominations(baseInput());
  for (const nomination of nominations) {
    assert.equal(nomination.status, "pending_review");
  }
});

test("best student score uses more than assessment alone", () => {
  const highCompletion = buildStudentAwardNominations(baseInput());
  const lowCompletion = buildStudentAwardNominations(baseInput({
    assignments: [
      { status: "assigned", contentType: "reading", topic: "Inference", skillFocus: "reading" },
      { status: "assigned", contentType: "math", topic: "Fractions", skillFocus: "fractions" },
      { status: "completed", contentType: "spelling", topic: "Suffixes", skillFocus: "spelling" },
    ],
  }));

  const high = byType(highCompletion, "best_student_year_group");
  const low = byType(lowCompletion, "best_student_year_group");
  assert.ok(high);
  assert.ok(low);
  assert.equal(high?.evidenceSummary.assessmentScore, low?.evidenceSummary.assessmentScore);
  assert.ok((high?.score ?? 0) > (low?.score ?? 0));
});
