import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { buildProductionReadinessHealth, getProductionChecklistSnapshot, type ProductionReadinessCounts } from "@/lib/release/production-readiness-health";

type Deps = {
  requireAdminPermission: typeof requireAdminPermission;
  collectCounts: () => Promise<ProductionReadinessCounts>;
  env: Record<string, string | undefined>;
};

export type AdminReleaseReadinessHealthPayload = {
  status: "healthy" | "warning" | "informational";
  score: number;
  warnings: string[];
  summary: string;
  backupValidation: {
    configured: boolean;
    restoreValidationRequired: boolean;
    source: string;
  };
  monitoringValidation: {
    configured: boolean;
    source: string;
  };
  releaseReadiness: {
    blockingItems: number;
    totalItems: number;
  };
  envAudit: ReturnType<typeof buildProductionReadinessHealth>["envAudit"];
  checklist: ReturnType<typeof getProductionChecklistSnapshot>;
  generatedAt: string;
  boundary: "read_only_assessment";
};

async function defaultCollectCounts(): Promise<ProductionReadinessCounts> {
  const [failedJobs, failedNotificationDeliveries] = await Promise.all([
    prisma.jobRunLog.count({ where: { status: "failed" } }),
    prisma.notificationDelivery.count({ where: { status: "failed" } }),
  ]);

  let pendingWebhookEvents = 0;
  let staleWebhookEvents = 0;
  try {
    const pendingRows = await prisma.$queryRaw<Array<{ pending: number; stale: number }>>`
      SELECT
        COUNT(*) FILTER (WHERE status = 'processing')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '15 minutes')::int AS stale
      FROM payment_webhook_events
    `;
    pendingWebhookEvents = Number(pendingRows[0]?.pending ?? 0);
    staleWebhookEvents = Number(pendingRows[0]?.stale ?? 0);
  } catch {
    pendingWebhookEvents = 0;
    staleWebhookEvents = 0;
  }

  return {
    failedJobs,
    failedNotificationDeliveries,
    pendingWebhookEvents,
    staleWebhookEvents,
  };
}

export async function handleAdminReleaseReadinessHealthGet(
  request: Request,
  deps: Deps = {
    requireAdminPermission,
    collectCounts: defaultCollectCounts,
    env: process.env,
  },
) {
  void request;
  const { session, response } = await deps.requireAdminPermission("settings:view");
  if (!session) return response;

  const counts = await deps.collectCounts();
  const health = buildProductionReadinessHealth({ env: deps.env, counts });

  const payload: AdminReleaseReadinessHealthPayload = {
    ...health,
    checklist: getProductionChecklistSnapshot(),
  };

  return NextResponse.json(payload);
}

export async function GET(request: Request) {
  return handleAdminReleaseReadinessHealthGet(request);
}
