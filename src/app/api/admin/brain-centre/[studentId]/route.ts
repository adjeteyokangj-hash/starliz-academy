import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { getStudentLearningBrain } from "@/lib/student-learning-brain";
import {
  BRAIN_WARNING_REVIEW_ACTION,
  BRAIN_WARNING_REVIEW_ENTITY_TYPE,
  buildBrainWarningFingerprint,
  healthForBrain,
  parseBrainWarningReviewState,
  snapshotStatus,
  type BrainWarningReviewState,
} from "@/app/api/admin/brain-centre/_lib";
import { yearGroupToOrdinal } from "@/lib/curriculum";
import type { StudentLearningBrain } from "@/lib/student-learning-brain";

type Params = { params: Promise<{ studentId: string }> };

type BrainCentreDetailStudent = {
  id: string;
  name: string;
  yearGroup: string | null;
  updatedAt: Date;
  studentProfile: { aiLearningProfileJson: string | null } | null;
};

export type BrainDiagnosticIssue = {
  code:
    | "missing_learning_dna"
    | "missing_snapshot"
    | "stale_snapshot"
    | "qlf_complete_activity_pending"
    | "missing_weak_area_links"
    | "missing_student_skill_links"
    | "recommendation_conflicts"
    | "heartbeat_conflicts";
  severity: "warning" | "critical";
  label: string;
  detail: string;
};

export type BrainTimelineEvent = {
  at: string;
  type: string;
  label: string;
  detail: string;
};

export type BrainCentreDetailPayload = {
  student: { id: string; name: string; yearGroup: string | null };
  brainHealth: {
    status: "healthy" | "warning" | "critical";
    score: number;
    snapshotStatus: "fresh" | "stale" | "missing";
    snapshotLastCalculatedAt: string | null;
    generatedAt: string;
  };
  heartbeat: StudentLearningBrain["heartbeatSummary"];
  coachTutorAudit: StudentLearningBrain["academicIntelligence"]["coachTutorAudit"];
  recommendationSync: StudentLearningBrain["academicIntelligence"]["recommendationSync"];
  learningDnaSummary: StudentLearningBrain["learningDnaSummary"];
  weakAreas: StudentLearningBrain["source"]["weakAreas"];
  studentSkills: StudentLearningBrain["source"]["studentSkills"];
  qlfBaseline: StudentLearningBrain["quickLevelFinderBaseline"];
  academicSummary: {
    mastery: StudentLearningBrain["academicIntelligence"]["summary"];
    masteryExpansion: StudentLearningBrain["academicIntelligence"]["masteryExpansion"];
    nextRecommendedActions: string[];
    assessmentReadiness: string;
    examReadiness: StudentLearningBrain["academicIntelligence"]["examReadinessProfile"];
  };
  evidenceChain: Array<{
    stage: string;
    status: "present" | "missing" | "warning";
    timestamp: string | null;
    summary: string;
  }>;
  diagnostics: {
    status: "healthy" | "warning" | "critical";
    score: number;
    issues: BrainDiagnosticIssue[];
  };
  recommendationControlRoom: Array<{
    engine: string;
    currentRecommendation: string;
    recommendationSource: string;
    syncStatus: string;
    conflict: boolean;
  }>;
  timeline: BrainTimelineEvent[];
  warningReview: BrainWarningReviewState;
  heartbeatInvestigation: {
    conflictSummary: {
      conflictType: string;
      severity: "low" | "medium" | "high" | "critical";
      detectedAt: string;
      studentName: string;
      currentYearGroup: string | null;
      currentLearningLevel: string;
      schoolYear: string | null;
      currentWorkingLevel: string;
      learningGapYears: number | null;
      learningGapLabel: string;
      learningGapReason: string;
      heartbeatRecommendation: string;
      assignmentEngineRecommendation: string;
      assignmentEngineConfidence: number | null;
      assignmentEngineReason: string;
      status: "conflict_detected" | "aligned";
    };
    systems: Array<{
      system: string;
      recommendation: string;
      confidence: number | null;
      disagreeing: boolean;
    }>;
    reasoning: {
      weakAreas: string[];
      recentScores: number[];
      trend: "declining" | "improving" | "mixed" | "insufficient_data";
      reason: string;
    };
    evidence: {
      attemptsAnalysed: number;
      assignmentsCompleted: number;
      catchUpTasksOutstanding: number;
      weakAreas: number;
      learningDnaUpdatedAt: string | null;
      snapshotUpdatedAt: string | null;
    };
    recommendedActions: string[];
  };
};

