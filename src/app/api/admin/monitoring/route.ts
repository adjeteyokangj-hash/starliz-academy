import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { productionChecklist } from "@/lib/production-checklist";

const WEBHOOK_STALE_MINUTES = 15;
const WEBHOOK_DUPLICATE_WINDOW_HOURS = 24;

function getStripeTimestampToleranceSeconds(): number {
  const raw = Number.parseInt(process.env.STRIPE_WEBHOOK_TOLERANCE_SECONDS ?? "", 10);
  if (!Number.isFinite(raw) || raw < 0) {
    return 300;
  }
  return raw;
}

async function getStripeWebhookMonitoring() {
  const duplicateSince = new Date(Date.now() - WEBHOOK_DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000);
  const timestampToleranceSeconds = getStripeTimestampToleranceSeconds();

  try {
    const existsRows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT to_regclass('public.payment_webhook_events') IS NOT NULL AS "exists"
    `;
    const tableExists = Boolean(existsRows[0]?.exists);

    if (!tableExists) {
      const duplicateEventsLast24h = await prisma.auditLog.count({
        where: {
          action: "payment.webhook.duplicate",
          createdAt: { gte: duplicateSince },
        },
      });

      return {
        tableExists: false,
        totalTrackedEvents: 0,
        processedEvents: 0,
        processingEvents: 0,
        staleProcessingEvents: 0,
        oldestProcessingAgeMinutes: null,
        duplicateEventsLast24h,
        timestampToleranceSeconds,
        staleThresholdMinutes: WEBHOOK_STALE_MINUTES,
        duplicateWindowHours: WEBHOOK_DUPLICATE_WINDOW_HOURS,
      };
    }

    const summaryRows = await prisma.$queryRaw<Array<{
      totalTrackedEvents: number;
      processedEvents: number;
      processingEvents: number;
      staleProcessingEvents: number;
      oldestProcessingAgeMinutes: number | null;
    }>>`
      SELECT
        COUNT(*)::int AS "totalTrackedEvents",
        COUNT(*) FILTER (WHERE status = 'processed')::int AS "processedEvents",
        COUNT(*) FILTER (WHERE status = 'processing')::int AS "processingEvents",
        COUNT(*) FILTER (WHERE status = 'processing' AND updated_at < NOW() - (${WEBHOOK_STALE_MINUTES} * INTERVAL '1 minute'))::int AS "staleProcessingEvents",
        MAX(CASE
          WHEN status = 'processing' THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60)
          ELSE NULL
        END)::int AS "oldestProcessingAgeMinutes"
      FROM payment_webhook_events
    `;

    const duplicateEventsLast24h = await prisma.auditLog.count({
      where: {
        action: "payment.webhook.duplicate",
        createdAt: { gte: duplicateSince },
      },
    });

    const summary = summaryRows[0] ?? {
      totalTrackedEvents: 0,
      processedEvents: 0,
      processingEvents: 0,
      staleProcessingEvents: 0,
      oldestProcessingAgeMinutes: null,
    };

    return {
      tableExists: true,
      totalTrackedEvents: Number(summary.totalTrackedEvents ?? 0),
      processedEvents: Number(summary.processedEvents ?? 0),
      processingEvents: Number(summary.processingEvents ?? 0),
      staleProcessingEvents: Number(summary.staleProcessingEvents ?? 0),
      oldestProcessingAgeMinutes:
        summary.oldestProcessingAgeMinutes === null
          ? null
          : Number(summary.oldestProcessingAgeMinutes),
      duplicateEventsLast24h,
      timestampToleranceSeconds,
      staleThresholdMinutes: WEBHOOK_STALE_MINUTES,
      duplicateWindowHours: WEBHOOK_DUPLICATE_WINDOW_HOURS,
    };
  } catch {
    return {
      tableExists: false,
      unavailable: true,
      totalTrackedEvents: 0,
      processedEvents: 0,
      processingEvents: 0,
      staleProcessingEvents: 0,
      oldestProcessingAgeMinutes: null,
      duplicateEventsLast24h: 0,
      timestampToleranceSeconds,
      staleThresholdMinutes: WEBHOOK_STALE_MINUTES,
      duplicateWindowHours: WEBHOOK_DUPLICATE_WINDOW_HOURS,
    };
  }
}

export async function GET() {
  const { session, response } = await requireAdminPermission("settings:view");
  if (!session) return response;

  const [failedJobs, recentAuditLogs, apiKeys, stripeWebhooks] = await Promise.all([
    prisma.jobRunLog.count({ where: { status: "failed" } }),
    prisma.auditLog.count(),
    prisma.apiKeyConfig.findMany({ select: { provider: true, status: true, lastTestedAt: true } }),
    getStripeWebhookMonitoring(),
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
    webhooks: {
      stripe: stripeWebhooks,
    },
    checklist: productionChecklist,
  });
}
