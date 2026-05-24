import test from "node:test";
import assert from "node:assert/strict";

import {
  canApproveAwardNomination,
  canIssueAwardCertificate,
  type StudentAwardNomination,
} from "../src/lib/student-awards";
import {
  issueAwardCertificateRecord,
  parseIssuedCertificates,
  upsertIssuedCertificates,
  verifyIssuedCertificate,
} from "../src/lib/certificate-issuing";

function nomination(overrides: Partial<StudentAwardNomination> = {}): StudentAwardNomination {
  return {
    nominationId: "awn-1234567890abcd",
    awardType: "reading_champion",
    awardScope: "subject_strand",
    studentId: "student-1",
    studentName: "Jane Morgan",
    yearGroup: "Year 4",
    term: "Spring",
    academicYear: "2025/2026",
    subject: "English",
    strand: "reading",
    score: 84,
    rank: 1,
    status: "pending_review",
    eligibleForNomination: true,
    evidenceSummary: {
      evidenceVolume: 18,
      baselineAccuracy: 32,
      currentAccuracy: 78,
      improvementPoints: 46,
      assessmentScore: 80,
      assignmentCompletionScore: 76,
      attemptQualityScore: 79,
      masteryAndAdvancementScore: 74,
      levelAdvancementScore: 62,
      catchUpAndResilienceScore: 58,
      consistencyScore: 70,
      activeWeakAreas: 0,
      resolvedWeakAreas: 2,
      fastLowQualityAttemptRatio: 0.1,
    },
    reasons: ["Strong improvement from baseline."],
    blockers: [],
    safeguards: ["Award requires admin review before issuing."],
    suggestedCertificateTitle: "Reading Champion - Year 4",
    suggestedAwardMessage: "Reading Champion nomination prepared for review.",
    ...overrides,
  };
}

test("pending nomination cannot issue award certificate", () => {
  const gate = canIssueAwardCertificate({
    nomination: nomination(),
    nominationStatus: "pending_review",
  });
  assert.equal(gate.ok, false);
});

test("rejected nomination cannot issue award certificate", () => {
  const gate = canIssueAwardCertificate({
    nomination: nomination(),
    nominationStatus: "rejected",
  });
  assert.equal(gate.ok, false);
});

test("approved nomination can issue award certificate", () => {
  const gate = canIssueAwardCertificate({
    nomination: nomination(),
    nominationStatus: "approved",
  });
  assert.equal(gate.ok, true);
});

test("nomination with blockers cannot be approved without review note", () => {
  const gate = canApproveAwardNomination({
    nomination: nomination({ blockers: ["Active weak areas unresolved."] }),
    reviewNote: "",
    notEnoughEvidence: false,
  });
  assert.equal(gate.ok, false);
});

test("award certificate gets certificate number", () => {
  const record = issueAwardCertificateRecord({
    nomination: nomination(),
    studentId: "student-1",
    studentName: "Jane Morgan",
    yearGroup: "Year 4",
    keyStage: "KS2",
    verificationBaseUrl: "https://starlizacademy.com",
  });
  assert.ok(record.certificateNumber.startsWith("SLA-"));
});

test("award certificate gets verification code", () => {
  const record = issueAwardCertificateRecord({
    nomination: nomination(),
    studentId: "student-1",
    studentName: "Jane Morgan",
    yearGroup: "Year 4",
    keyStage: "KS2",
    verificationBaseUrl: "https://starlizacademy.com",
  });
  assert.ok(record.verificationCode.startsWith("SV-"));
});

test("award certificate verification returns valid", () => {
  const record = issueAwardCertificateRecord({
    nomination: nomination(),
    studentId: "student-1",
    studentName: "Jane Morgan",
    yearGroup: "Year 4",
    keyStage: "KS2",
  });

  const stored = upsertIssuedCertificates(null, [record]);
  const rows = parseIssuedCertificates(stored);
  const verification = verifyIssuedCertificate({
    verificationCode: record.verificationCode,
    candidates: rows,
  });

  assert.equal(verification.status, "valid");
  assert.equal(verification.certificate?.certificateType, "award_certificate");
});

test("verification does not expose sensitive student data", () => {
  const record = issueAwardCertificateRecord({
    nomination: nomination(),
    studentId: "student-1",
    studentName: "Jane Morgan",
    yearGroup: "Year 4",
    keyStage: "KS2",
  });

  const verification = verifyIssuedCertificate({
    verificationCode: record.verificationCode,
    candidates: [record],
  });

  assert.equal(verification.certificate?.studentDisplayName, "J***");
  assert.equal(verification.certificate?.studentDisplayName.includes("Jane"), false);
});

test("English Reading award remains subject English and strand Reading", () => {
  const record = issueAwardCertificateRecord({
    nomination: nomination({ subject: "English", strand: "reading", awardType: "reading_champion" }),
    studentId: "student-1",
    studentName: "Jane Morgan",
    yearGroup: "Year 4",
    keyStage: "KS2",
  });

  const verification = verifyIssuedCertificate({
    verificationCode: record.verificationCode,
    candidates: [record],
  });

  assert.equal(verification.certificate?.subject, "English");
  assert.equal(verification.certificate?.strand, "reading");
});

test("award status remains review-controlled and not automatic", () => {
  const pending = canIssueAwardCertificate({
    nomination: nomination({ eligibleForNomination: true }),
    nominationStatus: "pending_review",
  });
  const approved = canIssueAwardCertificate({
    nomination: nomination({ eligibleForNomination: true }),
    nominationStatus: "approved",
  });

  assert.equal(pending.ok, false);
  assert.equal(approved.ok, true);
});
