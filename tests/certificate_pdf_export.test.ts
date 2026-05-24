import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCertificateExportPayload,
  buildCertificateExportHtml,
  certificateTypeLabel,
  type CertificateExportInput,
} from "../src/lib/certificate-pdf-export";

function baseInput(overrides: Partial<CertificateExportInput> = {}): CertificateExportInput {
  return {
    title: "Certificate of Term Completion",
    studentDisplayName: "J***",
    certificateType: "term_completion",
    typeLabel: "Term Certificate",
    yearGroup: "Year 4",
    keyStage: "KS2",
    term: "Spring",
    subject: null,
    strand: null,
    awardType: null,
    awardScope: null,
    issuedAt: "2026-03-20T10:20:30.000Z",
    certificateNumber: "SLA-2026-TC-SPR-04-ABCDEF",
    verificationCode: "SV-ABCDEF",
    verificationUrl: "/certificates/verify/SV-ABCDEF",
    status: "issued",
    ...overrides,
  };
}

test("issued certificate can produce export-safe payload", () => {
  const result = buildCertificateExportPayload(baseInput());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payload.status, "issued");
});

test("award certificate can produce export-safe payload", () => {
  const result = buildCertificateExportPayload(baseInput({
    certificateType: "award_certificate",
    typeLabel: certificateTypeLabel("award_certificate"),
    awardType: "student_of_the_term",
    awardScope: "year_group",
    score: 94,
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payload.awardType, "Student Of The Term");
  assert.equal(result.payload.awardScope, "Year Group");
});

test("revoked certificate cannot export as valid PDF", () => {
  const result = buildCertificateExportPayload(baseInput({ status: "revoked" }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.message, /revoked/i);
});

test("pending or eligible-but-not-issued certificate cannot export", () => {
  const pending = buildCertificateExportPayload(baseInput({ status: "pending" }));
  assert.equal(pending.ok, false);
  if (pending.ok) return;
  assert.match(pending.message, /not been issued yet/i);
});

test("unknown verification code returns not found via null input", () => {
  const result = buildCertificateExportPayload(null);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "not_found");
});

test("export payload includes certificate number and verification code", () => {
  const result = buildCertificateExportPayload(baseInput());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payload.certificateNumber, "SLA-2026-TC-SPR-04-ABCDEF");
  assert.equal(result.payload.verificationCode, "SV-ABCDEF");
});

test("export payload does not expose sensitive student data", () => {
  const result = buildCertificateExportPayload(baseInput({ studentDisplayName: "J***" }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const payloadObject = result.payload as unknown as Record<string, unknown>;
  assert.equal("studentId" in payloadObject, false);
  assert.equal("studentName" in payloadObject, false);
});

test("English Reading certificate keeps subject English and strand Reading", () => {
  const result = buildCertificateExportPayload(baseInput({
    certificateType: "english_achievement",
    typeLabel: certificateTypeLabel("english_achievement"),
    subject: "Reading",
    strand: "reading",
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payload.subject, "English");
  assert.equal(result.payload.strand, "Reading");
});

test("award certificate includes award metadata", () => {
  const result = buildCertificateExportPayload(baseInput({
    certificateType: "award_certificate",
    typeLabel: certificateTypeLabel("award_certificate"),
    awardType: "best_student_year_group",
    awardScope: "year_group",
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payload.awardType, "Best Student Year Group");
  assert.equal(result.payload.awardScope, "Year Group");
});

test("UI text says Print / Save as PDF for browser print export", () => {
  const payloadResult = buildCertificateExportPayload(baseInput());
  assert.equal(payloadResult.ok, true);
  if (!payloadResult.ok) return;

  const html = buildCertificateExportHtml(payloadResult.payload);
  assert.match(html, /Print \/ Save as PDF/);
  assert.doesNotMatch(html, /Download PDF/i);
});
