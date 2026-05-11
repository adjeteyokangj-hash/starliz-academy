import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { productionChecklist } from "@/lib/production-checklist";

export async function GET() {
  const { session, response } = await requireAdminPermission("settings:view");
  if (!session) return response;

  const [failedJobs, recentAuditLogs, apiKeys] = await Promise.all([
    prisma.jobRunLog.count({ where: { status: "failed" } }),
    prisma.auditLog.count(),
    prisma.apiKeyConfig.findMany({ select: { provider: true, status: true, lastTestedAt: true } }),
  ]);

  return NextResponse.json({
    status: failedJobs > 0 ? "attention" : "ok",
    failedJobs,
    recentAuditLogs,
    apiKeys: apiKeys.map((key) => ({
      provider: key.provider,
      status: key.status,
      lastTestedAt: key.lastTestedAt?.toISOString() ?? null,
    })),
    backups: {
      configured: Boolean(process.env.BACKUP_PROVIDER || process.env.DATABASE_BACKUP_URL),
      message: process.env.BACKUP_PROVIDER || process.env.DATABASE_BACKUP_URL ? "Backup environment is configured." : "Set BACKUP_PROVIDER or DATABASE_BACKUP_URL before production.",
    },
    monitoring: {
      configured: Boolean(process.env.SENTRY_DSN || process.env.MONITORING_DSN),
      message: process.env.SENTRY_DSN || process.env.MONITORING_DSN ? "Monitoring environment is configured." : "Set SENTRY_DSN or MONITORING_DSN before production.",
    },
    checklist: productionChecklist,
  });
}
