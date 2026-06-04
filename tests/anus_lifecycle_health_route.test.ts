import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAdminLifecycleHealthGet,
  type AdminLifecycleHealthPayload,
} from "../src/app/api/admin/lifecycle-health/route";
import type { LifecycleMonitoringCounts } from "../src/lib/anus/lifecycleHealth";

test("lifecycle health route requires admin access", async () => {
  const response = await handleAdminLifecycleHealthGet(
    new Request("http://localhost/api/admin/lifecycle-health"),
    {
      requireAdmin: async () => ({
        session: null,
        response: Response.json({ error: "Unauthorized" }, { status: 401 }) as never,
      }),
      collectCounts: async () => ({
        totalStudents: 0,
        archivedStudents: 0,
        softDeletedStudents: 0,
        recordsUnderLegalHold: 0,
        recordsPendingReview: 0,
        overdueRetentionRecords: 0,
        recoveryAuditEntriesLast30Days: 0,
      }),
    },
  );

  assert.equal(response?.status, 401);
});

test("lifecycle health route returns informational safe state for empty dataset", async () => {
  const counts: LifecycleMonitoringCounts = {
    totalStudents: 0,
    archivedStudents: 0,
    softDeletedStudents: 0,
    recordsUnderLegalHold: 0,
    recordsPendingReview: 0,
    overdueRetentionRecords: 0,
    recoveryAuditEntriesLast30Days: 0,
  };

  const response = await handleAdminLifecycleHealthGet(
    new Request("http://localhost/api/admin/lifecycle-health"),
    {
      requireAdmin: async () => ({
        session: { userId: "admin-1", email: "admin@example.com", role: "admin" },
        response: null,
      }),
      collectCounts: async () => counts,
    },
  );

  const payload = await response.json() as AdminLifecycleHealthPayload;

  assert.equal(response.status, 200);
  assert.equal(payload.status, "informational");
  assert.equal(payload.score, 100);
  assert.equal(payload.warnings.length, 0);
  assert.equal(payload.boundaryEnforced, "read_only_determination");
  assert.ok(Array.isArray(payload.retentionSummary));
  assert.ok(payload.retentionSummary.length >= 20);
});

test("lifecycle health route returns warning for overdue retention and legal hold gaps", async () => {
  const counts: LifecycleMonitoringCounts = {
    totalStudents: 15,
    archivedStudents: 2,
    softDeletedStudents: 0,
    recordsUnderLegalHold: 3,
    recordsPendingReview: 5,
    overdueRetentionRecords: 4,
    recoveryAuditEntriesLast30Days: 0,
  };

  const response = await handleAdminLifecycleHealthGet(
    new Request("http://localhost/api/admin/lifecycle-health"),
    {
      requireAdmin: async () => ({
        session: { userId: "admin-1", email: "admin@example.com", role: "admin" },
        response: null,
      }),
      collectCounts: async () => counts,
    },
  );

  const payload = await response.json() as AdminLifecycleHealthPayload;

  assert.equal(response.status, 200);
  assert.equal(payload.status, "warning");
  assert.ok(payload.warnings.includes("overdue_retention_records"));
  assert.ok(payload.warnings.includes("legal_hold_records_without_recent_audit"));
  assert.equal(payload.counts.totalStudents, 15);
  assert.equal(payload.counts.overdueRetentionRecords, 4);
});
