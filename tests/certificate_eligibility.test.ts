import test from "node:test";
import assert from "node:assert/strict";

import { buildCertificateEligibility } from "../src/lib/certificate-eligibility";
import type { SubjectProgressionRecommendation } from "../src/lib/subject-level-progression";

function progressionRow(overrides: Partial<SubjectProgressionRecommendation>): SubjectProgressionRecommendation {
  return {
    scopedSubject: "maths",
    subject: "Maths",
    strand: null,
    currentLevel: 2,
    recommendedLevel: 2,
    status: "developing",
    action: "assign_revision",
    confidence: 70,
    evidenceSummary: {
      activityCount: 3,
      completedAssignments: 2,
      attemptCount: 3,
      averageScore: 72,
      activeWeakAreas: 0,
      masterySignals: 0,
    },
    reasons: ["Base evidence"],
    blockers: [],
    nextBestStep: "Keep practising",
    generatorHint: null,
    ...overrides,
  };
}

function baseInput(overrides: Partial<Parameters<typeof buildCertificateEligibility>[0]> = {}) {
  return {
    studentId: "student-1",
    yearGroup: "Year 5",
    keyStage: "KS2",
    term: "Spring",
    selectedSubjects: ["english", "maths"],
    placementLevels: {
      "english:reading": { accuracy: 75, level: "secure" as const },
      "english:spelling": { accuracy: 20, level: "below" as const },
      maths: { accuracy: 68, level: "secure" as const },
    },
    progressionRecommendations: [
      progressionRow({ scopedSubject: "english:reading", subject: "English", strand: "reading", status: "secure" }),
      progressionRow({ scopedSubject: "english:spelling", subject: "English", strand: "spelling", status: "needs_support" }),
      progressionRow({ scopedSubject: "maths", subject: "Maths", strand: null, status: "secure" }),
    ],
    assignments: [
      { status: "completed", contentType: "reading", topic: "Inference", skillFocus: "Reading comprehension", metadataJson: null },
      { status: "completed", contentType: "math", topic: "Fractions", skillFocus: "Maths", metadataJson: null },
      { status: "assigned", contentType: "spelling", topic: "Suffixes", skillFocus: "Spelling", metadataJson: null },
    ],
    attempts: [
      { subject: "reading", skillFocus: "inference", correct: true },
      { subject: "maths", skillFocus: "fractions", correct: true },
      { subject: "spelling", skillFocus: "suffixes", correct: false },
    ],
    weakAreas: [],
    studentSkills: [
      { skill: "reading_inference", status: "mastered", accuracy: 86, attempts: 7 },
      { skill: "maths_fractions", status: "mastered", accuracy: 82, attempts: 8 },
      { skill: "spelling_suffixes", status: "improving", accuracy: 58, attempts: 6 },
    ],
    progressRecords: [
      { activityType: "end-of-term exam", activityName: "Spring exam", score: 76, accuracy: 76, completed: true },
    ],
    ...overrides,
  };
}

test("placement incomplete returns placement_required", () => {
  const result = buildCertificateEligibility(baseInput({ placementLevels: {} }));
  assert.equal(result.code, "placement_required");
  assert.equal(result.certificates[0]?.status, "locked");
});

test("no learning evidence returns not_enough_evidence", () => {
  const result = buildCertificateEligibility(baseInput({
    assignments: [],
    attempts: [],
    studentSkills: [],
    progressionRecommendations: [],
    progressRecords: [],
  }));

  assert.equal(result.code, "not_enough_evidence");
  assert.equal(result.summary.status === "not_yet_awarded" || result.summary.status === "pending_lessons" || result.summary.status === "pending_quizzes", true);
});

test("low completion returns pending_lessons", () => {
  const result = buildCertificateEligibility(baseInput({
    assignments: [{ status: "assigned", contentType: "reading", topic: "Inference", skillFocus: "Reading", metadataJson: null }],
    attempts: [{ subject: "reading", skillFocus: "inference", correct: true }],
  }));

  const term = result.certificates.find((row) => row.certificateType === "term_completion");
  assert.equal(term?.status, "pending_lessons");
});

