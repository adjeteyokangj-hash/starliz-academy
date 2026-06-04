import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProductionReadinessHealth,
  getProductionChecklistSnapshot,
} from "../src/lib/release/production-readiness-health";

test("production readiness remains informational for empty-safe local env", () => {
  const health = buildProductionReadinessHealth({
    env: {},
    counts: {
      failedJobs: 0,
      failedNotificationDeliveries: 0,
      pendingWebhookEvents: 0,
      staleWebhookEvents: 0,
    },
  });

  assert.equal(health.boundary, "read_only_assessment");
  assert.equal(health.status, "informational");
  assert.ok(health.warnings.includes("backup_configuration_missing"));
  assert.ok(health.warnings.includes("monitoring_configuration_missing"));
});

test("production readiness reports warning with operational failures", () => {
  const health = buildProductionReadinessHealth({
    env: {
      BACKUP_PROVIDER: "r2",
      SENTRY_DSN: "https://example",
      DATABASE_URL: "postgres://x",
      AUTH_SECRET: "abc",
      NEXT_PUBLIC_APP_URL: "https://example.com",
      NEXT_PUBLIC_BASE_URL: "https://example.com",
      CRON_SECRET: "def",
      EMAIL_FROM: "noreply@example.com",
    },
    counts: {
      failedJobs: 2,
      failedNotificationDeliveries: 1,
      pendingWebhookEvents: 80,
      staleWebhookEvents: 5,
    },
  });

  assert.equal(health.status, "warning");
  assert.ok(health.warnings.includes("failed_jobs_present"));
  assert.ok(health.warnings.includes("stale_webhook_events_present"));
});

test("production checklist snapshot returns non-empty immutable-like data", () => {
  const checklist = getProductionChecklistSnapshot();

  assert.ok(checklist.length > 0);
  assert.ok(checklist.every((item) => typeof item.area === "string"));
  assert.ok(checklist.every((item) => typeof item.item === "string"));
});
