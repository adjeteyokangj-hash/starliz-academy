import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStudentLearningBrainFromSource,
  toAdminLearningBrainView,
  toParentLearningBrainView,
  toStudentDashboardBrainView,
} from "../src/lib/student-learning-brain";
import {
  handleAdminBrainCentreGet,
  type BrainCentrePayload,
} from "../src/app/api/admin/brain-centre/route";
import type {
  AcademicSourceData,
  CatchUpTaskRecord,
  HomeworkTaskRecord,
} from "../src/lib/academic-intelligence/types";

type BrainCentreDeps = NonNullable<Parameters<typeof handleAdminBrainCentreGet>[1]>;
type Brain = ReturnType<typeof buildStudentLearningBrainFromSource>;

function nowIso(): string {
  return new Date().toISOString();
}

function baseSource(studentId: string, overrides: Partial<AcademicSourceData> = {}): AcademicSourceData {
  return {
    studentId,
    studentName: `Student ${studentId}`,
    yearGroup: "Year 6",
    keyStage: "KS2",
    examBoard: null,
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

function completedQlf(completedAt = nowIso()): AcademicSourceData["quickLevelFinderBaseline"] {
  return {
    completedAt,
    yearGroup: "Year 6",
    keyStage: "KS2",
    confidenceLabel: "baseline_placement_signal",
    parentSubjectScores: [
      { subject: "math", accuracy: 78, level: "secure" },
      { subject: "english", accuracy: 74, level: "secure" },
    ],
    englishStrandScores: [
      { strand: "reading", accuracy: 76, level: "secure" },
      { strand: "spelling", accuracy: 72, level: "secure" },
    ],
  };
}

function enabledSchoolWeekSettings(): AcademicSourceData["schoolWeekSettings"] {
  return {
    enabled: true,
    activeDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    startTime: "09:00",
    endTime: "12:00",
    lessonBlockMinutes: 30,
    shortBreakMinutes: 5,
    lunchMinutes: 30,
    dailySubjectLimit: 1,
    weeklySubjectSelection: ["math"],
    includeCatchUpTasks: true,
    includeRevisionBlocks: false,
    includeHomeworkBlock: false,
    includeQuizReviewBlock: false,
    includeWellbeingBlock: false,
    includeEndOfDaySummary: false,
  };
}

function freshProfileSnapshot(studentId: string): string {
  const stamp = nowIso();
  return JSON.stringify({
    academicIntelligenceSnapshot: {
      version: 1,
      studentId,
      masterMapSummary: {
        totalTopics: 1,
        byStatus: {
          not_started: 0,
          started: 0,
          practising: 0,
          needs_catch_up: 0,
          nearly_secure: 0,
          mastered: 1,
          needs_revision: 0,
        },
        needsCatchUpCount: 0,
        needsRevisionCount: 0,
        coveredCount: 1,
        averageScore: 92,
      },
      smartCatchUpSummary: {
        total: 0,
        active: 0,
        completed: 0,
        overdue: 0,
        highPriority: 0,
        topPriorityTopics: [],
      },
      progressionRecommendationSummary: {
        needsSupport: 0,
        readyToAdvance: 1,
        reviewNeeded: 0,
        headline: "Learning is secure enough for challenge work.",
      },
      learningTwinSummary: {
        hasEnoughData: true,
        bestExplanationStyle: "step_by_step_explanation",
        confidenceBand: "strong",
        coachSupportSignal: "helpful",
        todayApproach: "Move into challenge practice.",
      },
      examReadinessSummary: {
        score: 82,
        band: "ready",
        headline: "Ready",
        blockerCount: 0,
      },
      generatedAt: stamp,
      lastCalculatedAt: stamp,
      refreshReason: "manual_refresh",
    },
  });
}

function brainCentreDeps(brains: Record<string, Brain>, profiles: Record<string, string | null> = {}): BrainCentreDeps {
  return {
    requireAdmin: async () => ({
      session: { userId: "admin-1", email: "admin@example.com", role: "admin" },
      response: null,
    }),
    findStudents: async () => Object.values(brains).map((brain) => ({
      id: brain.studentId,
      name: brain.source.studentName ?? brain.studentId,
      yearGroup: brain.source.yearGroup ?? null,
      updatedAt: new Date(brain.generatedAt),
      studentProfile: {
        aiLearningProfileJson: profiles[brain.studentId] ?? freshProfileSnapshot(brain.studentId),
      },
    })),
    getStudentLearningBrain: async (studentId) => brains[studentId] ?? null,
  };
}

async function brainCentrePayload(brains: Record<string, Brain>, profiles: Record<string, string | null> = {}): Promise<BrainCentrePayload> {
  const response = await handleAdminBrainCentreGet(
    new Request("http://localhost/api/admin/brain-centre?limit=10"),
    brainCentreDeps(brains, profiles),
  );
  assert.equal(response.status, 200);
  return response.json() as Promise<BrainCentrePayload>;
}

function secureFractionsBrain(studentId = "student-healthy"): Brain {
  const stamp = nowIso();
  return buildStudentLearningBrainFromSource({
    source: baseSource(studentId, {
      quickLevelFinderBaseline: completedQlf(stamp),
      schoolWeekSettings: enabledSchoolWeekSettings(),
      assignments: [{
        id: "assignment-fractions-secure",
        status: "completed",
        subject: "math",
        topic: "Fractions",
        skill: "equivalent_fractions",
        createdAt: stamp,
        updatedAt: stamp,
        completedAt: stamp,
      }],
      attempts: Array.from({ length: 6 }).map((_, index) => ({
        id: `attempt-secure-${index}`,
        subject: "math",
        topic: "Fractions",
        skill: "equivalent_fractions",
        correct: true,
        score: 92,
        hintsUsed: 0,
        createdAt: stamp,
      })),
      progressRecords: [{
        id: "progress-secure",
        subject: "math",
        topic: "Fractions",
        skill: "equivalent_fractions",
        activityType: "lesson_check",
        activityName: "Fractions check",
        completed: true,
        correct: true,
        score: 92,
        accuracy: 92,
        createdAt: stamp,
      }],
      studentSkills: [{
        skill: "equivalent_fractions",
        accuracy: 92,
        attempts: 6,
        correct: 6,
        status: "mastered",
        updatedAt: stamp,
      }],
    }),
    learningDnaSummary: {
      readinessLabel: "Active",
      totalAttempts: 6,
      strongestPattern: "secure fractions",
    },
  });
}

function weakFractionsBrain(studentId = "student-weak", input: {
  catchUpTasks?: CatchUpTaskRecord[];
  homeworkTasks?: HomeworkTaskRecord[];
} = {}): Brain {
  const stamp = nowIso();
  return buildStudentLearningBrainFromSource({
    source: baseSource(studentId, {
      quickLevelFinderBaseline: completedQlf(stamp),
      attempts: [{
        id: "attempt-weak-fractions",
        subject: "math",
        topic: "Fractions",
        skill: "equivalent_fractions",
        correct: false,
        score: 35,
        hintsUsed: 2,
        createdAt: stamp,
      }],
      weakAreas: [{
        id: "weak-fractions",
        subject: "math",
        topic: "Fractions",
        skill: "equivalent_fractions",
        status: "active",
        weaknessType: "accuracy",
        accuracy: 35,
        attemptsCount: 5,
        lastDetectedAt: stamp,
      }],
      studentSkills: [{
        skill: "equivalent_fractions",
        accuracy: 35,
        attempts: 5,
        correct: 1,
        status: "weak",
        updatedAt: stamp,
      }],
    }),
    homeworkTasks: input.homeworkTasks,
    catchUpTasks: input.catchUpTasks,
    learningDnaSummary: {
      readinessLabel: "Needs support",
      totalAttempts: 5,
      weakestPattern: "fractions",
    },
  });
}

test("QLF flow updates Brain layers and Brain Centre shows the student healthy", async () => {
  const brain = secureFractionsBrain();
  const payload = await brainCentrePayload({ [brain.studentId]: brain });
  const row = payload.students.find((student) => student.studentId === brain.studentId);

  assert.ok(brain.quickLevelFinderBaseline);
  assert.equal(brain.learningDnaSummary?.readinessLabel, "Active");
  assert.ok(brain.academicIntelligence.generatedAt);
  assert.equal(brain.heartbeatSummary, brain.academicIntelligence.heartbeatDecision);
  assert.equal(brain.heartbeatSummary.primaryAction, "advance_student");
  assert.equal(brain.academicIntelligence.recommendationSync.status, "synced");
  assert.equal(row?.status, "healthy");
  assert.equal(payload.summary.healthyCount, 1);
  assert.equal(payload.heartbeatWarnings.length, 0);
  assert.equal(payload.recommendationMismatches.length, 0);
});

test("Weak Area flow creates Brain and Brain Centre recommendation warnings", async () => {
  const brain = weakFractionsBrain("student-weak-flow", {
    homeworkTasks: [{
      taskId: "homework-spelling",
      studentId: "student-weak-flow",
      blockId: "homework-block",
      title: "Spelling practice",
      subject: "spelling",
      topic: "Common exception words",
      status: "assigned",
      estimatedMinutes: 15,
      dueDate: nowIso(),
      scheduledDay: "Monday",
      routeTarget: "/student/dashboard",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }],
  });
  const payload = await brainCentrePayload({ [brain.studentId]: brain });

  assert.equal(brain.evidenceSummary.weakAreas.active, 1);
  assert.equal(brain.evidenceSummary.skills.weak, 1);
  assert.equal(brain.heartbeatSummary.primaryAction, "assign_catch_up");
  assert.equal(brain.academicIntelligence.recommendationSync.status, "warning");
  assert.equal(payload.heartbeatWarnings.some((warning) => warning.studentId === brain.studentId), true);
  assert.equal(payload.recommendationMismatches.some((mismatch) => mismatch.studentId === brain.studentId), true);
});

test("Recovery flow clears weak-area warnings and returns Brain Centre to healthy", async () => {
  const weak = weakFractionsBrain("student-recovery");
  const catchUp: CatchUpTaskRecord = {
    taskId: "catch-up-fractions",
    studentId: "student-recovery",
    recommendationId: weak.academicIntelligence.catchUpRecommendations[0]?.id ?? "fractions-catch-up",
    title: "Fractions catch-up",
    subject: "math",
    topic: "Fractions",
    skill: "equivalent_fractions",
    status: "completed",
    priority: "high",
    estimatedMinutes: 18,
    dueDate: nowIso(),
    scheduledDay: "Monday",
    routeTarget: "/student/dashboard",
    sourceTrigger: "active_weak_area",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const recovered = buildStudentLearningBrainFromSource({
    source: baseSource("student-recovery", {
      quickLevelFinderBaseline: completedQlf(),
      schoolWeekSettings: enabledSchoolWeekSettings(),
      attempts: Array.from({ length: 6 }).map((_, index) => ({
        id: `attempt-recovered-${index}`,
        subject: "math",
        topic: "Fractions",
        skill: "equivalent_fractions",
        correct: true,
        score: 91,
        hintsUsed: 0,
        createdAt: nowIso(),
      })),
      weakAreas: [],
      studentSkills: [{
        skill: "equivalent_fractions",
        accuracy: 91,
        attempts: 6,
        correct: 6,
        status: "mastered",
        updatedAt: nowIso(),
      }],
      assignments: [{
        id: "assignment-recovered",
        status: "completed",
        subject: "math",
        topic: "Fractions",
        skill: "equivalent_fractions",
        createdAt: nowIso(),
        updatedAt: nowIso(),
        completedAt: nowIso(),
      }],
    }),
    catchUpTasks: [catchUp],
    learningDnaSummary: { readinessLabel: "Recovered", totalAttempts: 6 },
  });
  const payload = await brainCentrePayload({ [recovered.studentId]: recovered });

  assert.equal(weak.heartbeatSummary.primaryAction, "assign_catch_up");
  assert.equal(recovered.evidenceSummary.weakAreas.active, 0);
  assert.equal(recovered.heartbeatSummary.primaryAction, "advance_student");
  assert.equal(recovered.academicIntelligence.recommendationSync.status, "synced");
  assert.equal(payload.students.find((student) => student.studentId === recovered.studentId)?.status, "healthy");
  assert.equal(payload.heartbeatWarnings.some((warning) => warning.studentId === recovered.studentId), false);
});

test("Parent, Admin, Academic Intelligence, and Brain Centre expose consistent key values", async () => {
  const brain = weakFractionsBrain("student-consistency");
  const parent = toParentLearningBrainView(brain);
  const admin = toAdminLearningBrainView(brain);
  const academic = brain.studentSafeAcademicIntelligence;
  const payload = await brainCentrePayload({ [brain.studentId]: brain });
  const centre = payload.students.find((student) => student.studentId === brain.studentId);

  assert.equal(parent.learningDna?.readinessLabel, admin.learningDnaSummary?.readinessLabel);
  assert.equal(parent.heartbeatSummary, admin.heartbeatSummary);
  assert.equal(parent.heartbeatSummary.primaryAction, academic.heartbeatDecision.primaryAction);
  assert.equal(parent.weakAreas.active, admin.evidenceSummary.weakAreas.active);
  assert.equal(parent.catchUpRecommendations[0]?.id, academic.catchUpRecommendations[0]?.id);
  assert.equal(parent.languageReadiness.status, admin.languageReadiness.status);
  assert.equal(Boolean(parent.quickLevelFinderBaseline), Boolean(admin.quickLevelFinderBaseline));
  assert.equal(centre?.heartbeatAction, brain.heartbeatSummary.primaryAction);
  assert.equal(centre?.recommendationSyncStatus, brain.academicIntelligence.recommendationSync.status);
  assert.equal(centre?.qlfComplete, Boolean(brain.quickLevelFinderBaseline));
});

test("Multi-child parent switching keeps dashboard and Brain Centre rows scoped per child", async () => {
  const childA = secureFractionsBrain("child-a");
  const childB = weakFractionsBrain("child-b");
  const childC = buildStudentLearningBrainFromSource({
    source: baseSource("child-c", {
      quickLevelFinderBaseline: completedQlf(),
      attempts: [{
        id: "child-c-reading",
        subject: "reading",
        topic: "Inference",
        skill: "inference",
        correct: true,
        score: 82,
        hintsUsed: 0,
        createdAt: nowIso(),
      }],
      studentSkills: [{
        skill: "inference",
        accuracy: 82,
        attempts: 3,
        correct: 3,
        status: "practising",
        updatedAt: nowIso(),
      }],
    }),
    learningDnaSummary: { readinessLabel: "Reading active", totalAttempts: 3 },
  });
  const dashboards = [childA, childB, childC].map((brain) => toStudentDashboardBrainView(brain));
  const payload = await brainCentrePayload({
    [childA.studentId]: childA,
    [childB.studentId]: childB,
    [childC.studentId]: childC,
  });

  assert.deepEqual(dashboards.map((view) => view.heartbeatSummary.primaryAction), [
    childA.heartbeatSummary.primaryAction,
    childB.heartbeatSummary.primaryAction,
    childC.heartbeatSummary.primaryAction,
  ]);
  assert.equal(payload.students.length, 3);
  assert.equal(new Set(payload.students.map((student) => student.studentId)).size, 3);
  assert.equal(payload.students.find((student) => student.studentId === "child-a")?.status, "healthy");
  assert.equal(payload.students.find((student) => student.studentId === "child-b")?.heartbeatAction, childB.heartbeatSummary.primaryAction);
  assert.equal(payload.students.find((student) => student.studentId === "child-c")?.qlfComplete, true);
  assert.equal(payload.recommendationMismatches.every((row) => row.studentId !== "child-a"), true);
});
