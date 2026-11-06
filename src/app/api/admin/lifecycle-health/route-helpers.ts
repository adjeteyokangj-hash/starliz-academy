import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { buildLifecycleHealthMetrics, buildRetentionSummary } from "@/lib/anus/lifecycleHealth";
import type { LifecycleMonitoringCounts } from "@/lib/anus/lifecycleHealth";

type LifecycleHealthDeps = {
  requireAdmin: typeof requireAdmin;
  collectCounts: () => Promise<LifecycleMonitoringCounts>;
};

export type AdminLifecycleHealthPayload = {
  status: "healthy" | "warning" | "informational";
  score: number;
  summary: string;
  recommendedNextAction: string;
  retentionCoveragePercent: number;
  warnings: string[];
  counts: {
    totalStudents: number;
    archivedStudents: number;
    softDeletedStudents: number;
    recordsUnderLegalHold: number;
    recordsPendingReview: number;
    overdueRetentionRecords: number;
    recoveryAuditEntriesLast30Days: number;
  };
  retentionSummary: ReturnType<typeof buildRetentionSummary>;
  generatedAt: string;
  boundaryEnforced: "read_only_determination";
};

async function defaultCollectCounts(): Promise<LifecycleMonitoringCounts> {
  const thirtyDaysAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));

  const [
    totalStudents,
    archivedStudents,
    softDeletedStudents,
    recoveryAuditEntriesLast30Days,
  ] = await Promise.all([
    prisma.childProfile.count({ where: { archived: false } }),
    prisma.childProfile.count({ where: { archived: true } }),
    // soft_deleted maps to archived=true with further filtering when the field exists
    Promise.resolve(0),
    prisma.auditLog.count({
      where: {
        action: {
          in: [
            "lifecycle.archive",
            "lifecycle.soft_delete",
            "lifecycle.restore",
            "lifecycle.legal_hold_applied",
            "lifecycle.legal_hold_released",
          ],
        },
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
  ]);

  return {
    totalStudents,
    archivedStudents,
    softDeletedStudents,
    recordsUnderLegalHold: 0,
    recordsPendingReview: 0,
    overdueRetentionRecords: 0,
    recoveryAuditEntriesLast30Days,
  };
}

export async function handleAdminLifecycleHealthGet(
  request: Request,
  deps: LifecycleHealthDeps = {
    requireAdmin,
    collectCounts: defaultCollectCounts,
  },
) {
  void request;
  const { session, response } = await deps.requireAdmin();
  if (!session) return response;

  const counts = await deps.collectCounts();
  const health = buildLifecycleHealthMetrics(counts);

  const payload: AdminLifecycleHealthPayload = {
    status: health.status,
    score: health.score,
    summary: health.summary,
    recommendedNextAction: health.recommendedNextAction,
    retentionCoveragePercent: health.retentionCoveragePercent,
    warnings: health.warnings,
    counts,
    retentionSummary: buildRetentionSummary(),
    generatedAt: health.generatedAt,
    boundaryEnforced: "read_only_determination",
  };

  return NextResponse.json(payload);
}

export async function GET(request: Request) {
  return handleAdminLifecycleHealthGet(request);
}
