import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { getStudentLearningBrain } from "@/lib/student-learning-brain";
import {
  isAcademicIntelligenceSnapshotStale,
  readAcademicIntelligenceSnapshot,
} from "@/lib/academic-intelligence/snapshot";
import type {
  HeartbeatDecision,
  RecommendationSyncAudit,
} from "@/lib/academic-intelligence/types";
import type { StudentDataNormalisationResult } from "@/lib/student-learning-brain/studentDataNormalisation";

type BrainCentreHealthStatus = "healthy" | "warning" | "critical";

type BrainCentreStudent = {
  id: string;
  name: string;
  yearGroup: string | null;
  updatedAt: Date;
  studentProfile: {
    aiLearningProfileJson: string | null;
  } | null;
};

type BrainCentreBrain = {
  studentId: string;
  heartbeatSummary: HeartbeatDecision;
  academicIntelligence: {
    generatedAt: string;
    recommendationSync: RecommendationSyncAudit;
  };
  quickLevelFinderBaseline: unknown | null;
  evidenceSummary: {
    assignments: { total: number; active: number; completed: number };
    progress: { total: number; completed: number; averageScore: number | null };
    attempts: { total: number; correct: number; accuracy: number | null };
    weakAreas: { total: number; active: number; top: string[] };
    skills: { total: number; mastered: number; weak: number; averageAccuracy: number | null };
    homework: { total: number; active: number; completed: number; overdue: number };
  };
  dataState: StudentDataNormalisationResult;
  generatedAt: string;
};

export type BrainCentreWarningRow = {
  studentId: string;
  studentName: string;
  yearGroup: string | null;
  status: BrainCentreHealthStatus;
  warningStatus: string;
  reasonSignals: string[];
  recommendedAction: string;
  generatedAt: string;
};

export type BrainCentreMismatchRow = {
  studentId: string;
  studentName: string;
  yearGroup: string | null;
  canonicalRecommendation: string;
  mismatchingEngine: string;
  mismatchDetail: string;
  lockAction: string;
};

export type BrainCentreQlfIssueRow = {
  studentId: string;
  studentName: string;
  yearGroup: string | null;
  issueType: "qlf_complete_activity_pending" | "missing_baseline" | "stale_snapshot" | "brain_review";
  status: "warning" | "critical";
  detail: string;
  snapshotLastCalculatedAt: string | null;
};

export type BrainCentreStudentSummary = {
  studentId: string;
  studentName: string;
  yearGroup: string | null;
  status: BrainCentreHealthStatus;
  heartbeatAction: string;
  recommendationSyncStatus: RecommendationSyncAudit["status"];
  dataState: StudentDataNormalisationResult["state"];
  qlfComplete: boolean;
  snapshotStatus: "fresh" | "stale" | "missing";
};

export type BrainCentrePayload = {
  summary: {
    totalStudentsChecked: number;
    healthyCount: number;
    warningCount: number;
    criticalCount: number;
    staleOrMissingDataCount: number;
  };
  students: BrainCentreStudentSummary[];
  heartbeatWarnings: BrainCentreWarningRow[];
  recommendationMismatches: BrainCentreMismatchRow[];
  qlfIssues: BrainCentreQlfIssueRow[];
  generatedAt: string;
};

type BrainCentreDeps = {
  requireAdmin: typeof requireAdmin;
  findStudents: (limit: number) => Promise<BrainCentreStudent[]>;
  getStudentLearningBrain: (studentId: string) => Promise<BrainCentreBrain | null>;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function clampLimit(raw: string | null): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsed)));
}

function describeTarget(label: string): string {
  return label.trim() || "current recommendation";
}

function canonicalLabel(sync: RecommendationSyncAudit): string {
  const target = describeTarget(sync.canonicalDecision.target.label);
  return `${sync.canonicalDecision.intent}: ${target}`;
}

