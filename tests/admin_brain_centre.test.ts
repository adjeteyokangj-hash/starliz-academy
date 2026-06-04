import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAdminBrainCentreGet,
  type BrainCentrePayload,
} from "../src/app/api/admin/brain-centre/route";
import {
  handleAdminBrainCentreStudentGet,
  type BrainCentreDetailPayload,
} from "../src/app/api/admin/brain-centre/[studentId]/route";
import { handleAdminBrainCentreActionPost } from "../src/app/api/admin/brain-centre/[studentId]/actions/route";
import type {
  HeartbeatDecision,
  RecommendationSyncAudit,
} from "../src/lib/academic-intelligence/types";

type BrainCentreDeps = NonNullable<Parameters<typeof handleAdminBrainCentreGet>[1]>;

const now = "2026-06-04T10:00:00.000Z";

function heartbeat(overrides: Partial<HeartbeatDecision> = {}): HeartbeatDecision {
  return {
    primaryAction: "assign_catch_up",
    confidenceScore: 58,
    urgency: "high",
    reasons: ["Active weak area is blocking progress."],
    blockers: ["Catch-up pipeline is still open."],
    evidence: ["Weak-area signals: 1"],
    actorRequired: "student",
    suggestedNextStep: "Start highest-priority catch-up task before new advancement.",
    riskLevel: "high",
    ...overrides,
  };
}

function recommendationSync(overrides: Partial<RecommendationSyncAudit> = {}): RecommendationSyncAudit {
  return {
    status: "warning",
    canonicalDecision: {
      intent: "catch_up",
      target: {
        subject: "math",
        topic: "Fractions",
        label: "Fractions",
      },
      locked: true,
      lockReason: "Catch-up blocker is active.",
      sourceEngine: "heartbeat",
      action: "Lock next recommendation to Fractions catch-up until mastery improves.",
    },
    signals: [],
    mismatches: [
      {
        engine: "homework",
        label: "Homework",
        expected: "catch_up: Fractions",
        actual: "homework: Spelling practice",
        reason: "Homework is recommending a different action type.",
      },
    ],
    action: "Lock next recommendation to Fractions catch-up until mastery improves.",
    generatedAt: now,
    ...overrides,
  };
}

function profileWithSnapshot(lastCalculatedAt: string): string {
  return JSON.stringify({
    academicIntelligenceSnapshot: {
      version: 1,
      studentId: "student-1",
      masterMapSummary: {
        totalTopics: 1,
        byStatus: {
          not_started: 0,
          started: 0,
          practising: 0,
          needs_catch_up: 1,
          nearly_secure: 0,
          mastered: 0,
          needs_revision: 0,
        },
        needsCatchUpCount: 1,
        needsRevisionCount: 0,
        coveredCount: 0,
        averageScore: 42,
      },
      smartCatchUpSummary: {
        total: 1,
        active: 1,
        completed: 0,
        overdue: 0,
        highPriority: 1,
        topPriorityTopics: ["Fractions"],
      },
      progressionRecommendationSummary: {
        needsSupport: 1,
        readyToAdvance: 0,
        reviewNeeded: 0,
        headline: "Needs support",
      },
      learningTwinSummary: {
        hasEnoughData: true,
        bestExplanationStyle: "step_by_step_explanation",
        confidenceBand: "growing",
        coachSupportSignal: "active",
        todayApproach: "Use guided catch-up.",
      },
      examReadinessSummary: {
        score: 40,
        band: "not_ready",
        headline: "Not ready",
        blockerCount: 1,
      },
      generatedAt: lastCalculatedAt,
      lastCalculatedAt,
      refreshReason: "manual_refresh",
    },
  });
}

