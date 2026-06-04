import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAdminIngestionHealthGet,
  type AdminIngestionHealthPayload,
} from "../src/app/api/admin/ingestion-health/route";
import type { IngestionMonitoringCounts } from "../src/lib/stomach/ingestionTypes";

test("ingestion health route requires admin access", async () => {
  const response = await handleAdminIngestionHealthGet(
    new Request("http://localhost/api/admin/ingestion-health"),
    {
      requireAdmin: async () => ({
        session: null,
        response: Response.json({ error: "Unauthorized" }, { status: 401 }) as never,
      }),
      collectCounts: async () => ({
        totalStudents: 0,
        studentsWithProfiles: 0,
        studentsWithRecentAttempts: 0,
        activeWeakAreas: 0,
        activeAssignments: 0,
        queuedIngestionJobs: 0,
        latestEvidenceAt: null,
      }),
    },
  );

  assert.equal(response?.status, 401);
});

test("ingestion health route returns warning metrics for onboarding and ingestion gaps", async () => {
  const counts: IngestionMonitoringCounts = {
    totalStudents: 10,
    studentsWithProfiles: 5,
    studentsWithRecentAttempts: 2,
    activeWeakAreas: 14,
    activeAssignments: 7,
    queuedIngestionJobs: 8,
    latestEvidenceAt: "2026-06-04T10:20:00.000Z",
  };

  const response = await handleAdminIngestionHealthGet(
    new Request("http://localhost/api/admin/ingestion-health"),
    {
      requireAdmin: async () => ({
        session: { userId: "admin-1", email: "admin@example.com", role: "admin" },
        response: null,
      }),
      collectCounts: async () => counts,
    },
  );

  const payload = await response.json() as AdminIngestionHealthPayload;

  assert.equal(response.status, 200);
  assert.equal(payload.status, "warning");
  assert.equal(payload.onboarding.totalStudents, 10);
  assert.equal(payload.onboarding.profileCoveragePercent, 50);
  assert.equal(payload.ingestion.activeEvidenceCoveragePercent, 20);
  assert.ok(payload.warnings.includes("onboarding_profile_coverage_low"));
  assert.ok(payload.warnings.includes("recent_evidence_coverage_low"));
  assert.equal(payload.decisionBoundary, "digest_only");
});

test("ingestion health route treats empty datasets as informational safe state", async () => {
  const response = await handleAdminIngestionHealthGet(
    new Request("http://localhost/api/admin/ingestion-health"),
    {
      requireAdmin: async () => ({
        session: { userId: "admin-1", email: "admin@example.com", role: "admin" },
        response: null,
      }),
      collectCounts: async () => ({
        totalStudents: 0,
        studentsWithProfiles: 0,
        studentsWithRecentAttempts: 0,
        activeWeakAreas: 0,
        activeAssignments: 0,
        queuedIngestionJobs: 0,
        latestEvidenceAt: null,
      }),
    },
  );

  const payload = await response.json() as AdminIngestionHealthPayload;

  assert.equal(response.status, 200);
  assert.equal(payload.status, "informational");
  assert.equal(payload.score, 100);
  assert.equal(payload.warnings.length, 0);
  assert.match(payload.summary, /safely idle/i);
});
