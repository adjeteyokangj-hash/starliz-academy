import test from "node:test";
import assert from "node:assert/strict";

import { listIssuedCertificatesForLibrary } from "../src/lib/certificate-library";
import { issueAwardCertificateRecord, issueCertificateRecord, upsertIssuedCertificates, type IssuedCertificateRecord } from "../src/lib/certificate-issuing";
import type { CertificateEligibilityResult } from "../src/lib/certificate-eligibility";
import type { StudentAwardNomination } from "../src/lib/student-awards";

function baseEligibility(overrides: Partial<CertificateEligibilityResult> = {}): CertificateEligibilityResult {
  return {
    certificateType: "term_completion",
    term: "Spring",
    status: "eligible",
    eligible: true,
    readinessScore: 95,
    completionPercentage: 92,
    examStatus: "completed",
    passStatus: "pass",
    blockers: [],
    nextBestAction: "Issue certificate",
    action: "issue_certificate",
    suggestedCertificateTitle: "StarLiz Spring Term Completion Certificate",
    subjectBreakdown: [],
    evidenceSummary: {
      placementCompleted: true,
      selectedSubjects: 2,
      requiredScopeCount: 2,
      scopesWithAssignments: 2,
      completedAssignments: 8,
      totalAssignments: 8,
      quizAttemptCount: 10,
      activeWeakAreas: 0,
      secureProgressionCount: 2,
      examAttempts: 1,
      passedExamAttempts: 1,
    },
    ...overrides,
  };
}

function baseAwardNomination(overrides: Partial<StudentAwardNomination> = {}): StudentAwardNomination {
  return {
    nominationId: "awn-test-001",
    awardType: "most_improved_year_group",
    awardScope: "year_group",
    studentId: "student-1",
    studentName: "Jane Morgan",
    yearGroup: "Year 5",
    term: "Spring",
    academicYear: "2025/2026",
    subject: null,
    strand: null,
    score: 88,
    rank: 1,
    status: "approved",
    eligibleForNomination: true,
    evidenceSummary: {
      evidenceVolume: 20,
      baselineAccuracy: 40,
      currentAccuracy: 82,
      improvementPoints: 42,
      assessmentScore: 81,
      assignmentCompletionScore: 84,
      attemptQualityScore: 79,
      masteryAndAdvancementScore: 74,
      levelAdvancementScore: 60,
      catchUpAndResilienceScore: 62,
      consistencyScore: 72,
      activeWeakAreas: 0,
      resolvedWeakAreas: 3,
      fastLowQualityAttemptRatio: 0.08,
    },
    reasons: ["Strong and sustained progress."],
    blockers: [],
    safeguards: ["Admin review required before certificate issue."],
    suggestedCertificateTitle: "Most Improved Learner Award",
    suggestedAwardMessage: "Approved for certificate issue.",
    ...overrides,
  };
}

function storedRecord(overrides: Partial<IssuedCertificateRecord> = {}): IssuedCertificateRecord {
  return {
    id: "cert-1",
    certificateNumber: "SLA-2026-TC-SPR-05-AAAAAA",
    verificationCode: "SV-AAAAAA",
    certificateType: "term_completion",
    title: "StarLiz Spring Term Completion Certificate",
    studentId: "student-1",
    studentName: "Jane Morgan",
    yearGroup: "Year 5",
    keyStage: "KS2",
    term: "Spring",
    status: "issued",
    issuedAt: "2026-03-20T10:20:30.000Z",
    evidenceSummary: baseEligibility().evidenceSummary,
    subjectBreakdown: [],
    verificationUrl: "/certificates/verify/SV-AAAAAA",
    ...overrides,
  };
}

test("empty certificate storage returns empty list", () => {
  const rows = listIssuedCertificatesForLibrary(null);
  assert.deepEqual(rows, []);
});

test("normal issued certificate appears in library", () => {
  const raw = upsertIssuedCertificates(null, [storedRecord()]);
  const rows = listIssuedCertificatesForLibrary(raw);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.certificateType, "term_completion");
  assert.equal(rows[0]?.typeGroupLabel, "Term certificates");
});

test("award certificate appears in library", () => {
  const record = issueAwardCertificateRecord({
    nomination: baseAwardNomination(),
    studentId: "student-1",
    studentName: "Jane Morgan",
    yearGroup: "Year 5",
    keyStage: "KS2",
    verificationBaseUrl: "https://starlizacademy.com",
  });
  const raw = upsertIssuedCertificates(null, [record]);
  const rows = listIssuedCertificatesForLibrary(raw);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.certificateType, "award_certificate");
  assert.equal(rows[0]?.typeGroupLabel, "Award certificates");
});

test("revoked certificate shows revoked status and remains visible", () => {
  const raw = upsertIssuedCertificates(null, [storedRecord({ status: "revoked" })]);
  const rows = listIssuedCertificatesForLibrary(raw);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.status, "revoked");
});

test("verification URL is included", () => {
  const raw = upsertIssuedCertificates(null, [storedRecord({ verificationUrl: "" })]);
  const rows = listIssuedCertificatesForLibrary(raw);
  assert.equal(rows[0]?.verificationUrl, "/certificates/verify/SV-AAAAAA");
});

test("sensitive student data is not exposed", () => {
  const raw = upsertIssuedCertificates(null, [storedRecord({ studentName: "Jane Morgan" })]);
  const row = listIssuedCertificatesForLibrary(raw)[0];
  assert.ok(row);
  assert.equal("studentId" in (row as object), false);
  assert.equal("studentName" in (row as object), false);
  assert.equal(row?.studentDisplayName, "J***");
});

test("certificates are sorted newest first", () => {
  const older = storedRecord({ id: "old", verificationCode: "SV-OLD", certificateNumber: "SLA-OLD", issuedAt: "2026-02-01T00:00:00.000Z" });
  const newer = storedRecord({ id: "new", verificationCode: "SV-NEW", certificateNumber: "SLA-NEW", issuedAt: "2026-04-01T00:00:00.000Z" });
  const raw = upsertIssuedCertificates(null, [older, newer]);
  const rows = listIssuedCertificatesForLibrary(raw);
  assert.equal(rows[0]?.verificationCode, "SV-NEW");
  assert.equal(rows[1]?.verificationCode, "SV-OLD");
});

test("malformed certificate records are ignored safely", () => {
  const raw = JSON.stringify({
    certificates: {
      issued: [
        { id: "broken", certificateType: "term_completion" },
        storedRecord(),
      ],
    },
  });
  const rows = listIssuedCertificatesForLibrary(raw);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.verificationCode, "SV-AAAAAA");
});

test("library remains compatible with standard certificate issuing records", () => {
  const issued = issueCertificateRecord({
    eligibility: baseEligibility(),
    studentId: "student-1",
    studentName: "Jane Morgan",
    yearGroup: "Year 5",
    keyStage: "KS2",
    verificationBaseUrl: "https://starlizacademy.com",
  });
  const raw = upsertIssuedCertificates(null, [issued]);
  const rows = listIssuedCertificatesForLibrary(raw);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.certificateType, "term_completion");
});

test("library remains compatible with award certificate issuing records", () => {
  const issued = issueAwardCertificateRecord({
    nomination: baseAwardNomination(),
    studentId: "student-1",
    studentName: "Jane Morgan",
    yearGroup: "Year 5",
    keyStage: "KS2",
    verificationBaseUrl: "https://starlizacademy.com",
  });
  const raw = upsertIssuedCertificates(null, [issued]);
  const rows = listIssuedCertificatesForLibrary(raw);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.certificateType, "award_certificate");
});