function recommendationFromHeartbeatAction(action: StudentLearningBrain["heartbeatSummary"]["primaryAction"]): string {
  if (action === "assign_catch_up") return "Catch-Up Required";
  if (action === "advance_student") return "Ready For Next Lesson";
  if (action === "maintain_level") return "Maintain Current Level";
  if (action === "review_placement") return "Review Placement";
  if (action === "generate_assessment") return "Re-run Mastery Assessment";
  return action.replaceAll("_", " ");
}

function recommendationFromIntent(intent: StudentLearningBrain["academicIntelligence"]["recommendationSync"]["canonicalDecision"]["intent"]): string {
  if (intent === "catch_up") return "Catch-Up Required";
  if (intent === "advance") return "Ready For Next Lesson";
  if (intent === "maintain") return "Maintain Current Level";
  if (intent === "placement_review") return "Review Placement";
  if (intent === "assessment") return "Re-run Mastery Assessment";
  return intent.replaceAll("_", " ");
}

function stanceForRecommendation(recommendation: string): "catch_up" | "advance" | "maintain" | "review" {
  const normal = recommendation.toLowerCase();
  if (normal.includes("catch-up") || normal.includes("catch up")) return "catch_up";
  if (normal.includes("next lesson") || normal.includes("advance")) return "advance";
  if (normal.includes("maintain")) return "maintain";
  return "review";
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round(total / values.length);
}

function scoreFromAttempt(attempt: StudentLearningBrain["source"]["attempts"][number]): number {
  if (typeof attempt.score === "number" && Number.isFinite(attempt.score)) {
    return Math.max(0, Math.min(100, Math.round(attempt.score)));
  }
  return attempt.correct ? 100 : 0;
}

function trendFromScores(scores: number[]): "declining" | "improving" | "mixed" | "insufficient_data" {
  if (scores.length < 2) return "insufficient_data";
  const first = scores[0];
  const last = scores[scores.length - 1];
  if (last >= first + 8) return "improving";
  if (last <= first - 8) return "declining";
  return "mixed";
}

function confidenceFromSignalStatus(status: StudentLearningBrain["academicIntelligence"]["recommendationSync"]["signals"][number]["status"]): number {
  if (status === "aligned") return 82;
  if (status === "mismatch") return 76;
  return 68;
}

