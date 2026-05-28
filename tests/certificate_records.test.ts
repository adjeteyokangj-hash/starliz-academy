import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCertificateIdempotencyKey,
  findMatchingIssuedCertificate,
  generateCertificateNumber,
  generateVerificationCode,
  issueCertificateRecord,
  mergeIssuedCertificateRecords,
  upsertIssuedCertificates,
  verifyIssuedCertificate,
  type IssuedCertificateRecord,
} from "../src/lib/certificate-issuing";
import { listIssuedCertificatesForLibrary } from "../src/lib/certificate-library";
import {
  buildCertificateRecordCreateData,
  persistedCertificateRowToIssuedRecord,
} from "../src/lib/certificate-records";
import type { CertificateEligibilityResult } from "../src/lib/certificate-eligibility";

function eligibleCertificate(overrides: Partial<CertificateEligibilityResult> = {}): CertificateEligibilityResult {
  return {
    certificateType: "term_completion",
    term: "Spring",
    status: "eligible",
    eligible: true,
    readinessScore: 91,
    completionPercentage: 88,
    examStatus: "completed",
    passStatus: "pass",
    subjectBreakdown: [],
    blockers: [],
    nextBestAction: "Ready for certificate review and issue decision.",
    action: "issue_certificate",
    evidenceSummary: {
      placementCompleted: true,
      selectedSubjects: 2,
      requiredScopeCount: 2,
      scopesWithAssignments: 2,
      completedAssignments: 8,
      totalAssignments: 9,
      quizAttemptCount: 6,
      activeWeakAreas: 0,
      secureProgressionCount: 2,
      examAttempts: 1,
      passedExamAttempts: 1,
    },
    suggestedCertificateTitle: "StarLiz Spring Term Completion Certificate",
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
    studentName: "Jane Learner",
    yearGroup: "Year 5",
    keyStage: "KS2",
    term: "Spring",
    status: "issued",
    issuedAt: "2026-03-01T00:00:00.000Z",
    evidenceSummary: eligibleCertificate().evidenceSummary,
    subjectBreakdown: [],
    verificationUrl: "/certificates/verify/SV-ABCDEF123456",
    ...overrides,
  };
}

test("buildCertificateRecordCreateData maps an official certificate to first-class record fields", () => {
  const record = issuedRecord();
  const data = buildCertificateRecordCreateData(record);

  assert.equal(data.studentId, "student-1");
  assert.equal(data.certificateNumber, record.certificateNumber);
  assert.equal(data.verificationCode, record.verificationCode);
  assert.equal(data.idempotencyKey, buildCertificateIdempotencyKey(record));
  assert.equal(data.certificateType, "term_completion");
  assert.equal(data.title, record.title);
  assert.equal(data.awardSourceType, "term");
  assert.equal(data.awardSourceId, "spring");
  assert.equal(data.level, "KS2");
  assert.equal(data.yearGroup, "Year 5");
  assert.equal(data.status, "issued");
  assert.match(data.metadataJson, /issuedCertificate/);
});

test("certificate numbers and verification codes remain unique across generated samples", () => {
  const numbers = new Set<string>();
  const codes = new Set<string>();

  for (let index = 0; index < 25; index += 1) {
    numbers.add(generateCertificateNumber({ certificateType: "term_completion", yearGroup: "Year 5", term: "Spring" }));
    codes.add(generateVerificationCode());
  }

  assert.equal(numbers.size, 25);
  assert.equal(codes.size, 25);
});

test("idempotency key prevents duplicate issue for same student type and term", () => {
  const first = issuedRecord();
  const duplicate = issuedRecord({
    id: "cert-2",
    certificateNumber: "SLA-2026-TC-SPR-05-FFFFFF",
    verificationCode: "SV-FFFFFFFFFFFF",
  });

  assert.equal(buildCertificateIdempotencyKey(first), buildCertificateIdempotencyKey(duplicate));
  assert.equal(findMatchingIssuedCertificate({
    records: [first],
    studentId: "student-1",
    certificateType: "term_completion",
    term: "Spring",
  })?.certificateNumber, first.certificateNumber);
});

test("persistedCertificateRowToIssuedRecord reuses saved number and verification code", () => {
  const original = issuedRecord();
  const row = {
    ...buildCertificateRecordCreateData(original),
    id: "db-cert-1",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-02T00:00:00.000Z"),
    student: { name: "Jane Learner" },
  };

  const restored = persistedCertificateRowToIssuedRecord(row);

  assert.equal(restored.id, "db-cert-1");
  assert.equal(restored.certificateNumber, original.certificateNumber);
  assert.equal(restored.verificationCode, original.verificationCode);
  assert.equal(restored.studentName, "Jane Learner");
  assert.equal(verifyIssuedCertificate({ verificationCode: original.verificationCode, candidates: [restored] }).status, "valid");
});

test("library merges persisted records with legacy JSON certificates without duplicates", () => {
  const persisted = issueCertificateRecord({
    eligibility: eligibleCertificate(),
    studentId: "student-1",
    studentName: "Jane Learner",
    yearGroup: "Year 5",
    keyStage: "KS2",
  });
  const legacy = issuedRecord({
    id: persisted.id,
    certificateNumber: persisted.certificateNumber,
    verificationCode: persisted.verificationCode,
    issuedAt: persisted.issuedAt,
  });
  const profileJson = upsertIssuedCertificates(null, [legacy]);

  const merged = mergeIssuedCertificateRecords([persisted], [legacy]);
  const library = listIssuedCertificatesForLibrary(profileJson, [persisted]);

  assert.equal(merged.length, 1);
  assert.equal(library.length, 1);
  assert.equal(library[0]?.certificateNumber, persisted.certificateNumber);
});
