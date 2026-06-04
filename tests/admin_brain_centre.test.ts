import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAdminBrainCentreGet,
  type BrainCentrePayload,
} from "../src/app/api/admin/brain-centre/route";
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
});