function buildHeartbeatInvestigation(
  student: BrainCentreDetailStudent,
  brain: StudentLearningBrain,
  snapshot: ReturnType<typeof snapshotStatus>,
): BrainCentreDetailPayload["heartbeatInvestigation"] {
  const sync = brain.academicIntelligence.recommendationSync;
  const assignmentSignal = sync.signals.find((signal) => signal.engine === "assignments");
  const assignmentRecommendation = assignmentSignal
    ? recommendationFromIntent(assignmentSignal.intent)
    : recommendationFromIntent(sync.canonicalDecision.intent);

  const heartbeatRecommendation = recommendationFromHeartbeatAction(brain.heartbeatSummary.primaryAction);
  const heartbeatStance = stanceForRecommendation(heartbeatRecommendation);

  const weakAreas = brain.source.weakAreas
    .filter((row) => row.status === "active")
    .slice(0, 3)
    .map((row) => row.topic ?? row.skill ?? row.subject);

  const recentAttempts = [...brain.source.attempts]
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .slice(-3);
  const recentScores = recentAttempts.map(scoreFromAttempt);
  const trend = trendFromScores(recentScores);

  const qlfScores = (brain.quickLevelFinderBaseline?.parentSubjectScores ?? []).map((row) => row.accuracy);
  const qlfConfidence = average(qlfScores);
  const qlfRecommendation = qlfConfidence !== null
    ? (qlfConfidence < 65 ? "Catch-Up Required" : "Ready For Next Lesson")
    : "Baseline Missing";

  const skillConfidence = average(brain.source.studentSkills.map((row) => row.accuracy));
  const learningDnaRecommendation = brain.learningDnaSummary
    ? (brain.evidenceSummary.weakAreas.active > 0 ? "Catch-Up Required" : "Maintain Current Level")
    : "Learning DNA Missing";

  const systems: BrainCentreDetailPayload["heartbeatInvestigation"]["systems"] = [
    {
      system: "HEART BEAT",
      recommendation: heartbeatRecommendation,
      confidence: Math.max(0, Math.min(100, Math.round(brain.heartbeatSummary.confidenceScore))),
      disagreeing: false,
    },
    {
      system: "Learning DNA",
      recommendation: learningDnaRecommendation,
      confidence: skillConfidence,
      disagreeing: stanceForRecommendation(learningDnaRecommendation) !== heartbeatStance,
    },
    {
      system: "Assignment Engine",
      recommendation: assignmentRecommendation,
      confidence: assignmentSignal ? confidenceFromSignalStatus(assignmentSignal.status) : null,
      disagreeing: stanceForRecommendation(assignmentRecommendation) !== heartbeatStance,
    },
    {
      system: "Recommendation Engine",
      recommendation: recommendationFromIntent(sync.canonicalDecision.intent),
      confidence: sync.status === "synced" ? 84 : sync.status === "warning" ? 74 : 62,
      disagreeing: stanceForRecommendation(recommendationFromIntent(sync.canonicalDecision.intent)) !== heartbeatStance,
    },
    {
      system: "QLF Baseline",
      recommendation: qlfRecommendation,
      confidence: qlfConfidence,
      disagreeing: stanceForRecommendation(qlfRecommendation) !== heartbeatStance,
    },
  ];

  const conflictDetected = systems.some((row) => row.disagreeing);
  const topWeakArea = weakAreas[0] ?? "Foundational skills";
  const activeCatchUpTasks = brain.academicIntelligence.catchUpTasks.filter((task) => task.status !== "completed" && task.status !== "waived" && task.status !== "skipped");
  const schoolYear = student.yearGroup;
  const workingYear = brain.quickLevelFinderBaseline?.yearGroup ?? null;
  const schoolYearOrdinal = yearGroupToOrdinal(schoolYear);
  const workingYearOrdinal = yearGroupToOrdinal(workingYear);
  const learningGapYears = schoolYearOrdinal !== null && workingYearOrdinal !== null
    ? Math.max(0, schoolYearOrdinal - workingYearOrdinal)
    : null;
  const currentWorkingLevel = workingYear ? `${workingYear} ${topWeakArea}` : topWeakArea;
  const learningGapLabel = learningGapYears === null
    ? "Gap not calculated"
    : learningGapYears === 0
      ? "No academic year gap detected"
      : `${learningGapYears} academic year${learningGapYears === 1 ? "" : "s"}`;
  const learningGapReason = learningGapYears === null
    ? "Brain does not yet have enough year-level evidence to compare school year and working level."
    : learningGapYears > 0 && schoolYear
      ? `Student is currently performing below expected ${schoolYear} level.`
      : "Current working level is aligned with the student's school year.";
  const assignmentEngineConfidence = assignmentSignal ? confidenceFromSignalStatus(assignmentSignal.status) : null;
  const assignmentEngineReason = activeCatchUpTasks.length > 0
    ? "Outstanding catch-up pathway still active."
    : assignmentSignal?.summary ?? sync.action;

  return {
    conflictSummary: {
      conflictType: conflictDetected ? "Progression Conflict" : "Aligned Recommendation",
      severity: brain.heartbeatSummary.riskLevel,
      detectedAt: brain.generatedAt,
      studentName: student.name,
      currentYearGroup: student.yearGroup,
      currentLearningLevel: currentWorkingLevel,
      schoolYear,
      currentWorkingLevel,
      learningGapYears,
      learningGapLabel,
      learningGapReason,
      heartbeatRecommendation: heartbeatRecommendation,
      assignmentEngineRecommendation: assignmentRecommendation,
      assignmentEngineConfidence,
      assignmentEngineReason,
      status: conflictDetected ? "conflict_detected" : "aligned",
    },
    systems,
    reasoning: {
      weakAreas,
      recentScores,
      trend,
      reason: brain.heartbeatSummary.reasons[0] ?? brain.heartbeatSummary.suggestedNextStep,
    },
    evidence: {
      attemptsAnalysed: brain.source.attempts.length,
      assignmentsCompleted: brain.evidenceSummary.assignments.completed,
      catchUpTasksOutstanding: activeCatchUpTasks.length,
      weakAreas: brain.evidenceSummary.weakAreas.active,
      learningDnaUpdatedAt: brain.learningDnaSummary ? brain.generatedAt : null,
      snapshotUpdatedAt: snapshot.lastCalculatedAt,
    },
    recommendedActions: [
      activeCatchUpTasks[0]?.title ? `Complete Catch-Up Task: ${activeCatchUpTasks[0].title}` : "Complete highest-priority catch-up task",
      "Re-run mastery assessment",
      "Refresh snapshot",
      "Recalculate progression recommendation",
    ],
  };
}

