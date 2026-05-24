import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import CertificateVerificationBadge from "../src/components/certificates/CertificateVerificationBadge";
import { buildCertificateExportPayload, buildCertificateExportHtml, type CertificateExportInput } from "../src/lib/certificate-pdf-export";
import { canIssueCertificate } from "../src/lib/certificate-issuing";
import type { CertificateEligibilityResult } from "../src/lib/certificate-eligibility";

function renderBadge(overrides: Partial<React.ComponentProps<typeof CertificateVerificationBadge>> = {}): string {
  return renderToStaticMarkup(React.createElement(CertificateVerificationBadge, {
    certificateNumber: "SLA-2026-TC-SPR-04-ABCDEF",
    verificationCode: "SV-ABCDEF",
    verificationUrl: "/certificates/verify/SV-ABCDEF",
    status: "issued",
    ...overrides,
  }));
}

function exportInput(overrides: Partial<CertificateExportInput> = {}): CertificateExportInput {
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

function eligibility(overrides: Partial<CertificateEligibilityResult> = {}): CertificateEligibilityResult {
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
    suggestedCertificateTitle: "Certificate of Term Completion",
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

test("verification badge shows certificate number", () => {
  const html = renderBadge();
  assert.match(html, /SLA-2026-TC-SPR-04-ABCDEF/);
});

test("verification badge shows verification code", () => {
  const html = renderBadge();
  assert.match(html, /SV-ABCDEF/);
});

test("verification badge shows verification URL", () => {
  const html = renderBadge();
  assert.match(html, /certificates\/verify\/SV-ABCDEF/);
});

test("valid or issued badge shows non-revoked status", () => {
  const validHtml = renderBadge({ status: "valid" });
  const issuedHtml = renderBadge({ status: "issued" });
  assert.match(validHtml, />valid</i);
  assert.match(issuedHtml, />issued</i);
});

test("revoked badge shows revoked status", () => {
  const html = renderBadge({ status: "revoked" });
  assert.match(html, />revoked</i);
});

test("badge does not expose sensitive student data", () => {
  const html = renderBadge();
  assert.doesNotMatch(html, /studentId/i);
  assert.doesNotMatch(html, /Jane Morgan/i);
});

test("print export includes verification badge and QR placeholder fields", () => {
  const payloadResult = buildCertificateExportPayload(exportInput());
  assert.equal(payloadResult.ok, true);
  if (!payloadResult.ok) return;

  assert.equal(payloadResult.payload.verificationBadgeLabel, "Verified Certificate");
  assert.equal(payloadResult.payload.qrPlaceholderLabel, "Scan or visit verification link");

  const html = buildCertificateExportHtml(payloadResult.payload);
  assert.match(html, /Verified Certificate/);
  assert.match(html, /QR placeholder/i);
  assert.match(html, /Scan or visit verification link/i);
});

test("issuing rules are unchanged", () => {
  const eligibleResult = canIssueCertificate(eligibility({ status: "eligible", blockers: [] }));
  assert.equal(eligibleResult.ok, true);

  const blockedResult = canIssueCertificate(eligibility({ status: "pending_exam", blockers: ["Exam pending"] }));
  assert.equal(blockedResult.ok, false);
  if (blockedResult.ok) return;
  assert.equal(blockedResult.eligibilityStatus, "pending_exam");
});
