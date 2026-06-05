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
};

type DetailDeps = {
  requireAdmin: typeof requireAdmin;
  findStudent: (studentId: string) => Promise<BrainCentreDetailStudent | null>;
  getStudentLearningBrain: (studentId: string) => Promise<StudentLearningBrain | null>;
  findLatestWarningReview: (studentId: string, fingerprint: string) => Promise<{
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
  if (warningReview.status === "reviewed") {
    pushEvent(
      events,
      warningReview.reviewedAt,
      "brain_warning_reviewed",
      "Brain Warning Reviewed",
      warningReview.note ? `Reviewed by admin. Note: ${warningReview.note}` : "Reviewed by admin.",
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
    findLatestWarningReview: (studentId, fingerprint) => prisma.auditLog.findFirst({
      where: {
        action: BRAIN_WARNING_REVIEW_ACTION,
        entityType: BRAIN_WARNING_REVIEW_ENTITY_TYPE,
        entityId: studentId,
        metadataJson: { contains: fingerprint },
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
  const review = await deps.findLatestWarningReview(student.id, fingerprint);
  const warningReview = parseBrainWarningReviewState({ fingerprint, review });
  return NextResponse.json(buildDetailPayload(student, brain, warningReview));
}

export async function GET(request: Request, context: Params) {
  return handleAdminBrainCentreStudentGet(request, context);
}