type DetailDeps = {
  requireAdmin: typeof requireAdmin;
  findStudent: (studentId: string) => Promise<BrainCentreDetailStudent | null>;
  getStudentLearningBrain: (studentId: string) => Promise<StudentLearningBrain | null>;
  findLatestWarningReview: (studentId: string) => Promise<{
    actorUserId: string | null;
    createdAt: Date;
    metadataJson: string | null;
  } | null>;
};

function latestIso(values: Array<string | null | undefined>): string | null {
  const valid = values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime());
  return valid[0] ?? null;
}

function scoreFromIssues(status: "healthy" | "warning" | "critical", issues: BrainDiagnosticIssue[]): number {
  const penalty = issues.reduce((sum, issue) => sum + (issue.severity === "critical" ? 30 : 12), 0);
  const base = status === "critical" ? 55 : status === "warning" ? 78 : 100;
  return Math.max(0, Math.min(100, base - penalty));
}

function diagnosticsForBrain(input: {
  brain: StudentLearningBrain;
  snapshot: ReturnType<typeof snapshotStatus>;
}): BrainDiagnosticIssue[] {
  const issues: BrainDiagnosticIssue[] = [];
  if (!input.brain.learningDnaSummary) {
    issues.push({ code: "missing_learning_dna", severity: "warning", label: "Missing Learning DNA", detail: "Learning DNA summary is not present in the Brain view." });
  }
  if (input.snapshot.status === "missing") {
    issues.push({ code: "missing_snapshot", severity: "warning", label: "Missing Snapshot", detail: "Academic Intelligence snapshot is missing." });
  }
  if (input.snapshot.status === "stale") {
    issues.push({ code: "stale_snapshot", severity: "warning", label: "Stale Snapshot", detail: "Academic Intelligence snapshot is older than the freshness window." });
  }
  if (input.brain.dataState.state === "qlf_completed_no_activity") {
    issues.push({ code: "qlf_complete_activity_pending", severity: "warning", label: "QLF Complete, Activity Pending", detail: input.brain.dataState.detail });
  }
  if (input.brain.evidenceSummary.weakAreas.active > 0 && input.brain.academicIntelligence.catchUpRecommendations.length === 0) {
    issues.push({ code: "missing_weak_area_links", severity: "critical", label: "Missing WeakArea Links", detail: "Active weak areas exist without catch-up recommendation links." });
  }
  if (input.brain.source.attempts.length > 0 && input.brain.source.studentSkills.length === 0) {
    issues.push({ code: "missing_student_skill_links", severity: "warning", label: "Missing StudentSkill Links", detail: "Attempts exist but no StudentSkill records are available to the Brain." });
  }
  if (input.brain.academicIntelligence.recommendationSync.mismatches.length > 0) {
    issues.push({ code: "recommendation_conflicts", severity: "warning", label: "Recommendation Conflicts", detail: `${input.brain.academicIntelligence.recommendationSync.mismatches.length} recommendation mismatch(es) detected.` });
  }
  if (input.brain.heartbeatSummary.riskLevel === "critical" || input.brain.heartbeatSummary.riskLevel === "high") {
    issues.push({ code: "heartbeat_conflicts", severity: input.brain.heartbeatSummary.riskLevel === "critical" ? "critical" : "warning", label: "HEART BEAT Conflicts", detail: input.brain.heartbeatSummary.suggestedNextStep });
  }
  return issues;
}