function snapshotStatus(profileJson: string | null | undefined): {
  status: "fresh" | "stale" | "missing";
  lastCalculatedAt: string | null;
} {
  const snapshot = readAcademicIntelligenceSnapshot(profileJson ?? null);
  if (!snapshot) return { status: "missing", lastCalculatedAt: null };
  if (isAcademicIntelligenceSnapshotStale(snapshot)) {
    return { status: "stale", lastCalculatedAt: snapshot.lastCalculatedAt };
  }
  return { status: "fresh", lastCalculatedAt: snapshot.lastCalculatedAt };
}

function heartbeatNeedsAdminVisibility(heartbeat: HeartbeatDecision): boolean {
  if (heartbeat.riskLevel === "critical" || heartbeat.riskLevel === "high") return true;
  if (heartbeat.urgency === "critical" || heartbeat.urgency === "high") return true;
  return heartbeat.primaryAction !== "advance_student" && heartbeat.primaryAction !== "maintain_level";
}

function healthForStudent(input: {
  heartbeat: HeartbeatDecision;
  sync: RecommendationSyncAudit;
  dataState: StudentDataNormalisationResult;
  snapshot: "fresh" | "stale" | "missing";
}): BrainCentreHealthStatus {
  if (input.heartbeat.riskLevel === "critical" || input.sync.status === "blocked" || input.dataState.checklistStatus === "fail") {
    return "critical";
  }
  if (
    input.heartbeat.riskLevel === "high"
    || input.heartbeat.urgency === "critical"
    || input.heartbeat.urgency === "high"
    || input.sync.status === "warning"
    || input.dataState.checklistStatus === "warning"
    || input.snapshot !== "fresh"
  ) {
    return "warning";
  }
  return "healthy";
}

function qlfIssuesForStudent(input: {
  student: BrainCentreStudent;
  brain: BrainCentreBrain;
  snapshot: ReturnType<typeof snapshotStatus>;
}): BrainCentreQlfIssueRow[] {
  const rows: BrainCentreQlfIssueRow[] = [];
  if (input.brain.dataState.state === "qlf_completed_no_activity") {
    rows.push({
      studentId: input.student.id,
      studentName: input.student.name,
      yearGroup: input.student.yearGroup,
      issueType: "qlf_complete_activity_pending",
      status: "warning",
      detail: input.brain.dataState.detail,
      snapshotLastCalculatedAt: input.snapshot.lastCalculatedAt,
    });
  }
  if (!input.brain.quickLevelFinderBaseline) {
    rows.push({
      studentId: input.student.id,
      studentName: input.student.name,
      yearGroup: input.student.yearGroup,
      issueType: "missing_baseline",
      status: input.brain.dataState.checklistStatus === "fail" ? "critical" : "warning",
      detail: "Quick Level Finder baseline is missing from the Brain read model.",
      snapshotLastCalculatedAt: input.snapshot.lastCalculatedAt,
    });
  }
  if (input.snapshot.status !== "fresh") {
    rows.push({
      studentId: input.student.id,
      studentName: input.student.name,
      yearGroup: input.student.yearGroup,
      issueType: "stale_snapshot",
      status: "warning",
      detail: input.snapshot.status === "missing" ? "Academic Intelligence snapshot is missing." : "Academic Intelligence snapshot is stale.",
      snapshotLastCalculatedAt: input.snapshot.lastCalculatedAt,
    });
  }
  if (input.brain.dataState.reviewRecommended && input.brain.dataState.state !== "qlf_completed_no_activity") {
    rows.push({
      studentId: input.student.id,
      studentName: input.student.name,
      yearGroup: input.student.yearGroup,
      issueType: "brain_review",
      status: "warning",
      detail: input.brain.dataState.detail,
      snapshotLastCalculatedAt: input.snapshot.lastCalculatedAt,
    });
  }
  return rows;
}

