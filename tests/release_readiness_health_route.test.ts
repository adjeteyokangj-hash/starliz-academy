import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAdminReleaseReadinessHealthGet,
  type AdminReleaseReadinessHealthPayload,
} from "../src/app/api/admin/release/readiness-health/route";
import type { ProductionReadinessCounts } from "../src/lib/release/production-readiness-health";

test("release readiness health route requires admin permission", async () => {
  const response = await handleAdminReleaseReadinessHealthGet(
    new Request("http://localhost/api/admin/release/readiness-health"),
    {
      requireAdminPermission: async () => ({
        session: null,
        response: Response.json({ error: "Forbidden" }, { status: 403 }) as never,
      }),
      collectCounts: async () => ({
        failedJobs: 0,
        failedNotificationDeliveries: 0,
        pendingWebhookEvents: 0,
        staleWebhookEvents: 0,
      }),
      env: {},
    },
  );

  assert.equal(response?.status, 403);
});

test("release readiness route returns informational state when only env setup is pending", async () => {
  const counts: ProductionReadinessCounts = {
    failedJobs: 0,
    failedNotificationDeliveries: 0,
    pendingWebhookEvents: 0,
    staleWebhookEvents: 0,
  };

  const response = await handleAdminReleaseReadinessHealthGet(
    new Request("http://localhost/api/admin/release/readiness-health"),
    {
      requireAdminPermission: async () => ({
        session: { userId: "admin-1", email: "admin@example.com", role: "admin" },
        response: null,
      }),
      collectCounts: async () => counts,
      env: {},
    },
  );

  const payload = await response.json() as AdminReleaseReadinessHealthPayload;

  assert.equal(response.status, 200);
  assert.equal(payload.status, "informational");
  assert.equal(payload.boundary, "read_only_assessment");
  assert.ok(Array.isArray(payload.checklist));
});

test("release readiness route warns when operational failures exist", async () => {
  const counts: ProductionReadinessCounts = {
    failedJobs: 3,
    failedNotificationDeliveries: 2,
    pendingWebhookEvents: 55,
    staleWebhookEvents: 1,
  };

  const response = await handleAdminReleaseReadinessHealthGet(
    new Request("http://localhost/api/admin/release/readiness-health"),
    {
      requireAdminPermission: async () => ({
        session: { userId: "admin-1", email: "admin@example.com", role: "admin" },
        response: null,
      }),
      collectCounts: async () => counts,
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
    },
  );

  const payload = await response.json() as AdminReleaseReadinessHealthPayload;

  assert.equal(response.status, 200);
  assert.equal(payload.status, "warning");
  assert.ok(payload.warnings.includes("failed_jobs_present"));
  assert.ok(payload.warnings.includes("stale_webhook_events_present"));
}
);