import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { getStudentLearningBrain } from "@/lib/student-learning-brain";
import {
  healthForBrain,
  heartbeatNeedsAdminVisibility,
  snapshotStatus,
  type BrainHealthStatus,
} from "@/app/api/admin/brain-centre/_lib";
import type {
  HeartbeatDecision,
  RecommendationSyncAudit,
} from "@/lib/academic-intelligence/types";
import type { StudentDataNormalisationResult } from "@/lib/student-learning-brain/studentDataNormalisation";

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
  learningDnaSummary?: Record<string, unknown> | null;
  dataState: StudentDataNormalisationResult;
  generatedAt: string;
};

export type BrainCentreWarningRow = {
  studentId: string;
  studentName: string;
  yearGroup: string | null;
  status: BrainHealthStatus;
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
  status: BrainHealthStatus;
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
  diagnostics: {
    healthScore: number;
    status: BrainHealthStatus;
    issues: Array<{
      code: string;
      label: string;
      count: number;
      affectedStudents: Array<{ studentId: string; studentName: string }>;
    }>;
  };
  generatedAt: string;
};

type BrainCentreDeps = {
  requireAdmin: typeof requireAdmin;
  findStudents: (limit: number) => Promise<BrainCentreStudent[]>;
  getStudentLearningBrain: (studentId: string) => Promise<BrainCentreBrain | null>;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function clampLimit(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw.trim() === "") return DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsed)));
}

function describeTarget(label: string): string {
  return label.trim() || "current recommendation";
}

function canonicalLabel(sync: RecommendationSyncAudit): string {
  const target = describeTarget(sync.canonicalDecision.target.label);
  return `${sync.canonicalDecision.intent}: ${target}`;
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
  const diagnostics = new Map<string, { label: string; affectedStudents: Array<{ studentId: string; studentName: string }> }>();

  const addDiagnostic = (code: string, label: string, student: BrainCentreStudent) => {
    const current = diagnostics.get(code) ?? { label, affectedStudents: [] };
    if (!current.affectedStudents.some((row) => row.studentId === student.id)) {
      current.affectedStudents.push({ studentId: student.id, studentName: student.name });
    }
    diagnostics.set(code, current);
  };

  for (const row of rows) {
    const snapshot = snapshotStatus(row.student.studentProfile?.aiLearningProfileJson ?? null);
    const heartbeat = row.brain.heartbeatSummary;
    const sync = row.brain.academicIntelligence.recommendationSync;
    const status = healthForBrain({
      brain: {
        heartbeatSummary: heartbeat,
        academicIntelligence: { recommendationSync: sync },
        dataState: row.brain.dataState,
      },
      snapshotStatus: snapshot.status,
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

    if (heartbeatNeedsAdminVisibility({ heartbeatSummary: heartbeat })) {
      addDiagnostic("heartbeat_conflicts", "HEART BEAT conflicts", row.student);
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
      addDiagnostic("recommendation_conflicts", "Recommendation conflicts", row.student);
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

    const studentQlfIssues = qlfIssuesForStudent({ student: row.student, brain: row.brain, snapshot });
    for (const issue of studentQlfIssues) addDiagnostic(issue.issueType, issue.issueType.replaceAll("_", " "), row.student);
    if (!row.brain.learningDnaSummary) addDiagnostic("missing_learning_dna", "Missing Learning DNA", row.student);
    if (row.brain.evidenceSummary.weakAreas.active > 0 && sync.canonicalDecision.intent !== "catch_up") addDiagnostic("missing_weak_area_links", "Missing WeakArea links", row.student);
    if (row.brain.evidenceSummary.attempts.total > 0 && row.brain.evidenceSummary.skills.total === 0) addDiagnostic("missing_student_skill_links", "Missing StudentSkill links", row.student);
    qlfIssues.push(...studentQlfIssues);
  }

  const healthyCount = students.filter((student) => student.status === "healthy").length;
  const warningCount = students.filter((student) => student.status === "warning").length;
  const criticalCount = students.filter((student) => student.status === "critical").length;
  const staleOrMissingDataCount = students.filter((student) => student.snapshotStatus !== "fresh" || student.dataState !== "active_with_qlf").length;
  const healthScore = students.length
    ? Math.max(0, Math.round(((healthyCount * 100) + (warningCount * 65) + (criticalCount * 25)) / students.length))
    : 100;
  const diagnosticsStatus: BrainHealthStatus = criticalCount > 0 ? "critical" : warningCount > 0 ? "warning" : "healthy";

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
    diagnostics: {
      healthScore,
      status: diagnosticsStatus,
      issues: Array.from(diagnostics.entries()).map(([code, issue]) => ({
        code,
        label: issue.label,
        count: issue.affectedStudents.length,
        affectedStudents: issue.affectedStudents,
      })),
    },
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
