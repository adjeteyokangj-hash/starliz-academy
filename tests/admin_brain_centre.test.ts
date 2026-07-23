import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAdminBrainCentreGet,
  type BrainCentrePayload,
} from "../src/app/api/admin/brain-centre/route-helpers";
import {
  handleAdminBrainCentreStudentGet,
  type BrainCentreDetailPayload,
} from "../src/app/api/admin/brain-centre/[studentId]/route";
import { handleAdminBrainCentreActionPost } from "../src/app/api/admin/brain-centre/[studentId]/actions/route";
import { buildBrainWarningFingerprint, snapshotStatus } from "../src/app/api/admin/brain-centre/_lib";
import type {
  CoachTutorOrchestrationAudit,
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

function coachTutorAudit(overrides: Partial<CoachTutorOrchestrationAudit> = {}): CoachTutorOrchestrationAudit {
  return {
    recentCoachHelpCount: 2,
    stillStrugglingCount: 1,
    needsCatchUpCount: 1,
    liveTutorSupportCount: 0,
    differentExplanationStyleCount: 0,
    topSubject: "math",
    topTopic: "Fractions",
    topSkillId: "equivalent_fractions",
    topSkillLabel: "Equivalent Fractions",
    unresolvedTutorSkippedCount: 0,
    intent: "catch_up",
    target: { subject: "math", topic: "Fractions", skill: "equivalent_fractions", label: "Fractions" },
    status: "aligned",
    reason: "Coach/Tutor signals agree with the orchestrated catch-up target.",
    adminAction: "Keep Coach/Tutor support aligned with the current orchestrated action.",
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
      coachTutorAudit: coachTutorAudit(),
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
      confidenceBand: dataState === "active_with_qlf" ? "high" : dataState === "new_no_activity" ? "insufficient" : "medium",
      recommendationHonesty: dataState === "active_with_qlf" ? "ready" : dataState === "new_no_activity" ? "insufficient_data" : "limited_evidence",
      evidenceCitations: dataState === "active_with_qlf" ? ["attempts:1", "qlf:completed"] : [],
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

test("Brain Centre route uses the default limit when no limit is supplied", async () => {
  let requestedLimit = 0;
  const deps: BrainCentreDeps = {
    requireAdmin: async () => ({
      session: { userId: "admin-1", email: "admin@example.com", role: "admin" },
      response: null,
    }),
    findStudents: async (limit) => {
      requestedLimit = limit;
      return [];
    },
    getStudentLearningBrain: async () => null,
  };

  const response = await handleAdminBrainCentreGet(new Request("http://localhost/api/admin/brain-centre"), deps);

  assert.equal(response.status, 200);
  assert.equal(requestedLimit, 50);
});

test("Brain Centre route respects valid limits, caps high limits, and defaults invalid limits", async () => {
  const cases = [
    { url: "http://localhost/api/admin/brain-centre?limit=50", expected: 50 },
    { url: "http://localhost/api/admin/brain-centre?limit=500", expected: 100 },
    { url: "http://localhost/api/admin/brain-centre?limit=not-a-number", expected: 50 },
    { url: "http://localhost/api/admin/brain-centre?limit=", expected: 50 },
    { url: "http://localhost/api/admin/brain-centre?limit=0", expected: 50 },
    { url: "http://localhost/api/admin/brain-centre?limit=-4", expected: 50 },
  ];

  for (const row of cases) {
    let requestedLimit = 0;
    const deps: BrainCentreDeps = {
      requireAdmin: async () => ({
        session: { userId: "admin-1", email: "admin@example.com", role: "admin" },
        response: null,
      }),
      findStudents: async (limit) => {
        requestedLimit = limit;
        return [];
      },
      getStudentLearningBrain: async () => null,
    };

    const response = await handleAdminBrainCentreGet(new Request(row.url), deps);

    assert.equal(response.status, 200);
    assert.equal(requestedLimit, row.expected, row.url);
  }
});

test("Brain Centre includes multiple students when no limit parameter is supplied", async () => {
  const students = [
    {
      id: "student-1",
      name: "Ada",
      yearGroup: "Year 5",
      updatedAt: new Date(now),
      studentProfile: { aiLearningProfileJson: profileWithSnapshot(now) },
    },
    {
      id: "student-2",
      name: "Ben",
      yearGroup: "Year 6",
      updatedAt: new Date(now),
      studentProfile: { aiLearningProfileJson: profileWithSnapshot(now) },
    },
    {
      id: "student-3",
      name: "Cara",
      yearGroup: "Year 7",
      updatedAt: new Date(now),
      studentProfile: { aiLearningProfileJson: profileWithSnapshot(now) },
    },
  ];
  let requestedLimit = 0;
  const deps: BrainCentreDeps = {
    requireAdmin: async () => ({
      session: { userId: "admin-1", email: "admin@example.com", role: "admin" },
      response: null,
    }),
    findStudents: async (limit) => {
      requestedLimit = limit;
      return students;
    },
    getStudentLearningBrain: async (studentId) => makeBrain({
      studentId,
      heartbeat: heartbeat({
        primaryAction: "maintain_level",
        riskLevel: "low",
        urgency: "low",
        suggestedNextStep: "Maintain current learning path.",
      }),
      sync: recommendationSync({
        status: "synced",
        mismatches: [],
        action: "Recommendation engines are aligned.",
      }),
    }),
  };

  const response = await handleAdminBrainCentreGet(new Request("http://localhost/api/admin/brain-centre"), deps);
  const payload = await response.json() as BrainCentrePayload;

  assert.equal(response.status, 200);
  assert.equal(requestedLimit, 50);
  assert.equal(payload.summary.totalStudentsChecked, 3);
  assert.deepEqual(payload.students.map((student) => student.studentName), ["Ada", "Ben", "Cara"]);
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
      coachTutorAudit: coachTutorAudit({ status: "mismatch", reason: "Coach/Tutor mismatch for display." }),
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
      findLatestWarningReview: async () => null,
    },
  );
  const payload = await response.json() as BrainCentreDetailPayload;

  assert.equal(response.status, 200);
  assert.equal(payload.student.id, "student-1");
  assert.equal(payload.dataState.state, "active_with_qlf");
  assert.equal(payload.recommendationHonesty, "ready");
  assert.ok(payload.evidenceCitations.includes("attempts:1"));
  assert.ok(Array.isArray(payload.catchUpExplainability));
  assert.ok(payload.evidenceChain.some((stage) => stage.stage === "Attempt" && stage.status === "present"));
  assert.equal(payload.coachTutorAudit.status, "mismatch");
  assert.ok(payload.evidenceChain.some((stage) => stage.stage === "Coach/Tutor" && stage.status === "warning"));
  assert.ok(payload.diagnostics.issues.some((issue) => issue.code === "recommendation_conflicts"));
  assert.ok(payload.recommendationControlRoom.some((row) => row.engine === "Homework" && row.conflict));
  assert.ok(payload.timeline.some((event) => event.type === "heartbeat_warning"));
  assert.ok(payload.timeline.some((event) => event.type === "catch_up_generated"));
  assert.equal(payload.warningReview.status, "unreviewed");
});

test("Brain Centre investigation caps severity and ignores missing-data disagreements when evidence is thin", async () => {
  const brain = {
    ...makeBrain({
      studentId: "student-1",
      dataState: "new_no_activity",
      checklistStatus: "warning",
      heartbeat: heartbeat({
        primaryAction: "assign_catch_up",
        riskLevel: "critical",
        urgency: "critical",
        confidenceScore: 22,
        reasons: ["Active or overdue catch-up tasks must be completed before progression."],
      }),
    }),
    source: {
      studentId: "student-1",
      studentName: "Adjei",
      yearGroup: "Year 9",
      keyStage: "KS3",
      assignments: [],
      attempts: [],
      weakAreas: [],
      studentSkills: [],
      coachUsage: [],
      dictionarySignals: [],
      progressRecords: [],
      assessmentHistory: [],
      generatedAt: now,
    },
    learningDnaSummary: null,
    academicIntelligence: {
      ...makeBrain({ studentId: "student-1" }).academicIntelligence,
      summary: {
        totalTopics: 0,
        byStatus: {
          not_started: 0,
          started: 0,
          practising: 0,
          needs_catch_up: 0,
          nearly_secure: 0,
          mastered: 0,
          needs_revision: 0,
        },
        needsCatchUpCount: 0,
        needsRevisionCount: 0,
        coveredCount: 0,
        averageScore: null,
      },
      masteryExpansion: {
        needsCatchUpTopics: 0,
        nearlySecureTopics: 0,
        masteredTopics: 0,
        overdueRevisionTopics: 0,
        highConfidenceTopics: 0,
        priorityTopics: [],
      },
      nextRecommendedActions: ["Complete catch-up before progression."],
      assessmentReadiness: "needs_catch_up",
      catchUpRecommendations: [],
      examReadinessProfile: {
        score: 0,
        band: "not_ready",
        headline: "Not ready",
        blockers: [],
        recommendedActions: [],
        signals: {
          masteryScore: 0,
          consistencyScore: 0,
          examEvidenceScore: 0,
          weakAreaPenalty: 0,
        },
      },
      catchUpTasks: [{
        taskId: "catch-up-chem",
        studentId: "student-1",
        recommendationId: "rec-chem",
        title: "Chemistry practice catch-up",
        subject: "science",
        topic: "Chemistry",
        status: "active",
        priority: "high",
        estimatedMinutes: 20,
        sourceTrigger: "active_weak_area",
        createdAt: now,
        updatedAt: now,
      }],
      homeworkTasks: [],
    },
    quickLevelFinderBaseline: {
      completedAt: now,
      yearGroup: "Year 9",
      parentSubjectScores: [
        { subject: "science", accuracy: 78 },
        { subject: "math", accuracy: 72 },
      ],
    },
    evidenceSummary: {
      assignments: { total: 0, active: 0, completed: 0 },
      progress: { total: 0, completed: 0, averageScore: null },
      attempts: { total: 0, correct: 0, accuracy: null },
      weakAreas: { total: 0, active: 0, top: [] },
      skills: { total: 0, mastered: 0, weak: 0, averageAccuracy: null },
      certificates: { issuedCount: 0 },
      homework: { total: 0, active: 0, completed: 0, overdue: 0 },
    },
  };

  const response = await handleAdminBrainCentreStudentGet(
    new Request("http://localhost/api/admin/brain-centre/student-1"),
    { params: Promise.resolve({ studentId: "student-1" }) },
    {
      requireAdmin: async () => ({ session: { userId: "admin-1", email: "admin@example.com", role: "admin" }, response: null }),
      findStudent: async () => ({
        id: "student-1",
        name: "Adjei",
        yearGroup: "Year 9",
        updatedAt: new Date(now),
        studentProfile: { aiLearningProfileJson: profileWithSnapshot(now) },
      }),
      getStudentLearningBrain: async () => brain as never,
      findLatestWarningReview: async () => null,
    },
  );
  const payload = await response.json() as BrainCentreDetailPayload;
  const investigation = payload.heartbeatInvestigation;
  const learningDna = investigation.systems.find((row) => row.system === "Learning DNA");
  const qlf = investigation.systems.find((row) => row.system === "QLF Baseline");

  assert.equal(response.status, 200);
  assert.equal(investigation.conflictSummary.evidenceSufficiency, "insufficient");
  assert.equal(investigation.conflictSummary.severity, "medium");
  assert.match(investigation.conflictSummary.honestyNote ?? "", /Thin evidence/i);
  assert.equal(learningDna?.recommendation, "Learning DNA Missing");
  assert.equal(learningDna?.agreement, "no_data");
  assert.equal(learningDna?.disagreeing, false);
  assert.equal(qlf?.recommendation, "Ready For Next Lesson");
  assert.equal(qlf?.disagreeing, true);
  assert.equal(investigation.conflictSummary.status, "conflict_detected");
  assert.ok(investigation.recommendedActions[0]?.includes("Gather recent attempt evidence"));
  assert.equal(payload.brainHealth.status, "warning");
  assert.equal(payload.heartbeatDisplay.riskLevel, "medium");
  assert.equal(payload.heartbeatDisplay.urgency, "medium");
  assert.equal(payload.heartbeat.riskLevel, "critical");
  assert.equal(
    payload.diagnostics.issues.find((issue) => issue.code === "heartbeat_conflicts")?.severity,
    "warning",
  );
});

test("Brain Centre student investigation overlays matching warning review audit state", async () => {
  const brain = {
    ...makeBrain({ studentId: "student-1" }),
    source: {
      studentId: "student-1",
      studentName: "Ada",
      yearGroup: "Year 5",
      keyStage: "KS2",
      assignments: [],
      attempts: [],
      weakAreas: [],
      studentSkills: [],
      coachUsage: [],
      dictionarySignals: [],
      progressRecords: [],
      assessmentHistory: [],
      generatedAt: now,
    },
    learningDnaSummary: { readinessLabel: "Needs support" },
    academicIntelligence: {
      ...makeBrain({ studentId: "student-1" }).academicIntelligence,
      summary: {
        totalTopics: 0,
        byStatus: {
          not_started: 0,
          started: 0,
          practising: 0,
          needs_catch_up: 0,
          nearly_secure: 0,
          mastered: 0,
          needs_revision: 0,
        },
        needsCatchUpCount: 0,
        needsRevisionCount: 0,
        coveredCount: 0,
        averageScore: null,
      },
      masteryExpansion: {
        needsCatchUpTopics: 0,
        nearlySecureTopics: 0,
        masteredTopics: 0,
        overdueRevisionTopics: 0,
        highConfidenceTopics: 0,
        priorityTopics: [],
      },
      nextRecommendedActions: ["Review current support need."],
      assessmentReadiness: "needs_review",
      catchUpRecommendations: [],
      examReadinessProfile: {
        score: 0,
        band: "not_ready",
        headline: "Not ready",
        blockers: [],
        recommendedActions: [],
        signals: {
          masteryScore: 0,
          consistencyScore: 0,
          examEvidenceScore: 0,
          weakAreaPenalty: 0,
        },
      },
      catchUpTasks: [],
      homeworkTasks: [],
    },
    quickLevelFinderBaseline: { completedAt: now },
  };
  const reviewedFingerprint = buildBrainWarningFingerprint({
    studentId: "student-1",
    heartbeat: brain.heartbeatSummary,
    recommendationSync: brain.academicIntelligence.recommendationSync,
    dataState: brain.dataState,
    snapshotStatus: snapshotStatus(profileWithSnapshot(now)).status,
  });
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
      findLatestWarningReview: async () => ({
        actorUserId: "admin-1",
        createdAt: new Date(now),
        metadataJson: JSON.stringify({
          warningFingerprint: reviewedFingerprint,
          note: "Reviewed with tutor.",
        }),
      }),
    },
  );
  const payload = await response.json() as BrainCentreDetailPayload;

  assert.equal(response.status, 200);
  assert.equal(payload.warningReview.status, "reviewed");
  assert.equal(payload.warningReview.reviewedBy, "admin-1");
  assert.equal(payload.warningReview.note, "Reviewed with tutor.");
  assert.ok(payload.warningReview.fingerprint.startsWith("brain-warning-"));
  assert.ok(payload.timeline.some((event) => event.type === "brain_warning_reviewed"));
});