function makeBrain(input: {
  studentId: string;
  heartbeat?: HeartbeatDecision;
  sync?: RecommendationSyncAudit;
  qlfComplete?: boolean;
  dataState?: "active_with_qlf" | "qlf_completed_no_activity" | "new_no_activity";
  checklistStatus?: "pass" | "warning" | "fail";
}) {
  const dataState = input.dataState ?? "active_with_qlf";
  return {
    studentId: input.studentId,
    heartbeatSummary: input.heartbeat ?? heartbeat(),
    academicIntelligence: {
      generatedAt: now,
      recommendationSync: input.sync ?? recommendationSync(),
    },
    quickLevelFinderBaseline: input.qlfComplete === false ? null : { completedAt: now },
    evidenceSummary: {
      assignments: { total: 1, active: 1, completed: 0 },
      progress: { total: 0, completed: 0, averageScore: null },
      attempts: { total: 1, correct: 0, accuracy: 0 },
      weakAreas: { total: 1, active: 1, top: ["Fractions"] },
      skills: { total: 1, mastered: 0, weak: 1, averageAccuracy: 42 },
      certificates: { issuedCount: 0 },
      homework: { total: 1, active: 1, completed: 0, overdue: 0 },
    },
    dataState: {
      state: dataState,
      checklistStatus: input.checklistStatus ?? (dataState === "active_with_qlf" ? "pass" : "warning"),
      headline: dataState,
      detail: dataState === "qlf_completed_no_activity"
        ? "Quick Level Finder is complete but lesson or quiz activity has not started yet."
        : "Brain state detail",
      reviewRecommended: dataState !== "active_with_qlf",
    },
    generatedAt: now,
  };
}

test("Brain Centre route requires admin access", async () => {
  const deps: BrainCentreDeps = {
    requireAdmin: async () => ({
      session: null,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }) as never,
    }),
    findStudents: async () => [],
    getStudentLearningBrain: async () => null,
  };

  const response = await handleAdminBrainCentreGet(new Request("http://localhost/api/admin/brain-centre"), deps);
  assert.equal(response?.status, 401);
});

test("Brain Centre route aggregates Stage 1 warnings, mismatches, and QLF issues", async () => {
  const oldSnapshot = "2026-06-04T07:00:00.000Z";
  const deps: BrainCentreDeps = {
    requireAdmin: async () => ({
      session: { userId: "admin-1", email: "admin@example.com", role: "admin" },
      response: null,
    }),
    findStudents: async () => [
      {
        id: "student-1",
        name: "Ada",
        yearGroup: "Year 5",
        updatedAt: new Date(now),
        studentProfile: { aiLearningProfileJson: profileWithSnapshot(oldSnapshot) },
      },
      {
        id: "student-2",
        name: "Ben",
        yearGroup: "Year 6",
        updatedAt: new Date(now),
        studentProfile: { aiLearningProfileJson: null },
      },
    ],
    getStudentLearningBrain: async (studentId) => {
      if (studentId === "student-1") return makeBrain({ studentId });
      return makeBrain({
        studentId,
        heartbeat: heartbeat({
          primaryAction: "review_placement",
          riskLevel: "high",
          urgency: "high",
          suggestedNextStep: "Complete Quick Level Finder baseline before progression decisions.",
        }),
        sync: recommendationSync({
          status: "synced",
          mismatches: [],
          action: "Recommendation engines agree on placement review.",
        }),
        qlfComplete: false,
        dataState: "new_no_activity",
        checklistStatus: "fail",
      });
    },
  };

  const response = await handleAdminBrainCentreGet(new Request("http://localhost/api/admin/brain-centre?limit=10"), deps);
  const payload = await response.json() as BrainCentrePayload;

  assert.equal(response.status, 200);
  assert.equal(payload.summary.totalStudentsChecked, 2);
  assert.equal(payload.summary.warningCount, 1);
  assert.equal(payload.summary.criticalCount, 1);
  assert.equal(payload.heartbeatWarnings.length, 2);
  assert.equal(payload.recommendationMismatches.length, 1);
  assert.equal(payload.recommendationMismatches[0].mismatchingEngine, "Homework");
  assert.match(payload.recommendationMismatches[0].lockAction, /Lock next recommendation/);
  assert.ok(payload.qlfIssues.some((issue) => issue.issueType === "missing_baseline" && issue.studentId === "student-2"));
  assert.ok(payload.qlfIssues.some((issue) => issue.issueType === "stale_snapshot" && issue.studentId === "student-1"));
  assert.equal(payload.diagnostics.status, "critical");
  assert.ok(payload.diagnostics.issues.some((issue) => issue.code === "recommendation_conflicts" && issue.count === 1));
  assert.ok(payload.diagnostics.issues.some((issue) => issue.code === "missing_learning_dna" && issue.count === 2));
});

