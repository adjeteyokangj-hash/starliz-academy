import test from "node:test";
import assert from "node:assert/strict";

import { buildCertificateAnalytics } from "../src/lib/certificate-analytics";
import { defaultCertificateTemplateSettings } from "../src/lib/certificate-template-settings";
import type { IssuedCertificateRecord } from "../src/lib/certificate-issuing";

function issued(overrides: Partial<IssuedCertificateRecord> = {}): IssuedCertificateRecord {
  return {
    id: "cert-1",
    certificateNumber: "SLA-2026-TC-SPR-04-AAAAAA",
    verificationCode: "SV-AAAAAA",
    certificateType: "term_completion",
    title: "Certificate of Term Completion",
    studentId: "child-1",
    studentName: "Jane Morgan",
    yearGroup: "Year 4",
    keyStage: "KS2",
    term: "Spring",
    status: "issued",
    issuedAt: "2026-05-01T10:00:00.000Z",
    evidenceSummary: {
      placementCompleted: true,
      selectedSubjects: 3,
      requiredScopeCount: 3,
      scopesWithAssignments: 3,
      completedAssignments: 10,
      totalAssignments: 10,
      quizAttemptCount: 12,
      activeWeakAreas: 0,
      secureProgressionCount: 3,
      examAttempts: 1,
      passedExamAttempts: 1,
    },
    subjectBreakdown: [],
    verificationUrl: "/certificates/verify/SV-AAAAAA",
    ...overrides,
  };
}

test("buildCertificateAnalytics counts issued/revoked/award and template usage", () => {
  const analytics = buildCertificateAnalytics({
    certificates: [
      issued(),
      issued({ id: "cert-2", certificateType: "award_certificate", status: "issued" }),
      issued({ id: "cert-3", certificateType: "award_certificate", status: "revoked" }),
    ],
    pendingCertificates: 2,
    templateSettings: defaultCertificateTemplateSettings,
    verificationEvents: [],
  });

  assert.equal(analytics.issuedCertificates, 2);
  assert.equal(analytics.revokedCertificates, 1);
  assert.equal(analytics.awardCertificates, 2);
  assert.equal(analytics.pendingCertificates, 2);

  const awardUsage = analytics.templateUsage.find((row) => row.certificateType === "award_certificate");
  assert.ok(awardUsage);
  assert.equal(awardUsage?.template, "gold_award");
  assert.equal(awardUsage?.issuedCount, 1);
  assert.equal(awardUsage?.revokedCount, 1);
});

test("buildCertificateAnalytics summarizes verification activity", () => {
  const analytics = buildCertificateAnalytics({
    certificates: [],
    pendingCertificates: 0,
    templateSettings: defaultCertificateTemplateSettings,
    verificationEvents: [
      { verificationCode: "SV-1", status: "valid", createdAt: "2026-05-02T00:00:00.000Z" },
      { verificationCode: "SV-2", status: "revoked", createdAt: "2026-05-03T00:00:00.000Z" },
      { verificationCode: "SV-3", status: "not_found", createdAt: "2026-05-04T00:00:00.000Z" },
    ],
  });

  assert.equal(analytics.verificationActivity.total, 3);
  assert.equal(analytics.verificationActivity.valid, 1);
  assert.equal(analytics.verificationActivity.revoked, 1);
  assert.equal(analytics.verificationActivity.notFound, 1);
  assert.equal(analytics.verificationActivity.recent[0]?.verificationCode, "SV-3");
});
