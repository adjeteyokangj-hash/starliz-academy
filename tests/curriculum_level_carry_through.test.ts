import assert from "node:assert/strict";
import test from "node:test";

import { buildAiGeneratorUrl } from "../src/lib/admin-ai-generator-url";
import {
  assignmentMismatchWarningFlags,
  placementSupportsAssignment,
} from "../src/lib/assignments";
import { supportedContentYearGroups } from "../src/lib/curriculum-level-targets";
import { generateWeeklyHomeworkBatch } from "../src/lib/homework-phase1a/generation";
import { resolveRecoveryCurriculumTarget } from "../src/lib/recovery_orchestrator_runtime";

const FRIDAY = new Date("2026-06-05T12:00:00.000Z");

test("Year 4 student below in Grammar defaults to Year 3 target through orchestration", () => {
  const aiHref = buildAiGeneratorUrl({
    studentId: "student-y4",
    subject: "english-language",
    englishStrand: "grammar",
    strand: "grammar",
    skill: "Grammar",
    yearGroup: "Year 3",
    keyStage: "KS2",
    studentYearGroup: "Year 4",
    studentKeyStage: "KS2",
    targetLearningYearGroup: "Year 3",
    targetLearningKeyStage: "KS2",
    subjectLevel: 3,
    strandLevel: 3,
    source: "student-profile",
  });
  const params = new URL(`https://starliz.test${aiHref}`).searchParams;
  assert.equal(params.get("targetLearningYearGroup"), "Year 3");

  const assignmentAllowed = placementSupportsAssignment({
    contentSubject: "english-language",
    contentPathway: "primary",
    contentKeyStage: "KS2",
    contentYearGroup: "Year 3",
    contentLevel: 3,
    contentType: "grammar",
    contentStrand: "grammar",
    studentPathway: "primary",
    studentKeyStage: "KS2",
    studentYearGroup: "Year 4",
    studentLearningLevel: null,
    placementLevels: { "english:grammar": { accuracy: 45, level: "below" } },
  });
  assert.equal(assignmentAllowed, false);
  assert.deepEqual(assignmentMismatchWarningFlags({
    yearMismatch: true,
    keyStageMismatch: true,
    placementSupported: true,
    lowerLevelRemediation: true,
    adminOverride: false,
  }), ["year_mismatch", "lower_level_remediation"]);

  assert.ok(supportedContentYearGroups({
    studentYearGroup: "Year 4",
    placementLevels: { "english:grammar": { accuracy: 45, level: "below" } },
  }).includes("Year 3"));

  assert.equal(resolveRecoveryCurriculumTarget({
    studentYearGroup: "Year 4",
    weakAreaMetadata: { targetLearningYearGroup: "Year 3" },
  }).yearGroup, "Year 3");

  const homework = generateWeeklyHomeworkBatch({
    now: FRIDAY,
    timezone: "Europe/London",
    studentId: "student-y4",
    yearGroup: "Year 4",
    completedSessionCount: 2,
    startedSessionCount: 2,
    existingBatchForWeek: false,
    weaknesses: [{
      id: "grammar-y2",
      subject: "english",
      topic: "grammar",
      skill: "sentence structure",
      targetLearningYearGroup: "Year 3",
      targetLearningKeyStage: "KS2",
      studentYearGroup: "Year 4",
      estimatedMinutes: 5,
      repeatedMistakes: 5,
      averageScore: 38,
      coreTopicWeakness: true,
      masteryGap: true,
      coachUsageCount: 0,
      completionIssueCount: 0,
      previousHomeworkWeakness: false,
    }],
  });
  assert.equal(homework.created, true);
  if (homework.created) assert.equal(homework.batch.questions[0]?.targetLearningYearGroup, "Year 3");
});

test("explicit lower remediation evidence still allows Year 2 support for Year 4 grammar", () => {
  const years = supportedContentYearGroups({
    studentYearGroup: "Year 4",
    placementLevels: {
      "english:grammar": {
        accuracy: 45,
        level: "below",
        explicitLearningYearGroup: "Year 2",
      },
    },
  });

  assert.ok(years.includes("Year 2"));
});

test("Year 6 student at Year 3 Maths carries lower maths target and blocks unsupported Year 8", () => {
  assert.ok(supportedContentYearGroups({
    studentYearGroup: "Year 6",
    placementLevels: { maths: { accuracy: 72, level: "secure" } },
  }).includes("Year 3"));

  assert.equal(placementSupportsAssignment({
    contentSubject: "maths",
    contentPathway: "ks2",
    contentKeyStage: "KS2",
    contentYearGroup: "Year 3",
    contentLevel: 3,
    contentType: "maths",
    contentStrand: null,
    studentPathway: "ks2",
    studentKeyStage: "KS2",
    studentYearGroup: "Year 6",
    studentLearningLevel: null,
    placementLevels: { maths: { accuracy: 72, level: "secure" } },
  }), true);

  assert.equal(placementSupportsAssignment({
    contentSubject: "maths",
    contentPathway: "ks3",
    contentKeyStage: "KS3",
    contentYearGroup: "Year 8",
    contentLevel: 8,
    contentType: "maths",
    contentStrand: null,
    studentPathway: "ks2",
    studentKeyStage: "KS2",
    studentYearGroup: "Year 6",
    studentLearningLevel: null,
    placementLevels: {},
  }), false);
});

test("Year 9 student at Year 6 Reading lower remediation requires evidence and keeps warnings visible", () => {
  assert.equal(placementSupportsAssignment({
    contentSubject: "reading",
    contentPathway: "primary",
    contentKeyStage: "KS2",
    contentYearGroup: "Year 6",
    contentLevel: 6,
    contentType: "reading",
    contentStrand: "reading",
    studentPathway: "ks3",
    studentKeyStage: "KS3",
    studentYearGroup: "Year 9",
    studentLearningLevel: "Level 6",
    placementLevels: {},
  }), true);

  assert.deepEqual(assignmentMismatchWarningFlags({
    yearMismatch: true,
    keyStageMismatch: true,
    placementSupported: true,
    lowerLevelRemediation: true,
    adminOverride: false,
  }), ["year_mismatch", "lower_level_remediation"]);
});
