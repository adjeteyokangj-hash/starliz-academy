import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import CertificatePreview, { type CertificatePreviewProps } from "../src/components/certificates/CertificatePreview";

function buildProps(overrides: Partial<CertificatePreviewProps> = {}): CertificatePreviewProps {
  return {
    title: "StarLiz Spring Term Completion Certificate",
    studentDisplayName: "J***",
    certificateType: "term_completion",
    typeLabel: "Term Certificate",
    yearGroup: "Year 5",
    keyStage: "KS2",
    term: "Spring",
    subject: null,
    strand: null,
    awardType: null,
    awardScope: null,
    issuedAt: "2026-03-20T10:20:30.000Z",
    certificateNumber: "SLA-2026-TC-SPR-05-AAAAAA",
    verificationCode: "SV-AAAAAA",
    verificationUrl: "/certificates/verify/SV-AAAAAA",
    status: "issued",
    ...overrides,
  };
}

function renderPreview(overrides: Partial<CertificatePreviewProps> = {}): string {
  return renderToStaticMarkup(React.createElement(CertificatePreview, buildProps(overrides)));
}

test("normal certificate preview shows title, number, and verification code", () => {
  const html = renderPreview();
  assert.match(html, /Certificate of Term Completion/);
  assert.match(html, /SLA-2026-TC-SPR-05-AAAAAA/);
  assert.match(html, /SV-AAAAAA/);
});

test("award certificate preview shows award metadata", () => {
  const html = renderPreview({
    certificateType: "award_certificate",
    typeLabel: "Award Certificate",
    awardType: "most_improved_year_group",
    awardScope: "year_group",
  });
  assert.match(html, /Award type:/);
  assert.match(html, /most improved year group/i);
  assert.match(html, /Award scope:/);
  assert.match(html, /year group/i);
  assert.match(html, /This award is presented in recognition of outstanding progress, commitment, and achievement\./);
});

test("english strand certificate shows subject English and strand", () => {
  const html = renderPreview({
    certificateType: "english_achievement",
    typeLabel: "English Certificate",
    subject: "English",
    strand: "reading-comprehension",
  });
  assert.match(html, /Subject:\s*<span[^>]*>English<\/span>/);
  assert.match(html, /English strand:/);
  assert.match(html, /Reading Comprehension/);
});

test("revoked certificate displays revoked status", () => {
  const html = renderPreview({ status: "revoked" });
  assert.match(html, /Status:\s*revoked/i);
});

test("preview does not include sensitive student data", () => {
  const html = renderPreview({ studentDisplayName: "J***" });
  assert.doesNotMatch(html, /studentId/i);
  assert.doesNotMatch(html, /Jane Morgan/);
  assert.match(html, /J\*\*\*/);
});

test("verification link is present", () => {
  const html = renderPreview({ verificationUrl: "/certificates/verify/SV-LINK01", verificationCode: "SV-LINK01" });
  assert.match(html, /Verification link:/);
  assert.match(html, /href="\/certificates\/verify\/SV-LINK01"/);
});

test("no PDF or download button is rendered", () => {
  const html = renderPreview();
  assert.doesNotMatch(html, /Download PDF/i);
  assert.doesNotMatch(html, /Download Certificate/i);
});