function buildBrainCentrePayload(rows: Array<{ student: BrainCentreStudent; brain: BrainCentreBrain }>): BrainCentrePayload {
  const heartbeatWarnings: BrainCentreWarningRow[] = [];
  const recommendationMismatches: BrainCentreMismatchRow[] = [];
  const qlfIssues: BrainCentreQlfIssueRow[] = [];
  const students: BrainCentreStudentSummary[] = [];

  for (const row of rows) {
    const snapshot = snapshotStatus(row.student.studentProfile?.aiLearningProfileJson ?? null);
    const heartbeat = row.brain.heartbeatSummary;
    const sync = row.brain.academicIntelligence.recommendationSync;
    const status = healthForStudent({
      heartbeat,
      sync,
      dataState: row.brain.dataState,
      snapshot: snapshot.status,
    });

    students.push({
      studentId: row.student.id,
      studentName: row.student.name,
      yearGroup: row.student.yearGroup,
      status,
      heartbeatAction: heartbeat.primaryAction,
      recommendationSyncStatus: sync.status,
      dataState: row.brain.dataState.state,
      qlfComplete: Boolean(row.brain.quickLevelFinderBaseline),
      snapshotStatus: snapshot.status,
    });

    if (heartbeatNeedsAdminVisibility(heartbeat)) {
      heartbeatWarnings.push({
        studentId: row.student.id,
        studentName: row.student.name,
        yearGroup: row.student.yearGroup,
        status,
        warningStatus: `${heartbeat.riskLevel}/${heartbeat.urgency}`,
        reasonSignals: [...heartbeat.reasons, ...heartbeat.blockers, ...heartbeat.evidence].slice(0, 6),
        recommendedAction: heartbeat.suggestedNextStep,
        generatedAt: row.brain.generatedAt,
      });
    }

    for (const mismatch of sync.mismatches) {
      recommendationMismatches.push({
        studentId: row.student.id,
        studentName: row.student.name,
        yearGroup: row.student.yearGroup,
        canonicalRecommendation: canonicalLabel(sync),
        mismatchingEngine: mismatch.label,
        mismatchDetail: `${mismatch.actual} (expected ${mismatch.expected}). ${mismatch.reason}`,
        lockAction: sync.action,
      });
    }

    qlfIssues.push(...qlfIssuesForStudent({ student: row.student, brain: row.brain, snapshot }));
  }

  const healthyCount = students.filter((student) => student.status === "healthy").length;
  const warningCount = students.filter((student) => student.status === "warning").length;
  const criticalCount = students.filter((student) => student.status === "critical").length;
  const staleOrMissingDataCount = students.filter((student) => student.snapshotStatus !== "fresh" || student.dataState !== "active_with_qlf").length;

  return {
    summary: {
      totalStudentsChecked: students.length,
      healthyCount,
      warningCount,
      criticalCount,
      staleOrMissingDataCount,
    },
    students,
    heartbeatWarnings,
    recommendationMismatches,
    qlfIssues,
    generatedAt: new Date().toISOString(),
  };
}

export async function handleAdminBrainCentreGet(request: Request, deps: BrainCentreDeps = {
  requireAdmin,
  findStudents: (limit) => prisma.childProfile.findMany({
    where: { archived: false },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      name: true,
      yearGroup: true,
      updatedAt: true,
      studentProfile: {
        select: {
          aiLearningProfileJson: true,
        },
      },
    },
  }),
  getStudentLearningBrain: (studentId) => getStudentLearningBrain(studentId, { includeCoachSignals: true }),
}) {
  const { session, response } = await deps.requireAdmin();
  if (!session) return response;

  const params = new URL(request.url).searchParams;
  const limit = clampLimit(params.get("limit"));
  const students = await deps.findStudents(limit);
  const brainRows = await Promise.all(students.map(async (student) => ({
    student,
    brain: await deps.getStudentLearningBrain(student.id),
  })));

  const payload = buildBrainCentrePayload(
    brainRows.filter((row): row is { student: BrainCentreStudent; brain: BrainCentreBrain } => Boolean(row.brain)),
  );

  return NextResponse.json(payload);
}

export async function GET(request: Request) {
  return handleAdminBrainCentreGet(request);
}
