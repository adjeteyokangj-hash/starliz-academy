import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { buildIngestionHealthMetrics } from "@/lib/stomach/ingestionHealth";
import type { IngestionMonitoringCounts } from "@/lib/stomach/ingestionTypes";

type IngestionHealthDeps = {
  requireAdmin: typeof requireAdmin;
  collectCounts: () => Promise<IngestionMonitoringCounts>;
};

export type AdminIngestionHealthPayload = {
  status: "healthy" | "warning" | "informational";
  score: number;
  summary: string;
  recommendedNextAction: string;
  onboarding: {
    totalStudents: number;
    studentsWithProfiles: number;
    profileCoveragePercent: number;
  };
  ingestion: {
    studentsWithRecentAttempts: number;
    activeEvidenceCoveragePercent: number;
    activeWeakAreas: number;
    activeAssignments: number;
    queuedIngestionJobs: number;
    latestEvidenceAt: string | null;
  };
  warnings: string[];
  generatedAt: string;
  decisionBoundary: "digest_only";
};

async function defaultCollectCounts(): Promise<IngestionMonitoringCounts> {
  const sevenDaysAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));

  const [
    totalStudents,
    studentsWithProfiles,
    activeWeakAreas,
    activeAssignments,
    queuedIngestionJobs,
    attemptGroups,
    latestAttempt,
  ] = await Promise.all([
    prisma.childProfile.count({ where: { archived: false } }),
    prisma.studentProfile.count(),
    prisma.weakArea.count({ where: { status: "active" } }),
    prisma.assignment.count({ where: { status: { not: "completed" } } }),
    prisma.jobRunLog.count({
      where: {
        jobName: { contains: "ingestion", mode: "insensitive" },
        status: { in: ["queued", "running", "failed"] },
      },
    }),
    prisma.attempt.groupBy({
      by: ["studentId"],
      where: { createdAt: { gte: sevenDaysAgo } },
    }),
    prisma.attempt.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  return {
    totalStudents,
    studentsWithProfiles,
    studentsWithRecentAttempts: attemptGroups.length,
    activeWeakAreas,
    activeAssignments,
    queuedIngestionJobs,
    latestEvidenceAt: latestAttempt?.createdAt?.toISOString() ?? null,
  };
}

export async function handleAdminIngestionHealthGet(
  request: Request,
  deps: IngestionHealthDeps = {
    requireAdmin,
    collectCounts: defaultCollectCounts,
  },
) {
  void request;
  const { session, response } = await deps.requireAdmin();
  if (!session) return response;

  const counts = await deps.collectCounts();
  const health = buildIngestionHealthMetrics(counts);

  const payload: AdminIngestionHealthPayload = {
    status: health.status,
    score: health.score,
    summary: health.summary,
    recommendedNextAction: health.recommendedNextAction,
    onboarding: {
      totalStudents: counts.totalStudents,
      studentsWithProfiles: counts.studentsWithProfiles,
      profileCoveragePercent: health.profileCoveragePercent,
    },
    ingestion: {
      studentsWithRecentAttempts: counts.studentsWithRecentAttempts,
      activeEvidenceCoveragePercent: health.activeEvidenceCoveragePercent,
      activeWeakAreas: counts.activeWeakAreas,
      activeAssignments: counts.activeAssignments,
      queuedIngestionJobs: counts.queuedIngestionJobs,
      latestEvidenceAt: counts.latestEvidenceAt,
    },
    warnings: health.warnings,
    generatedAt: health.generatedAt,
    decisionBoundary: "digest_only",
  };

  return NextResponse.json(payload);
}

export async function GET(request: Request) {
  return handleAdminIngestionHealthGet(request);
}
