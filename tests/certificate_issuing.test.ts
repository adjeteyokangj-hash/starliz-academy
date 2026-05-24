import test from "node:test";
import assert from "node:assert/strict";

import {
  canIssueCertificate,
  issueCertificateRecord,
  maskStudentName,
  parseIssuedCertificates,
  upsertIssuedCertificates,
  verifyIssuedCertificate,
  type IssuedCertificateRecord,
} from "../src/lib/certificate-issuing";
import type { CertificateEligibilityResult } from "../src/lib/certificate-eligibility";

function eligibleCertificate(overrides: Partial<CertificateEligibilityResult> = {}): CertificateEligibilityResult {
  return {
    certificateType: "term_completion",
    term: "Spring",
    status: "eligible",
    eligible: true,
    readinessScore: 95,
    completionPercentage: 90,
    examStatus: "completed",
    passStatus: "pass",
    blockers: [],
    nextBestAction: "Issue certificate",
    action: "issue_certificate",
    suggestedCertificateTitle: "StarLiz Spring Term Completion Certificate",
    subjectBreakdown: [
      {
        scopedSubject: "maths",
        subject: "Maths",
        strand: null,
        placementLevel: 2,
        progressionStatus: "secure",
        ready: true,
        reason: "Secure progression and consistent evidence.",
      },
    ],
    evidenceSummary: {
      placementCompleted: true,
      selectedSubjects: 2,
      requiredScopeCount: 2,
      scopesWithAssignments: 2,
      completedAssignments: 5,
      totalAssignments: 5,
      quizAttemptCount: 6,
      activeWeakAreas: 0,
      secureProgressionCount: 2,
      examAttempts: 1,
      passedExamAttempts: 1,
    },
    ...overrides,
  };
}

function issuedRecord(overrides: Partial<IssuedCertificateRecord> = {}): IssuedCertificateRecord {
  return {
    id: "cert-1",
    certificateNumber: "SLA-2026-TC-SPR-05-ABC123",
    verificationCode: "SV-ABCDEF123456",
    certificateType: "term_completion",
    title: "StarLiz Spring Term Completion Certificate",
    studentId: "student-1",
    studentName: "Jane Morgan",
    yearGroup: "Year 5",
    keyStage: "KS2",
    term: "Spring",
    status: "issued",
    issuedAt: "2026-03-20T10:20:30.000Z",
    evidenceSummary: eligibleCertificate().evidenceSummary,
    subjectBreakdown: eligibleCertificate().subjectBreakdown,
    verificationUrl: "/certificates/verify/SV-ABCDEF123456",
    ...overrides,
  };
}

test("canIssueCertificate allows eligible status", () => {
  const result = canIssueCertificate(eligibleCertificate());
  assert.deepEqual(result, { ok: true });
});

test("canIssueCertificate blocks pending status", () => {
  const result = canIssueCertificate(eligibleCertificate({ status: "pending_exam", eligible: false }));
  assert.equal(result.ok, false);
  assert.equal(result.ok ? "none" : result.eligibilityStatus, "pending_exam");
});

test("issueCertificateRecord creates certificate metadata", () => {
  const record = issueCertificateRecord({
    eligibility: eligibleCertificate(),
    studentId: "student-1",
    studentName: "Jane Morgan",
    yearGroup: "Year 5",
    keyStage: "KS2",
    verificationBaseUrl: "https://starlizacademy.com",
  });

  assert.equal(record.certificateType, "term_completion");
  assert.equal(record.studentId, "student-1");
  assert.ok(record.certificateNumber.startsWith("SLA-"));
  assert.ok(record.verificationCode.startsWith("SV-"));
  assert.ok(record.verificationUrl.includes(`/certificates/verify/${record.verificationCode}`));
});

test("parseIssuedCertificates returns empty for invalid json", () => {
  const rows = parseIssuedCertificates("{invalid-json");
  assert.deepEqual(rows, []);
});

test("upsertIssuedCertificates round-trip persists issued list", () => {
  const persisted = upsertIssuedCertificates(null, [issuedRecord()]);
  const rows = parseIssuedCertificates(persisted);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.certificateNumber, "SLA-2026-TC-SPR-05-ABC123");
});

test("verifyIssuedCertificate returns valid for known code", () => {
  const verification = verifyIssuedCertificate({
    verificationCode: "SV-ABCDEF123456",
    candidates: [issuedRecord()],
  });

  assert.equal(verification.status, "valid");
  assert.equal(verification.certificate?.certificateNumber, "SLA-2026-TC-SPR-05-ABC123");
  assert.equal(verification.certificate?.studentDisplayName, "J***");
});

test("verifyIssuedCertificate returns revoked when status is revoked", () => {
  const verification = verifyIssuedCertificate({
    verificationCode: "SV-ABCDEF123456",
    candidates: [issuedRecord({ status: "revoked" })],
  });

  assert.equal(verification.status, "revoked");
});

test("verifyIssuedCertificate returns not_found for unknown code", () => {
  const verification = verifyIssuedCertificate({
    verificationCode: "SV-UNKNOWN",
    candidates: [issuedRecord()],
  });

  assert.equal(verification.status, "not_found");
  assert.equal(verification.certificate, null);
});

test("maskStudentName protects student identity", () => {
  assert.equal(maskStudentName("Ava"), "A**");
  assert.equal(maskStudentName("Bo"), "B*");
  assert.equal(maskStudentName(""), "Learner");
});

test("parseIssuedCertificates ignores malformed records", () => {
  const raw = JSON.stringify({
    certificates: {
      issued: [
        { id: "bad", certificateType: "term_completion" },
        issuedRecord(),
      ],
    },
  });

  const rows = parseIssuedCertificates(raw);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, "cert-1");
});