test("active weak area returns pending_catch_up", () => {
  const result = buildCertificateEligibility(baseInput({
    weakAreas: [{ subject: "english", skillFocus: "spelling", status: "active" }],
    assignments: [
      { status: "completed", contentType: "reading", topic: "Inference", skillFocus: "Reading", metadataJson: null },
      { status: "completed", contentType: "math", topic: "Fractions", skillFocus: "Maths", metadataJson: null },
      { status: "completed", contentType: "spelling", topic: "Suffixes", skillFocus: "Spelling", metadataJson: null },
    ],
    attempts: [
      { subject: "reading", skillFocus: "inference", correct: true },
      { subject: "maths", skillFocus: "fractions", correct: true },
      { subject: "spelling", skillFocus: "suffixes", correct: false },
      { subject: "spelling", skillFocus: "prefixes", correct: false },
      { subject: "maths", skillFocus: "number", correct: true },
      { subject: "reading", skillFocus: "retrieval", correct: true },
    ],
    progressRecords: [
      { activityType: "end-of-term exam", activityName: "Spring exam", score: 82, accuracy: 82, completed: true },
    ],
  }));

  const term = result.certificates.find((row) => row.certificateType === "term_completion");
  assert.equal(term?.status, "pending_catch_up");
});

test("no exam evidence returns pending_exam", () => {
  const result = buildCertificateEligibility(baseInput({
    progressRecords: [],
    progressionRecommendations: [
      progressionRow({ scopedSubject: "english:reading", subject: "English", strand: "reading", status: "secure" }),
      progressionRow({ scopedSubject: "english:spelling", subject: "English", strand: "spelling", status: "secure" }),
      progressionRow({ scopedSubject: "maths", subject: "Maths", status: "secure" }),
    ],
    assignments: [
      { status: "completed", contentType: "reading", topic: "Inference", skillFocus: "Reading", metadataJson: null },
      { status: "completed", contentType: "math", topic: "Fractions", skillFocus: "Maths", metadataJson: null },
      { status: "completed", contentType: "spelling", topic: "Suffixes", skillFocus: "Spelling", metadataJson: null },
      { status: "completed", contentType: "reading", topic: "Comprehension", skillFocus: "Reading", metadataJson: null },
    ],
    attempts: [
      { subject: "reading", skillFocus: "inference", correct: true },
      { subject: "maths", skillFocus: "fractions", correct: true },
      { subject: "spelling", skillFocus: "suffixes", correct: true },
      { subject: "reading", skillFocus: "retrieval", correct: true },
      { subject: "maths", skillFocus: "number", correct: true },
      { subject: "spelling", skillFocus: "prefixes", correct: true },
    ],
  }));

  const term = result.certificates.find((row) => row.certificateType === "term_completion");
  assert.equal(term?.status, "pending_exam");
});

test("strong completion + secure progression + passed exam returns eligible", () => {
  const result = buildCertificateEligibility(baseInput({
    progressionRecommendations: [
      progressionRow({ scopedSubject: "english:reading", subject: "English", strand: "reading", status: "secure" }),
      progressionRow({ scopedSubject: "english:spelling", subject: "English", strand: "spelling", status: "secure" }),
      progressionRow({ scopedSubject: "maths", subject: "Maths", status: "ready_to_advance" }),
    ],
    assignments: [
      { status: "completed", contentType: "reading", topic: "Inference", skillFocus: "Reading", metadataJson: null },
      { status: "completed", contentType: "math", topic: "Fractions", skillFocus: "Maths", metadataJson: null },
      { status: "completed", contentType: "spelling", topic: "Suffixes", skillFocus: "Spelling", metadataJson: null },
      { status: "completed", contentType: "reading", topic: "Comprehension", skillFocus: "Reading", metadataJson: null },
      { status: "completed", contentType: "math", topic: "Geometry", skillFocus: "Maths", metadataJson: null },
    ],
    attempts: [
      { subject: "reading", skillFocus: "inference", correct: true },
      { subject: "maths", skillFocus: "fractions", correct: true },
      { subject: "spelling", skillFocus: "suffixes", correct: true },
      { subject: "reading", skillFocus: "retrieval", correct: true },
      { subject: "maths", skillFocus: "number", correct: true },
      { subject: "spelling", skillFocus: "prefixes", correct: true },
      { subject: "reading", skillFocus: "vocabulary", correct: true },
    ],
    progressRecords: [
      { activityType: "end-of-term exam", activityName: "Spring exam", score: 85, accuracy: 85, completed: true },
      { activityType: "quiz", activityName: "Maths quiz", score: 84, accuracy: 84, completed: true },
    ],
    weakAreas: [],
  }));

  const term = result.certificates.find((row) => row.certificateType === "term_completion");
  assert.equal(term?.status, "eligible");
  assert.equal(term?.eligible, true);
});