test("Brain Centre student investigation exposes evidence chain, diagnostics, control room, and timeline", async () => {
  const brain = {
    ...makeBrain({ studentId: "student-1" }),
    source: {
      studentId: "student-1",
      studentName: "Ada",
      yearGroup: "Year 5",
      keyStage: "KS2",
      assignments: [],
      attempts: [{
        id: "attempt-1",
        subject: "math",
        topic: "Fractions",
        skill: "equivalent_fractions",
        correct: false,
        score: 35,
        hintsUsed: 2,
        createdAt: now,
      }],
      weakAreas: [{
        id: "weak-1",
        subject: "math",
        topic: "Fractions",
        skill: "equivalent_fractions",
        status: "active",
        lastDetectedAt: now,
      }],
      studentSkills: [{
        skill: "equivalent_fractions",
        accuracy: 35,
        attempts: 5,
        correct: 1,
        status: "weak",
        updatedAt: now,
      }],
      coachUsage: [],
      dictionarySignals: [],
      progressRecords: [],
      assessmentHistory: [],
      generatedAt: now,
    },
    learningDnaSummary: { readinessLabel: "Needs support" },
    academicIntelligence: {
      ...makeBrain({ studentId: "student-1" }).academicIntelligence,
      recommendationSync: {
        ...recommendationSync(),
        signals: [
          {
            engine: "heartbeat",
            label: "HEART BEAT",
            intent: "catch_up",
            target: { subject: "math", topic: "Fractions", label: "Fractions" },
            status: "aligned",
            summary: "HEART BEAT recommends catch-up.",
            evidence: ["Weak-area signals: 1"],
          },
          {
            engine: "homework",
            label: "Homework",
            intent: "homework",
            target: { subject: "spelling", topic: "Common exception words", label: "Spelling practice" },
            status: "mismatch",
            summary: "Homework is set to spelling.",
            evidence: ["Status: assigned"],
          },
        ],
      },
      summary: {
        totalTopics: 1,
        byStatus: {
          not_started: 0,
          started: 0,
          practising: 0,
          needs_catch_up: 1,
          nearly_secure: 0,
          mastered: 0,
          needs_revision: 0,
        },
        needsCatchUpCount: 1,
        needsRevisionCount: 0,
        coveredCount: 0,
        averageScore: 35,
      },
      masteryExpansion: {
        needsCatchUpTopics: 1,
        nearlySecureTopics: 0,
        masteredTopics: 0,
        overdueRevisionTopics: 0,
        highConfidenceTopics: 0,
        priorityTopics: ["Fractions"],
      },
      nextRecommendedActions: ["Start catch-up: Fractions catch-up"],
      assessmentReadiness: "needs_catch_up",
      catchUpRecommendations: [{
        id: "rec-1",
        title: "Fractions catch-up",
        subject: "math",
        topic: "Fractions",
        reason: "Weak area",
        studentFriendlyReason: "Practise fractions",
        taskType: "targeted_practice",
        estimatedMinutes: 18,
        priority: "high",
        status: "recommended",
        sourceTrigger: "active_weak_area",
        recommendedAction: "Start practice",
      }],
      examReadinessProfile: {
        score: 35,
        band: "not_ready",
        headline: "Not ready",
        blockers: ["Fractions"],
        recommendedActions: ["Catch-up"],
        signals: {
          masteryScore: 35,
          consistencyScore: 35,
          examEvidenceScore: 0,
          weakAreaPenalty: 20,
        },
      },
      catchUpTasks: [{
        taskId: "catch-up-1",
        studentId: "student-1",
        recommendationId: "rec-1",
        title: "Fractions catch-up",
        subject: "math",
        topic: "Fractions",
        status: "active",
        priority: "high",
        estimatedMinutes: 18,
        sourceTrigger: "active_weak_area",
        createdAt: now,
        updatedAt: now,
      }],
      homeworkTasks: [{
        taskId: "homework-1",
        studentId: "student-1",
        blockId: "block-1",
        title: "Spelling practice",
        subject: "spelling",
        status: "assigned",
        estimatedMinutes: 15,
        createdAt: now,
        updatedAt: now,
      }],
    },
    quickLevelFinderBaseline: { completedAt: now },
  };
  const response = await handleAdminBrainCentreStudentGet(
    new Request("http://localhost/api/admin/brain-centre/student-1"),
    { params: Promise.resolve({ studentId: "student-1" }) },
    {
      requireAdmin: async () => ({ session: { userId: "admin-1", email: "admin@example.com", role: "admin" }, response: null }),
      findStudent: async () => ({
        id: "student-1",
        name: "Ada",
        yearGroup: "Year 5",
        updatedAt: new Date(now),
        studentProfile: { aiLearningProfileJson: profileWithSnapshot(now) },
      }),
      getStudentLearningBrain: async () => brain as never,
    },
  );
  const payload = await response.json() as BrainCentreDetailPayload;

  assert.equal(response.status, 200);
  assert.equal(payload.student.id, "student-1");
  assert.ok(payload.evidenceChain.some((stage) => stage.stage === "Attempt" && stage.status === "present"));
  assert.ok(payload.diagnostics.issues.some((issue) => issue.code === "recommendation_conflicts"));
  assert.ok(payload.recommendationControlRoom.some((row) => row.engine === "Homework" && row.conflict));
  assert.ok(payload.timeline.some((event) => event.type === "heartbeat_warning"));
  assert.ok(payload.timeline.some((event) => event.type === "catch_up_generated"));
});

