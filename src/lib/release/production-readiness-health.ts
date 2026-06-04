import { auditLaunchEnvironment, type LaunchEnvAuditResult } from "@/lib/release/launch-env-audit";
import { getReleaseReadinessItems } from "@/lib/release/release-readiness";
import { productionChecklist } from "@/lib/production-checklist";

export type ProductionReadinessCounts = {
  failedJobs: number;
  failedNotificationDeliveries: number;
  pendingWebhookEvents: number;
  staleWebhookEvents: number;
};

export type ProductionReadinessStatus = "healthy" | "warning" | "informational";

export type ProductionReadinessHealth = {
  status: ProductionReadinessStatus;
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
  envAudit: LaunchEnvAuditResult;
  generatedAt: string;
  boundary: "read_only_assessment";
};

export function buildProductionReadinessHealth(input: {
  env: Record<string, string | undefined>;
  counts: ProductionReadinessCounts;
}): ProductionReadinessHealth {
  const generatedAt = new Date().toISOString();
  const warnings: string[] = [];

  const envAudit = auditLaunchEnvironment(input.env, { strict: true });
  if (!envAudit.ok) warnings.push("launch_env_missing_required");

  if (input.counts.failedJobs > 0) warnings.push("failed_jobs_present");
  if (input.counts.failedNotificationDeliveries > 0) warnings.push("failed_notification_deliveries_present");
  if (input.counts.pendingWebhookEvents > 50) warnings.push("pending_webhook_events_high");
  if (input.counts.staleWebhookEvents > 0) warnings.push("stale_webhook_events_present");

  const backupConfigured = Boolean(input.env.BACKUP_PROVIDER || input.env.DATABASE_BACKUP_URL);
  const monitoringConfigured = Boolean(input.env.SENTRY_DSN || input.env.MONITORING_DSN);

  if (!backupConfigured) warnings.push("backup_configuration_missing");
  if (!monitoringConfigured) warnings.push("monitoring_configuration_missing");

  const readinessItems = getReleaseReadinessItems();
  const blockingItems = readinessItems.filter((item) => item.blocking).length;

  const status: ProductionReadinessStatus = warnings.length === 0
    ? "healthy"
    : (input.counts.failedJobs === 0 && input.counts.failedNotificationDeliveries === 0 && !backupConfigured && !monitoringConfigured)
      ? "informational"
      : "warning";

  const score = Math.max(0, 100 - (warnings.length * 10));

  return {
    status,
    score,
    warnings,
    summary: warnings.length === 0
      ? "Production readiness checks are healthy across release, monitoring, backup, and webhook signals."
      : `Production readiness has ${warnings.length} warning(s): ${warnings.join(", ")}.`,
    backupValidation: {
      configured: backupConfigured,
      restoreValidationRequired: backupConfigured,
      source: backupConfigured ? "BACKUP_PROVIDER|DATABASE_BACKUP_URL" : "missing",
    },
    monitoringValidation: {
      configured: monitoringConfigured,
      source: monitoringConfigured ? "SENTRY_DSN|MONITORING_DSN" : "missing",
    },
    releaseReadiness: {
      blockingItems,
      totalItems: readinessItems.length,
    },
    envAudit,
    generatedAt,
    boundary: "read_only_assessment",
  };
}

export function getProductionChecklistSnapshot() {
  return productionChecklist.slice();
}
