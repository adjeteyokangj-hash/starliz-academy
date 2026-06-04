import assert from "node:assert/strict";
import test from "node:test";

import { digestDocument } from "../src/lib/stomach/documentDigestion";
import { extractEvidenceSignal } from "../src/lib/stomach/evidenceExtraction";
import { buildIngestionHealthMetrics, runStomachIngestion } from "../src/lib/stomach/ingestionHealth";

test("document digestion extracts warning and readiness evidence without making final decisions", () => {
  const result = digestDocument({
    documentId: "doc-1",
    studentId: "student-1",
    sourceLabel: "teacher-note",
    title: "Weekly learning note",
    content: "Student struggled with fractions but improved after coach support and a quiz score increase.",
    createdAt: "2026-06-04T10:00:00.000Z",
  });

  assert.equal(result.source, "document_ingestion");
  assert.equal(result.status, "warning");
  assert.ok(result.signals.some((signal) => signal.evidenceType === "weak_area_signal"));
  assert.ok(result.signals.some((signal) => signal.evidenceType === "attempt_outcome"));
  assert.ok(result.signals.every((signal) => signal.confidence >= 0 && signal.confidence <= 100));
});

test("evidence extraction contract always returns confidence, source, type, status, and action", () => {
  const signal = extractEvidenceSignal({
    id: "att-1",
    studentId: "student-2",
    kind: "attempt",
    score: 38,
    observedAt: "2026-06-04T08:00:00.000Z",
    metadata: { subject: "math" },
  });

  assert.equal(signal.source, "platform_attempt");
  assert.equal(signal.evidenceType, "attempt_outcome");
  assert.equal(signal.status, "warning");
  assert.equal(typeof signal.recommendedNextAction, "string");
  assert.ok(Array.isArray(signal.warningCodes));
  assert.ok(signal.confidence >= 0 && signal.confidence <= 100);
});

test("stomach pipeline returns digest-only output and safe summaries", () => {
  const output = runStomachIngestion({
    platformEvidence: [
      { id: "attempt-1", studentId: "student-1", kind: "attempt", score: 81, observedAt: "2026-06-04T07:00:00.000Z" },
      { id: "weak-1", studentId: "student-1", kind: "weak_area", status: "active", observedAt: "2026-06-04T07:15:00.000Z" },
    ],
    documents: [
      {
        documentId: "doc-2",
        studentId: "student-1",
        content: "Homework was late, but the student appears more confident in assessment prep.",
        createdAt: "2026-06-04T09:00:00.000Z",
      },
    ],
  });

  assert.equal(output.decisionBoundary, "digest_only");
  assert.ok(output.summary.totalSignals >= 3);
  assert.ok(output.summary.byStatus.warning >= 1);
  assert.ok(output.summary.averageConfidence >= 0);
});

test("ingestion health metrics keep empty state safe and non-alarming", () => {
  const health = buildIngestionHealthMetrics({
    totalStudents: 0,
    studentsWithProfiles: 0,
    studentsWithRecentAttempts: 0,
    activeWeakAreas: 0,
    activeAssignments: 0,
    queuedIngestionJobs: 0,
    latestEvidenceAt: null,
  });

  assert.equal(health.status, "informational");
  assert.equal(health.score, 100);
  assert.equal(health.warnings.length, 0);
  assert.equal(health.recommendedNextAction, "ingest_more_evidence");
});