test("Brain Centre actions are admin-only, audited, and use safe services", async () => {
  const calls: string[] = [];
  const response = await handleAdminBrainCentreActionPost(
    new Request("http://localhost/api/admin/brain-centre/student-1/actions", {
      method: "POST",
      body: JSON.stringify({ action: "generate_catch_up_recommendation", note: "Review fractions" }),
    }),
    { params: Promise.resolve({ studentId: "student-1" }) },
    {
      requireAdmin: async () => ({ session: { userId: "admin-1", email: "admin@example.com", role: "admin" }, response: null }),
      getStudentLearningBrain: async () => ({
        ...makeBrain({ studentId: "student-1" }),
        academicIntelligence: {
          ...makeBrain({ studentId: "student-1" }).academicIntelligence,
          catchUpRecommendations: [{
            id: "rec-1",
            title: "Fractions catch-up",
            subject: "math",
            topic: "Fractions",
            reason: "Weak area",
            studentFriendlyReason: "Practise fractions",
            taskType: "targeted_practice",
            estimatedMinutes: 18,
            priority: "high",
            status: "recommended",
            sourceTrigger: "active_weak_area",
            recommendedAction: "Start practice",
          }],
          schoolWeekModePlan: {
            enabled: false,
            strategy: "",
            totalEstimatedMinutes: 0,
            days: [],
            dailySchedules: [],
            settings: {
              enabled: false,
              activeDays: [],
              startTime: "09:00",
              endTime: "12:00",
              lessonBlockMinutes: 30,
              shortBreakMinutes: 5,
              lunchMinutes: 30,
              dailySubjectLimit: 1,
              weeklySubjectSelection: [],
              includeCatchUpTasks: true,
              includeRevisionBlocks: false,
              includeHomeworkBlock: false,
              includeQuizReviewBlock: false,
              includeWellbeingBlock: false,
              includeEndOfDaySummary: false,
            },
          },
        },
      }) as never,
      refreshAcademicIntelligenceSnapshot: async () => {
        calls.push("refresh");
        return null;
      },
      syncCatchUpTasks: async () => {
        calls.push("catch-up");
        return [];
      },
      syncHomeworkTasks: async () => {
        calls.push("homework");
        return [];
      },
      writeAuditLog: async (input) => {
        calls.push(`audit:${input.action}`);
      },
    },
  );
  const payload = await response.json() as { ok: boolean; action: string };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.action, "generate_catch_up_recommendation");
  assert.deepEqual(calls, ["catch-up", "audit:brain_centre_generate_catch_up_recommendation"]);
});

test("Brain Centre actions reject non-admin requests before services run", async () => {
  const calls: string[] = [];
  const response = await handleAdminBrainCentreActionPost(
    new Request("http://localhost/api/admin/brain-centre/student-1/actions", {
      method: "POST",
      body: JSON.stringify({ action: "refresh_snapshot" }),
    }),
    { params: Promise.resolve({ studentId: "student-1" }) },
    {
      requireAdmin: async () => ({
        session: null,
        response: Response.json({ error: "Unauthorized" }, { status: 401 }) as never,
      }),
      getStudentLearningBrain: async () => {
        calls.push("brain");
        return null;
      },
      refreshAcademicIntelligenceSnapshot: async () => {
        calls.push("refresh");
        return null;
      },
      syncCatchUpTasks: async () => {
        calls.push("catch-up");
        return [];
      },
      syncHomeworkTasks: async () => {
        calls.push("homework");
        return [];
      },
      writeAuditLog: async () => {
        calls.push("audit");
      },
    },
  );

  assert.equal(response?.status, 401);
  assert.deepEqual(calls, []);
});
