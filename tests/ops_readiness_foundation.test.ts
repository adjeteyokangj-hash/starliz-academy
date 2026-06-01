import assert from "node:assert/strict";
import test from "node:test";

import { handleHealthGet } from "../src/app/api/health/route";
import { summarizeJobHealth, type JobRunSnapshot } from "../src/lib/ops/job-status";
import { redactSensitiveLogData } from "../src/lib/ops/log-redaction";
import { buildSafeApiError } from "../src/lib/ops/safe-error";
import { summarizeWebhookFailures, type WebhookFailureEvent } from "../src/lib/ops/webhook-failures";

test("health endpoint returns safe payload shape", async () => {
  const response = await handleHealthGet();
  assert.equal(response.headers.get("cache-control"), "no-store");

  const body = (await response.json()) as {
    ok: boolean;
    environment: string;
    timestamp: string;
    version: string;
    checks: {
      database: string;
      jobs: {
        status: string;
        staleJobs: string[];
        failingJobs: string[];
      };
      webhooks: {
        status: string;
        providers: string[];
      };
    };
  };

  assert.equal(typeof body.ok, "boolean");
  assert.equal(typeof body.environment, "string");
  assert.equal(typeof body.timestamp, "string");
  assert.equal(typeof body.version, "string");
  assert.ok(["ok", "warning", "critical"].includes(body.checks.jobs.status));
  assert.ok(["ok", "warning", "critical"].includes(body.checks.webhooks.status));
  assert.equal(Array.isArray(body.checks.jobs.staleJobs), true);
  assert.equal(Array.isArray(body.checks.webhooks.providers), true);

  const serialized = JSON.stringify(body).toLowerCase();
  assert.equal(serialized.includes("authorization"), false);
  assert.equal(serialized.includes("set-cookie"), false);
  assert.equal(serialized.includes("token"), false);
});

test("redaction helper masks secrets and identifiers", () => {
  const redacted = redactSensitiveLogData({
    authorization: "Bearer production-secret-token",
    parentEmail: "parent@example.com",
    nested: {
      childId: "child_abc123",
      notes: "safe",
    },
  });

  assert.equal(redacted.authorization, "Be***en");
  assert.equal(redacted.parentEmail, "pa***om");
  assert.deepEqual(redacted.nested, {
    childId: "ch***23",
    notes: "safe",
  });
});

test("job status summary remains non-identifying", () => {
  const now = new Date("2026-01-20T12:00:00.000Z");
  const jobs: JobRunSnapshot[] = [
    {
      name: "weekly_homework_generation",
      lastRunAt: "2026-01-18T00:00:00.000Z",
      lastSuccessAt: "2026-01-12T00:00:00.000Z",
      consecutiveFailures: 3,
    },
    {
      name: "subscription_reconciliation",
      lastRunAt: "2026-01-20T11:00:00.000Z",
      lastSuccessAt: "2026-01-20T11:00:00.000Z",
      consecutiveFailures: 0,
    },
  ];

  const summary = summarizeJobHealth(jobs, now);
  assert.equal(summary.status, "critical");
  assert.deepEqual(summary.failingJobs, ["weekly_homework_generation"]);

  const serialized = JSON.stringify(summary).toLowerCase();
  assert.equal(serialized.includes("child"), false);
  assert.equal(serialized.includes("email"), false);
});

test("safe error response does not leak secrets", () => {
  const payload = buildSafeApiError({
    code: "INTERNAL_ERROR",
    message: "An internal error occurred",
    requestId: "req_123",
    details: {
      token: "tok_live_abc123456",
      apiKey: "sk_test_super_secret",
      note: "keep this",
      childId: "child_private_999",
    },
  });

  assert.equal(payload.error.code, "INTERNAL_ERROR");
  assert.equal(payload.error.requestId, "req_123");
  assert.equal(payload.details?.note, "keep this");
  assert.equal(payload.details?.token, "to***56");
  assert.equal(payload.details?.apiKey, "sk***et");
  assert.equal(payload.details?.childId, "ch***99");
});

test("webhook failure summary excludes child-level data", () => {
  const now = new Date("2026-01-20T12:00:00.000Z");
  const events: WebhookFailureEvent[] = [
    {
      provider: "stripe",
      statusCode: 400,
      endpoint: "/api/webhooks/stripe",
      occurredAt: "2026-01-20T11:30:00.000Z",
      customerEmail: "parent@example.com",
      childId: "child_abc123",
    },
    {
      provider: "stripe",
      statusCode: 500,
      endpoint: "/api/webhooks/stripe",
      occurredAt: "2026-01-19T12:30:00.000Z",
      customerEmail: "parent2@example.com",
      childId: "child_xyz987",
    },
  ];

  const summary = summarizeWebhookFailures(events, now, 24);
  assert.equal(summary.status, "warning");
  assert.deepEqual(summary.providers, ["stripe"]);

  const serialized = JSON.stringify(summary).toLowerCase();
  assert.equal(serialized.includes("child"), false);
  assert.equal(serialized.includes("email"), false);
  assert.equal(serialized.includes("customer"), false);
});
