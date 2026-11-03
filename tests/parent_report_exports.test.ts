import assert from "node:assert/strict";
import test from "node:test";

import {
  renderParentProgressReportCsv,
  renderParentProgressReportExcel,
  renderParentProgressReportPdf,
  type ParentProgressReportData,
} from "../src/lib/reports/parent-progress-report";

test("parent report exports generate valid PDF, CSV and Excel", () => {
  const report = {
    generatedAt: new Date().toISOString(),
    range: "30d",

    branding: {
      productName: "StarLiz Academy",
      reportName: "Parent Progress Report",
    },

    parent: {
      id: "test-parent",
      name: "Test Parent",
      email: "parent@example.com",
    },

    child: {
      id: "test-child",
      name: "Coding Test Learner",
      age: 10,
      yearGroup: "Year 5",
      level: 5,
    },

    summary: {
      totalAttempts: 9,
      averageAccuracy: 100,
      learningMode: "coding",
      lastActivityAt: null,
      revisionProgressPct: 100,
      examReadinessPct: null,
      weakTopicCount: 0,
      interventionTrackingCount: 0,
    },

    strengths: [],
    weakAreas: [],
    activity: [],

    rewards: {
      balancePence: 0,
      earnedPence: 0,
      spentPence: 0,
    },

    recommendations: [
      "Continue learning new coding skills.",
    ],

    academicIntelligence: {
      masteryStatus: "on_track",
      curriculumCoverage: "1/1 covered",
      catchUpRequired: 0,
      catchUpCompleted: 0,
      unresolvedCatchUp: 0,
      assessmentRecommended: 0,
      weakTopic: null,
      overdueRevision: 0,
      gcseReadiness: null,
      parentAdminRecommendedAction: "Continue learning.",
      graphSummary: {
        recommendationReasons: [],
        parentSummary: "Learning is on track.",
        reportSignals: [],
      },
    },

    attendanceSummary: {
      linkedToSchool: false,
      windowDays: 30,
      recordedMarks: 0,
      counts: {
        present: 0,
        late: 0,
        absent: 0,
        authorised_absence: 0,
        medical: 0,
      },
      presentRatePct: null,
      lateRatePct: null,
      absentRatePct: null,
    },

    focusTopics: [],
  } as unknown as ParentProgressReportData;

  const csv = renderParentProgressReportCsv(report);
  const excel = renderParentProgressReportExcel(report);
  const pdf = renderParentProgressReportPdf(report);

  assert.ok(csv.length > 0);
  assert.ok(excel.length > 0);
  assert.ok(pdf.byteLength > 0);

  assert.match(csv, /Coding Test Learner/);
  assert.match(excel, /Coding Test Learner/);

  assert.doesNotMatch(
    csv,
    /Needs more practice: Understanding Loops/i,
  );

  assert.doesNotMatch(
    excel,
    /Needs more practice: Understanding Loops/i,
  );

  assert.equal(
    Buffer.from(pdf).subarray(0, 5).toString("ascii"),
    "%PDF-",
  );
});
