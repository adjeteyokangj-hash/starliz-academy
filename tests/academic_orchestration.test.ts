import test from "node:test";
import assert from "node:assert/strict";

import { buildAcademicIntelligence } from "../src/lib/academic-intelligence/academicIntelligence";
import { buildCoachTutorOrchestrationAudit } from "../src/lib/academic-intelligence/coachOrchestrationAudit";
import {
  buildStudentLearningBrainFromSource,
  toAdminLearningBrainView,
  toParentLearningBrainView,
  toStudentDashboardBrainView,
} from "../src/lib/student-learning-brain";
import type {
  AcademicSourceData,
  CatchUpTaskRecord,
  CoachHeartbeatSignalSummary,
  HomeworkTaskRecord,
} from "../src/lib/academic-intelligence/types";

function nowIso(): string {
  return new Date().toISOString();
}

function baseSource(overrides: Partial<AcademicSourceData> = {}): AcademicSourceData {
  return {
    studentId: "student-orchestration-1",
    studentName: "Orchestration Student",
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
    generatedAt: nowIso(),
    ...overrides,
  };
}

function withCompletedQlf(source: AcademicSourceData): AcademicSourceData {
  return {
    ...source,
    quickLevelFinderBaseline: {
      completedAt: source.generatedAt ?? nowIso(),
      yearGroup: source.yearGroup ?? "Year 7",
      keyStage: source.keyStage ?? "KS3",
      confidenceLabel: "baseline_placement_signal",
      parentSubjectScores: [{ subject: "math", accuracy: 75, level: "secure" }],
      englishStrandScores: [{ strand: "reading", accuracy: 72, level: "secure" }],
    },
  };
}

function weakFractionsSource(): AcademicSourceData {
  const now = nowIso();
  return withCompletedQlf(baseSource({
    weakAreas: [{
      id: "weak-fractions",
      subject: "math",
      topic: "Fractions",
      skill: "equivalent_fractions",
      status: "active",
      accuracy: 38,
      attemptsCount: 5,
      lastDetectedAt: now,
    }],
    studentSkills: [{
      skill: "equivalent_fractions",
      status: "weak",
      accuracy: 38,
      attempts: 5,
      correct: 2,
      updatedAt: now,
    }],
    attempts: Array.from({ length: 5 }).map((_, index) => ({
      id: `fractions-weak-${index}`,
      subject: "math",
      topic: "Fractions",
      skill: "equivalent_fractions",
      correct: false,
      score: 35,
      hintsUsed: 2,
      createdAt: now,
    })),
  }));
}