function buildEvidenceChain(brain: StudentLearningBrain, snapshot: ReturnType<typeof snapshotStatus>): BrainCentreDetailPayload["evidenceChain"] {
  return [
    {
      stage: "Attempt",
      status: brain.source.attempts.length ? "present" : "missing",
      timestamp: latestIso(brain.source.attempts.map((attempt) => attempt.createdAt)),
      summary: `${brain.source.attempts.length} attempt(s), accuracy ${brain.evidenceSummary.attempts.accuracy ?? "-"}%.`,
    },
    {
      stage: "WeakArea",
      status: brain.evidenceSummary.weakAreas.active ? "warning" : brain.source.weakAreas.length ? "present" : "missing",
      timestamp: latestIso(brain.source.weakAreas.map((area) => area.lastDetectedAt)),
      summary: `${brain.evidenceSummary.weakAreas.active} active weak area(s).`,
    },
    {
      stage: "StudentSkill",
      status: brain.source.studentSkills.length ? "present" : "missing",
      timestamp: latestIso(brain.source.studentSkills.map((skill) => skill.updatedAt)),
      summary: `${brain.evidenceSummary.skills.total} skill record(s), ${brain.evidenceSummary.skills.weak} weak.`,
    },
    {
      stage: "LearningDNA",
      status: brain.learningDnaSummary ? "present" : "missing",
      timestamp: null,
      summary: brain.learningDnaSummary ? "Learning DNA summary available." : "Learning DNA summary missing.",
    },
    {
      stage: "Snapshot",
      status: snapshot.status === "fresh" ? "present" : "warning",
      timestamp: snapshot.lastCalculatedAt,
      summary: `Snapshot status: ${snapshot.status}.`,
    },
    {
      stage: "HEART BEAT",
      status: brain.heartbeatSummary.riskLevel === "low" ? "present" : "warning",
      timestamp: brain.generatedAt,
      summary: `${brain.heartbeatSummary.primaryAction} (${brain.heartbeatSummary.riskLevel}/${brain.heartbeatSummary.urgency}).`,
    },
    {
      stage: "Coach/Tutor",
      status: brain.academicIntelligence.coachTutorAudit.status === "mismatch" ? "warning" : "present",
      timestamp: brain.coachHeartbeatSignals?.latestSignalAt ?? latestIso(brain.source.coachUsage.map((usage) => usage.createdAt)),
      summary: brain.academicIntelligence.coachTutorAudit.reason,
    },
    {
      stage: "Recommendation",
      status: brain.academicIntelligence.recommendationSync.status === "synced" ? "present" : "warning",
      timestamp: brain.academicIntelligence.recommendationSync.generatedAt,
      summary: brain.academicIntelligence.recommendationSync.action,
    },
  ];
}

