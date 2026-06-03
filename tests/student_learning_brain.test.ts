import test from "node:test";
import assert from "node:assert/strict";

import {
  buildStudentLearningBrainFromSource,
  getProgressionDecisionBrainView,
  toAdminLearningBrainView,
  toParentLearningBrainView,
  toStudentDashboardBrainView,
} from "../src/lib/student-learning-brain";
import type { AcademicSourceData } from "../src/lib/academic-intelligence/types";

function baseSource(overrides: Partial<AcademicSourceData> = {}): AcademicSourceData {
  return {
    studentId: "student-brain-1",
    studentName: "Brain Student",
    yearGroup: "Year 7",
    keyStage: "KS3",
    assignments: [],
    attempts: [],
    weakAreas: [],
    studentSkills: [],
    coachUsage: [],
    dictionarySignals: [],
    progressRecords: [],
    assessmentHistory: [],
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

test("Student Learning Brain returns a safe object when data is limited", () => {
  const brain = buildStudentLearningBrainFromSource({ source: baseSource() });

  assert.equal(brain.studentId, "student-brain-1");
  assert.ok(brain.academicIntelligence);
  assert.ok(brain.studentSafeAcademicIntelligence);
  assert.equal(brain.evidenceSummary.assignments.total, 0);
  assert.equal(brain.quickLevelFinderBaseline, null);
  assert.equal(brain.languageReadiness.autoLevelChangeApplied, false);
});

test("Student Learning Brain includes shared QLF baseline and HEART BEAT summary", () => {
  const completedAt = new Date().toISOString();
  const brain = buildStudentLearningBrainFromSource({
    source: baseSource({
      quickLevelFinderBaseline: {
        completedAt,
        yearGroup: "Year 7",
        keyStage: "KS3",
        confidenceLabel: "baseline_placement_signal",
        parentSubjectScores: [{ subject: "math", accuracy: 78, level: "secure" }],
        englishStrandScores: [{ strand: "reading", accuracy: 72, level: "secure" }],
      },
      attempts: [{
        id: "attempt-1",
        subject: "math",
        topic: "Fractions",
        skill: "fractions",
        correct: true,
        score: 88,
        hintsUsed: 0,
        createdAt: completedAt,
      }],
    }),
  });

  assert.equal(brain.quickLevelFinderBaseline?.completedAt, completedAt);
  assert.ok(brain.heartbeatSummary.primaryAction);
  assert.equal(brain.heartbeatSummary, brain.academicIntelligence.heartbeatDecision);
});

test("dashboard, parent, and admin views share the same central Brain source", () => {
  const brain = buildStudentLearningBrainFromSource({
    source: baseSource({
      weakAreas: [{
        id: "weak-1",
        subject: "reading",
        topic: "Inference",
        skill: "inference",
        status: "active",
        lastDetectedAt: new Date().toISOString(),
      }],
      studentSkills: [{ skill: "inference", status: "weak", accuracy: 45, attempts: 4, correct: 2, updatedAt: new Date().toISOString() }],
    }),
    learningDnaSummary: { totalAttempts: 4, readinessLabel: "Active" },
    certificateCount: 2,
  });

  const dashboard = toStudentDashboardBrainView(brain);
  const parent = toParentLearningBrainView(brain);
  const admin = toAdminLearningBrainView(brain);

  assert.ok(dashboard);
  assert.ok(parent);
  assert.ok(admin);
  assert.equal(typeof getProgressionDecisionBrainView, "function");

  assert.equal(dashboard.heartbeatSummary, brain.heartbeatSummary);
  assert.equal(parent.heartbeatSummary, brain.heartbeatSummary);
  assert.equal(admin.heartbeatSummary, brain.heartbeatSummary);
  assert.equal(parent.learningDna?.totalAttempts, 4);
  assert.equal(parent.weakAreas.active, 1);
  assert.equal(dashboard.certificateProgressSummary.issuedCount, 2);
  assert.equal(admin.evidenceSummary.certificates.issuedCount, 2);
});

test("Brain output is dashboard-safe and avoids raw metadata exposure", () => {
  const brain = buildStudentLearningBrainFromSource({
    source: baseSource({
      weakAreas: [{
        id: "weak-secret",
        subject: "spelling",
        skill: "homophones",
        status: "active",
        metadata: { internal: "do-not-expose" },
        lastDetectedAt: new Date().toISOString(),
      }],
    }),
  });

  const dashboard = toStudentDashboardBrainView(brain) as Record<string, unknown>;
  const parent = toParentLearningBrainView(brain) as Record<string, unknown>;
  const admin = toAdminLearningBrainView(brain) as Record<string, unknown>;

  assert.equal(JSON.stringify(dashboard).includes("do-not-expose"), false);
  assert.equal(JSON.stringify(parent).includes("do-not-expose"), false);
  assert.equal(JSON.stringify(admin).includes("do-not-expose"), false);
  assert.equal("source" in dashboard, false);
  assert.equal("source" in parent, false);
  assert.equal("source" in admin, false);
});

test("Language Readiness starts new language learners at foundation pending", () => {
  const brain = buildStudentLearningBrainFromSource({
    source: baseSource({
      assignments: [{
        id: "ga-1",
        status: "assigned",
        subject: "ga",
        topic: "Greetings",
        skill: "basic_greetings",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
    }),
  });

  assert.equal(brain.languageReadiness.status, "foundation_readiness_pending");
  assert.equal(brain.languageReadiness.autoLevelChangeApplied, false);
  assert.equal(brain.quickLevelFinderBaseline, null);
});

test("Language Readiness can recommend review after evidence without changing levels", () => {
  const now = new Date().toISOString();
  const brain = buildStudentLearningBrainFromSource({
    source: baseSource({
      attempts: Array.from({ length: 5 }).map((_, index) => ({
        id: `fr-${index}`,
        subject: "french",
        topic: "Pronunciation",
        skill: "speaking",
        correct: true,
        score: 88,
        hintsUsed: 0,
        createdAt: now,
      })),
    }),
  });

  assert.equal(brain.languageReadiness.status, "ready_to_move_up");
  assert.equal(brain.languageReadiness.autoLevelChangeApplied, false);
});

test("missing optional records do not crash any Brain view", () => {
  const brain = buildStudentLearningBrainFromSource({
    source: baseSource({
      assignments: [],
      attempts: [],
      weakAreas: [],
      studentSkills: [],
      progressRecords: [],
      quickLevelFinderBaseline: null,
    }),
  });

  assert.doesNotThrow(() => toStudentDashboardBrainView(brain));
  assert.doesNotThrow(() => toParentLearningBrainView(brain));
  assert.doesNotThrow(() => toAdminLearningBrainView(brain));
  assert.ok(brain.languageReadiness);
});

test("Brain graph avoids circular target loops, orphan signals, and duplicate recommendations for standard weak-area flows", () => {
  const now = new Date().toISOString();
  const brain = buildStudentLearningBrainFromSource({
    source: baseSource({
      attempts: [{
        id: "attempt-loop-1",
        subject: "math",
        topic: "Multiplication facts practice",
        skill: "multiplication-facts-practice",
        correct: false,
        score: 40,
        hintsUsed: 2,
        createdAt: now,
      }],
      weakAreas: [{
        id: "weak-loop-1",
        subject: "math",
        topic: "Multiplication facts practice",
        skill: "multiplication-facts-practice",
        status: "active",
        weaknessType: "accuracy",
        accuracy: 40,
        attemptsCount: 6,
        lastDetectedAt: now,
      }],
      progressRecords: [{
        id: "progress-loop-1",
        subject: "math",
        topic: "Multiplication facts practice",
        skill: "multiplication-facts-practice",
        activityType: "lesson_check",
        activityName: "Multiplication facts check",
        completed: true,
        correct: false,
        score: 42,
        accuracy: 42,
        createdAt: now,
      }],
      coachUsage: [{
        id: "coach-loop-1",
        subject: "math",
        topic: "Multiplication facts practice",
        skill: "multiplication-facts-practice",
        mode: "coach_hint",
        hintLevel: 2,
        createdAt: now,
      }],
    }),
  });

  const issues = brain.academicIntelligence.curriculumIntelligenceGraph.protection.validation.issues;
  const circularCount = issues.filter((issue) => issue.code === "circular_dependency").length;
  const orphanSignalCount = issues.filter((issue) => {
    if (issue.code !== "orphan_node") return false;
    const node = brain.academicIntelligence.curriculumIntelligenceGraph.nodes.find((row) => row.id === issue.nodeId);
    return node?.type === "learning_twin_signal";
  }).length;
  const duplicateRecommendationCount = issues.filter((issue) => {
    if (issue.code !== "duplicate_node") return false;
    const node = brain.academicIntelligence.curriculumIntelligenceGraph.nodes.find((row) => row.id === issue.nodeId);
    return node?.type === "recommendation";
  }).length;

  assert.equal(circularCount, 0);
  assert.equal(orphanSignalCount, 0);
  assert.equal(duplicateRecommendationCount, 0);
});