test("Brain Centre student investigation flags warning changed since latest review", async () => {
  const brain = {
    ...makeBrain({
      studentId: "student-1",
      heartbeat: heartbeat({
        primaryAction: "assign_catch_up",
        riskLevel: "high",
        urgency: "critical",
        suggestedNextStep: "Start urgent catch-up before progression.",
      }),
    }),
    source: {
      studentId: "student-1",
      studentName: "Ada",
      yearGroup: "Year 5",
      keyStage: "KS2",
      assignments: [],
      attempts: [],
      weakAreas: [],
      studentSkills: [],
      coachUsage: [],
      dictionarySignals: [],
      progressRecords: [],
      assessmentHistory: [],
      generatedAt: now,
    },
    learningDnaSummary: { readinessLabel: "Needs support" },
    academicIntelligence: {
      ...makeBrain({ studentId: "student-1" }).academicIntelligence,
      summary: {
        totalTopics: 0,
        byStatus: {
          not_started: 0,
          started: 0,
          practising: 0,
          needs_catch_up: 0,
          nearly_secure: 0,
          mastered: 0,
          needs_revision: 0,
        },
        needsCatchUpCount: 0,
        needsRevisionCount: 0,
        coveredCount: 0,
        averageScore: null,
      },
      masteryExpansion: {
        needsCatchUpTopics: 0,
        nearlySecureTopics: 0,
        masteredTopics: 0,
        overdueRevisionTopics: 0,
        highConfidenceTopics: 0,
        priorityTopics: [],
      },
      nextRecommendedActions: ["Review current support need."],
      assessmentReadiness: "needs_review",
      catchUpRecommendations: [],
      examReadinessProfile: {
        score: 0,
        band: "not_ready",
        headline: "Not ready",
        blockers: [],
        recommendedActions: [],
        signals: {
          masteryScore: 0,
          consistencyScore: 0,
          examEvidenceScore: 0,
          weakAreaPenalty: 0,
        },
      },
      catchUpTasks: [],
      homeworkTasks: [],
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
      findLatestWarningReview: async () => ({
        actorUserId: "admin-1",
        createdAt: new Date(now),
        metadataJson: JSON.stringify({
          warningFingerprint: "brain-warning-old",
          note: "Reviewed earlier.",
        }),
      }),
    },
  );
  const payload = await response.json() as BrainCentreDetailPayload;

  assert.equal(response.status, 200);
  assert.equal(payload.warningReview.status, "changed_since_review");
  assert.equal(payload.warningReview.reviewedFingerprint, "brain-warning-old");
  assert.equal(payload.warningReview.signalChanged, true);
  assert.notEqual(payload.warningReview.fingerprint, payload.warningReview.reviewedFingerprint);
  assert.ok(payload.timeline.some((event) => event.label === "Brain Warning Changed Since Review"));
  assert.ok(payload.timeline.some((event) => event.detail.includes("Reviewed fingerprint: brain-warning-old")));
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
      findStudentProfileJson: async () => profileWithSnapshot(now),
    },
  );
  const payload = await response.json() as { ok: boolean; action: string };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.action, "generate_catch_up_recommendation");
  assert.deepEqual(calls, ["catch-up", "audit:brain_centre_generate_catch_up_recommendation"]);
});