function buildControlRoom(brain: StudentLearningBrain): BrainCentreDetailPayload["recommendationControlRoom"] {
  return brain.academicIntelligence.recommendationSync.signals.map((signal) => ({
    engine: signal.label,
    currentRecommendation: `${signal.intent}: ${signal.target.label}`,
    recommendationSource: signal.engine,
    syncStatus: signal.status,
    conflict: signal.status === "mismatch",
  }));
}

function pushEvent(events: BrainTimelineEvent[], at: string | null | undefined, type: string, label: string, detail: string) {
  if (!at) return;
  events.push({ at, type, label, detail });
}

function buildTimeline(
  brain: StudentLearningBrain,
  snapshot: ReturnType<typeof snapshotStatus>,
  warningReview: BrainWarningReviewState,
): BrainTimelineEvent[] {
  const events: BrainTimelineEvent[] = [];
  pushEvent(events, brain.quickLevelFinderBaseline?.completedAt, "qlf_completed", "QLF Completed", "Quick Level Finder baseline completed.");
  for (const weak of brain.source.weakAreas.slice(0, 20)) {
    pushEvent(events, weak.lastDetectedAt, "weak_area_created", "Weak Area Created", `${weak.subject}: ${weak.topic ?? weak.skill ?? "General"} (${weak.status})`);
  }
  for (const skill of brain.source.studentSkills.slice(0, 20)) {
    pushEvent(events, skill.updatedAt, "student_skill_updated", "Student Skill Updated", `${skill.skill}: ${skill.status}, ${skill.accuracy}%`);
  }
  if (brain.learningDnaSummary) pushEvent(events, brain.generatedAt, "learning_dna_updated", "Learning DNA Updated", "Learning DNA summary available.");
  pushEvent(events, snapshot.lastCalculatedAt, "snapshot_refreshed", "Snapshot Refreshed", `Snapshot is ${snapshot.status}.`);
  if (brain.heartbeatSummary.primaryAction !== "advance_student" && brain.heartbeatSummary.primaryAction !== "maintain_level") {
    pushEvent(events, brain.generatedAt, "heartbeat_warning", "HEART BEAT Warning", brain.heartbeatSummary.suggestedNextStep);
  }
  if (brain.academicIntelligence.recommendationSync.status !== "synced") {
    pushEvent(events, brain.academicIntelligence.recommendationSync.generatedAt, "recommendation_sync_warning", "Recommendation Sync Warning", brain.academicIntelligence.recommendationSync.action);
  }
  if (warningReview.status === "reviewed" || warningReview.status === "changed_since_review") {
    const changedDetail = warningReview.signalChanged
      ? ` Signal changed since review. Reviewed fingerprint: ${warningReview.reviewedFingerprint ?? "unknown"}. Current fingerprint: ${warningReview.fingerprint}.`
      : ` Signal unchanged since review. Reviewed fingerprint: ${warningReview.reviewedFingerprint ?? warningReview.fingerprint}. Current fingerprint: ${warningReview.fingerprint}.`;
    pushEvent(
      events,
      warningReview.reviewedAt,
      "brain_warning_reviewed",
      warningReview.signalChanged ? "Brain Warning Changed Since Review" : "Brain Warning Reviewed",
      `${warningReview.note ? `Reviewed by admin. Note: ${warningReview.note}.` : "Reviewed by admin."}${changedDetail}`,
    );
  }
  for (const task of brain.academicIntelligence.catchUpTasks.slice(0, 10)) {
    pushEvent(events, task.createdAt, "catch_up_generated", "Catch-Up Generated", `${task.title} (${task.status})`);
  }
  for (const task of brain.academicIntelligence.homeworkTasks.slice(0, 10)) {
    pushEvent(events, task.createdAt, "homework_generated", "Homework Generated", `${task.title} (${task.status})`);
  }
  pushEvent(events, brain.generatedAt, "certificate_eligibility_change", "Certificate Eligibility Change", `Certificate evidence count: ${brain.evidenceSummary.certificates.issuedCount}.`);
  return events.sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime());
}