test("english strands contribute under one english subject", () => {
  const result = buildCertificateEligibility(baseInput({
    selectedSubjects: ["english"],
    placementLevels: {
      "english:reading": { accuracy: 75, level: "secure" },
      "english:spelling": { accuracy: 20, level: "below" },
      "english:grammar": { accuracy: 64, level: "secure" },
    },
    progressionRecommendations: [
      progressionRow({ scopedSubject: "english:reading", subject: "English", strand: "reading", status: "secure" }),
      progressionRow({ scopedSubject: "english:spelling", subject: "English", strand: "spelling", status: "needs_support" }),
      progressionRow({ scopedSubject: "english:grammar", subject: "English", strand: "grammar", status: "on_track" }),
    ],
  }));

  const english = result.certificates.find((row) => row.certificateType === "english_achievement");
  assert.ok(english);
  assert.ok(english?.subjectBreakdown.some((row) => row.subject === "English" && row.strand === "Reading"));
  assert.ok(english?.subjectBreakdown.some((row) => row.subject === "English" && row.strand === "Spelling"));
});

test("reading and spelling are not treated as parent subjects", () => {
  const result = buildCertificateEligibility(baseInput({
    selectedSubjects: ["english"],
    placementLevels: {
      reading: { accuracy: 70, level: "secure" },
      spelling: { accuracy: 20, level: "below" },
    },
    progressionRecommendations: [
      progressionRow({ scopedSubject: "english:reading", subject: "English", strand: "reading", status: "secure" }),
      progressionRow({ scopedSubject: "english:spelling", subject: "English", strand: "spelling", status: "developing" }),
    ],
  }));

  const english = result.certificates.find((row) => row.certificateType === "english_achievement");
  const hasReadingParent = english?.subjectBreakdown.some((row) => row.subject === "Reading") ?? false;
  const hasSpellingParent = english?.subjectBreakdown.some((row) => row.subject === "Spelling") ?? false;
  assert.equal(hasReadingParent, false);
  assert.equal(hasSpellingParent, false);
});

test("certificate is not issued automatically", () => {
  const result = buildCertificateEligibility(baseInput({
    progressionRecommendations: [
      progressionRow({ scopedSubject: "english:reading", subject: "English", strand: "reading", status: "secure" }),
      progressionRow({ scopedSubject: "english:spelling", subject: "English", strand: "spelling", status: "secure" }),
      progressionRow({ scopedSubject: "maths", subject: "Maths", status: "ready_to_advance" }),
    ],
    assignments: [
      { status: "completed", contentType: "reading", topic: "Inference", skillFocus: "Reading", metadataJson: null },
      { status: "completed", contentType: "math", topic: "Fractions", skillFocus: "Maths", metadataJson: null },
      { status: "completed", contentType: "spelling", topic: "Suffixes", skillFocus: "Spelling", metadataJson: null },
      { status: "completed", contentType: "reading", topic: "Comprehension", skillFocus: "Reading", metadataJson: null },
      { status: "completed", contentType: "math", topic: "Geometry", skillFocus: "Maths", metadataJson: null },
    ],
    attempts: [
      { subject: "reading", skillFocus: "inference", correct: true },
      { subject: "maths", skillFocus: "fractions", correct: true },
      { subject: "spelling", skillFocus: "suffixes", correct: true },
      { subject: "reading", skillFocus: "retrieval", correct: true },
      { subject: "maths", skillFocus: "number", correct: true },
      { subject: "spelling", skillFocus: "prefixes", correct: true },
      { subject: "reading", skillFocus: "vocabulary", correct: true },
    ],
    progressRecords: [
      { activityType: "end-of-term exam", activityName: "Spring exam", score: 85, accuracy: 85, completed: true },
    ],
    weakAreas: [],
  }));

  const term = result.certificates.find((row) => row.certificateType === "term_completion");
  assert.equal(term?.status, "eligible");
  assert.notEqual(term?.status, "issued");
});
