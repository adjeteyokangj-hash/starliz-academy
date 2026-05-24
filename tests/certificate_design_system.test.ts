import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import CertificatePreview, { type CertificatePreviewProps } from "../src/components/certificates/CertificatePreview";
import { resolveCertificateDesign, type CertificateDesignInput } from "../src/components/certificates/certificate-designs";

function baseInput(overrides: Partial<CertificateDesignInput> = {}): CertificateDesignInput {
  return {
    title: "StarLiz Spring Term Completion Certificate",
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

function renderPreview(overrides: Partial<CertificatePreviewProps> = {}): string {
  const props: CertificatePreviewProps = {
    ...baseInput(),
    ...overrides,
  };
  return renderToStaticMarkup(React.createElement(CertificatePreview, props));
}

test("term_completion maps to term completion template", () => {
  const design = resolveCertificateDesign(baseInput({ certificateType: "term_completion" }));
  assert.equal(design.templateType, "term_completion");
  assert.equal(design.title, "Certificate of Term Completion");
});

test("award_certificate maps to award template", () => {
  const design = resolveCertificateDesign(baseInput({
    certificateType: "award_certificate",
    awardType: "most_improved_year_group",
    awardScope: "year_group",
  }));
  assert.equal(design.templateType, "award_certificate");
  assert.equal(design.showAwardDetails, true);
  assert.match(design.subtitle, /Prestige Award/i);
});

test("english_achievement maps to English template", () => {
  const design = resolveCertificateDesign(baseInput({
    certificateType: "english_achievement",
    subject: "English",
    strand: "reading",
  }));
  assert.equal(design.templateType, "english_achievement");
  assert.equal(design.normalizedSubject, "English");
  assert.equal(design.showEnglishStrands, true);
});

test("English Reading certificate keeps subject English and strand Reading", () => {
  const design = resolveCertificateDesign(baseInput({
    certificateType: "english_achievement",
    subject: "Reading",
    strand: "reading",
  }));
  assert.equal(design.normalizedSubject, "English");
  assert.equal(design.normalizedStrand, "Reading");
});

test("Reading and Spelling are not treated as parent subjects", () => {
  const reading = resolveCertificateDesign(baseInput({
    certificateType: "english_achievement",
    subject: "Reading",
    strand: "reading",
  }));
  const spelling = resolveCertificateDesign(baseInput({
    certificateType: "english_achievement",
    subject: "Spelling",
    strand: "spelling",
  }));

  assert.equal(reading.normalizedSubject, "English");
  assert.equal(spelling.normalizedSubject, "English");
  assert.notEqual(reading.normalizedSubject, "Reading");
  assert.notEqual(spelling.normalizedSubject, "Spelling");
});

test("certificate design includes certificate number and verification code", () => {
  const html = renderPreview();
  assert.match(html, /SLA-2026-TC-SPR-04-ABCDEF/);
  assert.match(html, /SV-ABCDEF/);
});

test("award certificate includes award metadata", () => {
  const html = renderPreview({
    certificateType: "award_certificate",
    awardType: "student_of_the_term",
    awardScope: "year_group",
    score: 97,
    evidenceSummaryText: "Approved by admin based on sustained improvement.",
  });
  assert.match(html, /Award type:/);
  assert.match(html, /Student Of The Term/);
  assert.match(html, /Award scope:/);
  assert.match(html, /Year Group/);
  assert.match(html, /Award score:/);
});

test("revoked certificate shows revoked status", () => {
  const html = renderPreview({ status: "revoked" });
  assert.match(html, /Status:\s*Revoked/);
});

test("safe preview props do not expose sensitive data", () => {
  const design = resolveCertificateDesign(baseInput());
  assert.equal("studentId" in (design as unknown as Record<string, unknown>), false);

  const html = renderPreview({ studentDisplayName: "J***" });
  assert.doesNotMatch(html, /Jane Morgan/);
  assert.doesNotMatch(html, /studentId/);
});

test("no PDF or download label is rendered", () => {
  const html = renderPreview();
  assert.doesNotMatch(html, /Download PDF/i);
  assert.doesNotMatch(html, /Download Certificate/i);
});

test("print action uses browser print only", () => {
  const html = renderPreview({ showPrintAction: true });
  assert.match(html, /Print \/ Save as PDF/);
  assert.match(html, /data-print-action="browser-print"/);
  assert.doesNotMatch(html, /Download PDF/i);
});

test("verification preview uses safe public payload", () => {
  const html = renderPreview({
    status: "valid",
    studentDisplayName: "J***",
    verificationCode: "SV-SAFE01",
    certificateNumber: "SLA-2026-TC-SPR-04-SAFE01",
    verificationUrl: "/certificates/verify/SV-SAFE01",
  });
  assert.match(html, /Status:\s*Valid/);
  assert.match(html, /SV-SAFE01/);
  assert.match(html, /SLA-2026-TC-SPR-04-SAFE01/);
  assert.doesNotMatch(html, /studentId/i);
});