function buildDetailPayload(
  student: BrainCentreDetailStudent,
  brain: StudentLearningBrain,
  warningReview: BrainWarningReviewState,
): BrainCentreDetailPayload {
  const snapshot = snapshotStatus(student.studentProfile?.aiLearningProfileJson ?? null);
  const status = healthForBrain({ brain, snapshotStatus: snapshot.status });
  const issues = diagnosticsForBrain({ brain, snapshot });
  const score = scoreFromIssues(status, issues);
  return {
    student: { id: student.id, name: student.name, yearGroup: student.yearGroup },
    brainHealth: {
      status,
      score,
      snapshotStatus: snapshot.status,
      snapshotLastCalculatedAt: snapshot.lastCalculatedAt,
      generatedAt: brain.generatedAt,
    },
    heartbeat: brain.heartbeatSummary,
    coachTutorAudit: brain.academicIntelligence.coachTutorAudit,
    recommendationSync: brain.academicIntelligence.recommendationSync,
    learningDnaSummary: brain.learningDnaSummary,
    weakAreas: brain.source.weakAreas,
    studentSkills: brain.source.studentSkills,
    qlfBaseline: brain.quickLevelFinderBaseline,
    academicSummary: {
      mastery: brain.academicIntelligence.summary,
      masteryExpansion: brain.academicIntelligence.masteryExpansion,
      nextRecommendedActions: brain.academicIntelligence.nextRecommendedActions,
      assessmentReadiness: brain.academicIntelligence.assessmentReadiness,
      examReadiness: brain.academicIntelligence.examReadinessProfile,
    },
    evidenceChain: buildEvidenceChain(brain, snapshot),
    diagnostics: { status, score, issues },
    recommendationControlRoom: buildControlRoom(brain),
    timeline: buildTimeline(brain, snapshot, warningReview),
    warningReview,
    heartbeatInvestigation: buildHeartbeatInvestigation(student, brain, snapshot),
  };
}

export async function handleAdminBrainCentreStudentGet(
  request: Request,
  context: Params,
  deps: DetailDeps = {
    requireAdmin,
    findStudent: (studentId) => prisma.childProfile.findFirst({
      where: { id: studentId, archived: false },
      select: {
        id: true,
        name: true,
        yearGroup: true,
        updatedAt: true,
        studentProfile: { select: { aiLearningProfileJson: true } },
      },
    }),
    getStudentLearningBrain: (studentId) => getStudentLearningBrain(studentId, { includeCoachSignals: true }),
    findLatestWarningReview: (studentId) => prisma.auditLog.findFirst({
      where: {
        action: BRAIN_WARNING_REVIEW_ACTION,
        entityType: BRAIN_WARNING_REVIEW_ENTITY_TYPE,
        entityId: studentId,
      },
      orderBy: { createdAt: "desc" },
      select: {
        actorUserId: true,
        createdAt: true,
        metadataJson: true,
      },
    }),
  },
) {
  void request;
  const { session, response } = await deps.requireAdmin();
  if (!session) return response;
  const { studentId } = await context.params;
  const student = await deps.findStudent(studentId);
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });
  const brain = await deps.getStudentLearningBrain(student.id);
  if (!brain) return NextResponse.json({ error: "Brain not available." }, { status: 404 });
  const snapshot = snapshotStatus(student.studentProfile?.aiLearningProfileJson ?? null);
  const fingerprint = buildBrainWarningFingerprint({
    studentId: student.id,
    heartbeat: brain.heartbeatSummary,
    recommendationSync: brain.academicIntelligence.recommendationSync,
    dataState: brain.dataState,
    snapshotStatus: snapshot.status,
  });
  const review = await deps.findLatestWarningReview(student.id);
  const warningReview = parseBrainWarningReviewState({ fingerprint, review });
  return NextResponse.json(buildDetailPayload(student, brain, warningReview));
}

export async function GET(request: Request, context: Params) {
  return handleAdminBrainCentreStudentGet(request, context);
}
