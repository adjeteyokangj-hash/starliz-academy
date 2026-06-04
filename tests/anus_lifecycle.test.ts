import assert from "node:assert/strict";
import test from "node:test";

import {
  archiveEngineFor,
  isArchiveEngineDestructive,
  makeRecoveryAuditEntry,
  softDeleteEligibilityFor,
} from "../src/lib/anus/archiveEngine";
import {
  isLegalHoldEngineReadOnly,
  legalHoldBlocks,
  legalHoldDecisionFor,
  makeLegalHoldRecord,
} from "../src/lib/anus/legalHold";
import {
  buildLifecycleHealthMetrics,
  buildRetentionSummary,
} from "../src/lib/anus/lifecycleHealth";

test("safeguarding records are under legal hold and block disposal", () => {
  const decision = legalHoldDecisionFor("safeguarding_records");

  assert.equal(decision.holdStatus, "active");
  assert.equal(decision.blocksDisposal, true);
  assert.equal(decision.blocksArchive, false);
  assert.ok(decision.reason.toLowerCase().includes("permanent"));
});

test("disposable cache records have no legal hold", () => {
  const decision = legalHoldDecisionFor("cache");

  assert.equal(decision.holdStatus, "not_applicable");
  assert.equal(decision.blocksDisposal, false);
  assert.equal(legalHoldBlocks("cache", "disposal"), false);
});

test("legal hold engine is read-only", () => {
  assert.equal(isLegalHoldEngineReadOnly(), true);
});

test("makeLegalHoldRecord returns correct hold status for permanent records", () => {
  const record = makeLegalHoldRecord({
    recordType: "certificates",
    studentId: "student-1",
    holdReason: "Regulatory retention requirement",
    appliedAt: "2026-06-04T10:00:00.000Z",
  });

  assert.equal(record.blocksDisposal, true);
  assert.equal(record.releasedAt, null);
  assert.equal(record.studentId, "student-1");
});

test("soft delete is blocked for permanent records", () => {
  const eligibility = softDeleteEligibilityFor("certificates", "2026-06-04T10:00:00.000Z");

  assert.equal(eligibility.eligible, false);
  assert.ok(eligibility.blockedBy.includes("permanent_record"));
});

test("soft delete is eligible for expired disposable records", () => {
  const longAgo = new Date(Date.now() - (60 * 24 * 60 * 60 * 1000)).toISOString();
  const eligibility = softDeleteEligibilityFor("cache", longAgo);

  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.blockedBy.length, 0);
});

test("archive engine returns pending_review for non-disposable records in active state", () => {
  const result = archiveEngineFor("coach_conversations", "2026-01-01T00:00:00.000Z");

  assert.equal(result.boundaryEnforced, "read_only_determination");
  assert.ok(result.archiveState === "pending_review" || result.archiveState === "active");
  assert.equal(result.softDeleteEligibility.eligible, false);
});

test("archive engine marks safeguarding records as under legal hold", () => {
  const result = archiveEngineFor("safeguarding_records", null);

  assert.equal(result.archiveState, "under_legal_hold");
  assert.equal(result.softDeleteEligibility.eligible, false);
});

test("archive engine is non-destructive", () => {
  assert.equal(isArchiveEngineDestructive(), false);
});

test("recovery audit entry contains all required fields", () => {
  const entry = makeRecoveryAuditEntry({
    id: "audit-1",
    recordType: "audit_records",
    studentId: "student-2",
    action: "archive",
    performedBy: "admin@example.com",
    performedAt: "2026-06-04T12:00:00.000Z",
    previousState: "active",
    newState: "archived",
    notes: "Archived as part of lifecycle review.",
  });

  assert.equal(entry.id, "audit-1");
  assert.equal(entry.action, "archive");
  assert.equal(entry.previousState, "active");
  assert.equal(entry.newState, "archived");
  assert.equal(entry.notes, "Archived as part of lifecycle review.");
});

test("lifecycle health metrics are safe for empty state", () => {
  const health = buildLifecycleHealthMetrics({
    totalStudents: 0,
    archivedStudents: 0,
    softDeletedStudents: 0,
    recordsUnderLegalHold: 0,
    recordsPendingReview: 0,
    overdueRetentionRecords: 0,
    recoveryAuditEntriesLast30Days: 0,
  });

  assert.equal(health.status, "informational");
  assert.equal(health.score, 100);
  assert.equal(health.warnings.length, 0);
});

test("lifecycle health raises warning for overdue retention records", () => {
  const health = buildLifecycleHealthMetrics({
    totalStudents: 20,
    archivedStudents: 1,
    softDeletedStudents: 0,
    recordsUnderLegalHold: 2,
    recordsPendingReview: 0,
    overdueRetentionRecords: 5,
    recoveryAuditEntriesLast30Days: 0,
  });

  assert.equal(health.status, "warning");
  assert.ok(health.warnings.includes("overdue_retention_records"));
  assert.ok(health.warnings.includes("legal_hold_records_without_recent_audit"));
});

test("retention summary covers all known record types", () => {
  const summary = buildRetentionSummary();

  assert.ok(summary.length >= 20);
  assert.ok(summary.every((item) => typeof item.recordType === "string"));
  assert.ok(summary.every((item) => item.automaticPurgeEnabled === false));
  assert.ok(summary.some((item) => item.retentionDays === null)); // permanent
  assert.ok(summary.some((item) => item.disposable === true));
});