test("Brain Centre log warning review writes durable warning fingerprint audit event", async () => {
  let auditMetadata: Record<string, unknown> | undefined;
  const response = await handleAdminBrainCentreActionPost(
    new Request("http://localhost/api/admin/brain-centre/student-1/actions", {
      method: "POST",
      body: JSON.stringify({ action: "mark_warning_reviewed", note: "Reviewed with tutor." }),
    }),
    { params: Promise.resolve({ studentId: "student-1" }) },
    {
      requireAdmin: async () => ({ session: { userId: "admin-1", email: "admin@example.com", role: "admin" }, response: null }),
      getStudentLearningBrain: async () => makeBrain({ studentId: "student-1" }) as never,
      refreshAcademicIntelligenceSnapshot: async () => null,
      syncCatchUpTasks: async () => [],
      syncHomeworkTasks: async () => [],
      writeAuditLog: async (input) => {
        auditMetadata = input.metadata;
        assert.equal(input.action, "brain_warning_reviewed");
        assert.equal(input.entityType, "brain_centre_student");
        assert.equal(input.entityId, "student-1");
      },
      findStudentProfileJson: async () => profileWithSnapshot(now),
    },
  );
  const payload = await response.json() as { ok: boolean; result: { warningFingerprint: string } };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.ok(payload.result.warningFingerprint.startsWith("brain-warning-"));
  assert.equal(auditMetadata?.warningFingerprint, payload.result.warningFingerprint);
  assert.equal(auditMetadata?.lifecycleStatus, "reviewed");
  assert.equal(auditMetadata?.note, "Reviewed with tutor.");
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
      findStudentProfileJson: async () => {
        calls.push("profile");
        return null;
      },
    },
  );

  assert.equal(response?.status, 401);
  assert.deepEqual(calls, []);
});