function homeworkTask(overrides: Partial<HomeworkTaskRecord> = {}): HomeworkTaskRecord {
  const now = nowIso();
  return {
    taskId: "homework-fractions",
    studentId: "student-orchestration-1",
    blockId: "Monday-1",
    title: "Fractions reinforcement",
    subject: "math",
    topic: "Fractions",
    status: "assigned",
    estimatedMinutes: 15,
    dueDate: now,
    scheduledDay: "Monday",
    routeTarget: "/student/dashboard",
    note: null,
    metadata: undefined,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function completedCatchUpTask(overrides: Partial<CatchUpTaskRecord> = {}): CatchUpTaskRecord {
  const now = nowIso();
  return {
    taskId: "catch-up-fractions",
    studentId: "student-orchestration-1",
    recommendationId: "recovered-fractions",
    title: "Fractions catch-up",
    subject: "math",
    topic: "Fractions",
    skill: "equivalent_fractions",
    status: "completed",
    priority: "high",
    estimatedMinutes: 20,
    dueDate: null,
    scheduledDay: null,
    routeTarget: "/student/dashboard",
    sourceTrigger: "active_weak_area",
    note: null,
    metadata: undefined,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function coachSignals(overrides: Partial<CoachHeartbeatSignalSummary> = {}): CoachHeartbeatSignalSummary {
  return {
    windowDays: 14,
    totalCoachSignals: 1,
    understoodAfterHelpCount: 0,
    stillStrugglingCount: 1,
    repeatedWeakAreaCount: 1,
    needsCatchUpCount: 1,
    needsDifferentExplanationStyleCount: 0,
    needsLiveTutorSupportCount: 0,
    topSubjects: [{ value: "math", count: 1 }],
    topStrands: [{ value: "Fractions", count: 1 }],
    topSkillTopics: [{ value: "equivalent_fractions", count: 1 }],
    latestSignalAt: nowIso(),
    hasCoachConcern: true,
    hasTutorEscalationSignal: false,
    hasCatchUpSignal: true,
    ...overrides,
  };
}

test("weak area creates a catch-up-aligned orchestrated next action", () => {
  const output = buildAcademicIntelligence(weakFractionsSource(), {
    existingHomeworkTasks: [homeworkTask()],
  });

  assert.equal(output.orchestration.status, "blocked");
  assert.equal(output.orchestration.topicState, "weak");
  assert.equal(output.orchestration.nextAction, "catch_up");
  assert.match(output.orchestration.canonicalTarget.label, /Fractions/i);
  assert.ok(output.orchestration.alignedEngines.includes("catch_up"));
  assert.ok(output.orchestration.alignedEngines.includes("homework"));
  assert.ok(output.orchestration.gatedEngines.includes("daily_journey"));
  assert.equal(output.recommendationSync.canonicalDecision.intent, "catch_up");
  assert.equal(output.recommendationSync.canonicalDecision.locked, true);
});

test("unrelated homework cannot override the catch-up canonical target", () => {
  const output = buildAcademicIntelligence(weakFractionsSource(), {
    existingHomeworkTasks: [homeworkTask({
      taskId: "homework-spelling",
      title: "Spelling practice",
      subject: "spelling",
      topic: "Common exception words",
    })],
  });

  assert.equal(output.orchestration.nextAction, "catch_up");
  assert.ok(output.orchestration.mismatchedEngines.includes("homework"));
  assert.equal(output.recommendationSync.status, "warning");
  assert.ok(output.recommendationSync.mismatches.some((item) => item.engine === "homework"));
});

test("completed catch-up plus improved attempts clears warning state and allows progression", () => {
  const now = nowIso();
  const source = withCompletedQlf(baseSource({
    attempts: Array.from({ length: 8 }).map((_, index) => ({
      id: `fractions-recovered-${index}`,
      subject: "math",
      topic: "Fractions",
      skill: "equivalent_fractions",
      correct: true,
      score: 92,
      hintsUsed: 0,
      createdAt: now,
    })),
    assignments: [{
      id: "assignment-fractions-complete",
      status: "completed",
      subject: "math",
      topic: "Fractions",
      skill: "equivalent_fractions",
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    }],
  }));
  const output = buildAcademicIntelligence(source, {
    existingCatchUpTasks: [completedCatchUpTask()],
  });

  assert.equal(output.orchestration.status, "healthy");
  assert.notEqual(output.orchestration.nextAction, "catch_up");
  assert.equal(output.orchestration.nextAction, "progression");
  assert.equal(output.recommendationSync.status, "synced");
});

test("mastered topics prevent duplicate remediation and keep progression compatible", () => {
  const now = nowIso();
  const source = withCompletedQlf(baseSource({
    attempts: Array.from({ length: 10 }).map((_, index) => ({
      id: `fractions-mastered-${index}`,
      subject: "math",
      topic: "Fractions",
      skill: "equivalent_fractions",
      correct: true,
      score: 96,
      hintsUsed: 0,
      createdAt: now,
    })),
    assignments: [{
      id: "assignment-mastered",
      status: "completed",
      subject: "math",
      topic: "Fractions",
      skill: "equivalent_fractions",
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    }],
  }));
  const output = buildAcademicIntelligence(source);

  assert.equal(output.orchestration.status, "healthy");
  assert.equal(output.orchestration.nextAction, "progression");
  assert.equal(output.catchUpRecommendations.length, 0);
  assert.equal(output.catchUpTasks.length, 0);
  assert.equal(output.recommendationSync.status, "synced");
});

test("parent, admin, and student surfaces read the same orchestration next action", () => {
  const brain = buildStudentLearningBrainFromSource({
    source: weakFractionsSource(),
    homeworkTasks: [homeworkTask()],
  });
  const student = toStudentDashboardBrainView(brain);
  const parent = toParentLearningBrainView(brain);
  const admin = toAdminLearningBrainView(brain);

  assert.equal(student.orchestrationSummary.nextAction, "catch_up");
  assert.equal(parent.orchestration.nextAction, "catch_up");
  assert.equal(admin.orchestration.nextAction, "catch_up");
  assert.deepEqual(student.orchestrationSummary, parent.orchestration);
  assert.deepEqual(admin.orchestration, brain.academicIntelligence.orchestration);
});

test("recommendation sync canonical decision follows orchestration output", () => {
  const output = buildAcademicIntelligence(weakFractionsSource(), {
    existingHomeworkTasks: [homeworkTask({
      taskId: "homework-reading",
      title: "Reading inference practice",
      subject: "reading",
      topic: "Inference",
    })],
  });

  assert.equal(output.orchestration.nextAction, "catch_up");
  assert.equal(output.recommendationSync.canonicalDecision.intent, "catch_up");
  assert.deepEqual(output.recommendationSync.canonicalDecision.target, output.orchestration.canonicalTarget);
  assert.equal(output.recommendationSync.canonicalDecision.action, output.orchestration.adminAction);
});

test("Coach catch-up signal aligns when orchestration is locked to the same catch-up target", () => {
  const output = buildAcademicIntelligence(weakFractionsSource(), {
    existingHomeworkTasks: [homeworkTask()],
    coachHeartbeatSignals: coachSignals(),
  });

  assert.equal(output.coachTutorAudit.intent, "catch_up");
  assert.equal(output.coachTutorAudit.status, "aligned");
  assert.equal(output.coachTutorAudit.target.skill, "equivalent_fractions");
  assert.ok(output.recommendationSync.signals.some((signal) => signal.engine === "coach_tutor" && signal.status === "aligned"));
});

test("Coach catch-up signal mismatches when orchestration allows progression", () => {
  const now = nowIso();
  const output = buildAcademicIntelligence(withCompletedQlf(baseSource({
    attempts: Array.from({ length: 8 }).map((_, index) => ({
      id: `coach-advance-${index}`,
      subject: "math",
      topic: "Fractions",
      skill: "equivalent_fractions",
      correct: true,
      score: 94,
      hintsUsed: 0,
      createdAt: now,
    })),
    assignments: [{
      id: "assignment-coach-advance",
      status: "completed",
      subject: "math",
      topic: "Fractions",
      skill: "equivalent_fractions",
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    }],
  })), {
    coachHeartbeatSignals: coachSignals(),
  });

  assert.equal(output.orchestration.nextAction, "progression");
  assert.equal(output.coachTutorAudit.intent, "catch_up");
  assert.equal(output.coachTutorAudit.status, "mismatch");
  assert.ok(output.recommendationSync.mismatches.some((item) => item.engine === "coach_tutor"));
});

test("Coach live tutor support mismatches when orchestration has no intervention lock", () => {
  const now = nowIso();
  const output = buildAcademicIntelligence(withCompletedQlf(baseSource({
    attempts: Array.from({ length: 8 }).map((_, index) => ({
      id: `coach-tutor-${index}`,
      subject: "math",
      topic: "Fractions",
      skill: "equivalent_fractions",
      correct: true,
      score: 94,
      hintsUsed: 0,
      createdAt: now,
    })),
    assignments: [{
      id: "assignment-coach-tutor",
      status: "completed",
      subject: "math",
      topic: "Fractions",
      skill: "equivalent_fractions",
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    }],
  })), {
    coachHeartbeatSignals: coachSignals({
      needsCatchUpCount: 0,
      needsLiveTutorSupportCount: 2,
      hasCatchUpSignal: false,
      hasTutorEscalationSignal: true,
    }),
  });

  assert.equal(output.coachTutorAudit.intent, "tutor_support");
  assert.equal(output.coachTutorAudit.status, "mismatch");
});

test("low Coach usage is informational", () => {
  const output = buildAcademicIntelligence(withCompletedQlf(baseSource()));

  assert.equal(output.coachTutorAudit.recentCoachHelpCount, 0);
  assert.equal(output.coachTutorAudit.status, "informational");
  assert.ok(output.recommendationSync.signals.some((signal) => signal.engine === "coach_tutor" && signal.status === "informational"));
});

test("Coach signals with missing target stay informational instead of false warning", () => {
  const output = buildAcademicIntelligence(weakFractionsSource());
  const audit = buildCoachTutorOrchestrationAudit({
    orchestration: output.orchestration,
    coachHeartbeatSignals: coachSignals({
      topSubjects: [],
      topStrands: [],
      topSkillTopics: [],
    }),
    coachUsage: [],
    progressRecords: [],
  });

  assert.equal(audit.intent, "catch_up");
  assert.equal(audit.status, "informational");
  assert.match(audit.reason, /do not include/i);
});

test("student, parent, and admin Brain views expose Coach Tutor audit from the same Brain truth", () => {
  const brain = buildStudentLearningBrainFromSource({
    source: weakFractionsSource(),
    homeworkTasks: [homeworkTask()],
    coachHeartbeatSignals: coachSignals(),
  });
  const student = toStudentDashboardBrainView(brain);
  const parent = toParentLearningBrainView(brain);
  const admin = toAdminLearningBrainView(brain);

  assert.equal(student.coachTutorAuditSummary.status, brain.academicIntelligence.coachTutorAudit.status);
  assert.equal(parent.coachTutorAudit.status, brain.academicIntelligence.coachTutorAudit.status);
  assert.equal(admin.coachTutorAudit.status, brain.academicIntelligence.coachTutorAudit.status);
});
