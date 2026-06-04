import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDocumentGenerationHealth,
  mapDocumentGenerationEvidence,
  planDocumentGenerationJob,
} from "../src/lib/reports/document-generation-orchestration";

test("document generation plan is always draft-only and review-gated", () => {
  const plan = planDocumentGenerationJob({
    studentId: "student-1",
    draftType: "progress_report_draft",
    brain: { generatedAt: "2026-06-04T10:00:00.000Z", readiness: "developing", riskLevel: "medium" },
    stomach: { totalSignals: 5, warningCount: 0, averageConfidence: 74 },
    heartbeat: { action: "assign_catch_up", urgency: "high", riskLevel: "high" },
    anus: { legalHoldActive: false, recordType: "progression_history" },
  });

  assert.equal(plan.boundary, "draft_only");
  assert.equal(plan.allowAutoPublish, false);
  assert.equal(plan.allowAutoSend, false);
  assert.equal(plan.requiresAdminReview, true);
  assert.equal(plan.requiresFinalApproval, true);
});

test("lifecycle legal hold blocks draft progression action", () => {
  const plan = planDocumentGenerationJob({
    studentId: "student-2",
    draftType: "certificate_draft",
    anus: { legalHoldActive: true, recordType: "safeguarding_records" },
  });

  assert.equal(plan.recommendedNextAction, "block_draft_for_lifecycle_review");
  assert.ok(plan.warnings.some((warning) => warning.includes("anus")));
});

test("evidence mapping safely handles missing inputs", () => {
  const signals = mapDocumentGenerationEvidence({
    studentId: "student-3",
    draftType: "admin_report_draft",
  });

  assert.equal(signals.length, 4);
  assert.ok(signals.some((signal) => signal.source === "brain" && signal.status === "missing"));
  assert.ok(signals.some((signal) => signal.source === "stomach"));
  assert.ok(signals.every((signal) => signal.confidence >= 0 && signal.confidence <= 100));
});

test("health remains informational in empty-state", () => {
  const health = buildDocumentGenerationHealth({
    activeStudents: 0,
    issuedCertificates: 0,
    recentReportsGenerated: 0,
    pendingDraftReviews: 0,
    blockedByLifecycle: 0,
  });

  assert.equal(health.status, "informational");
  assert.equal(health.score, 100);
  assert.equal(health.boundary, "draft_only");
});

test("health warns when draft review backlog or lifecycle block exists", () => {
  const health = buildDocumentGenerationHealth({
    activeStudents: 10,
    issuedCertificates: 4,
    recentReportsGenerated: 6,
    pendingDraftReviews: 6,
    blockedByLifecycle: 2,
  });

  assert.equal(health.status, "warning");
  assert.ok(health.warnings.includes("draft_review_backlog_high"));
  assert.ok(health.warnings.includes("lifecycle_blocked_drafts_present"));
});
