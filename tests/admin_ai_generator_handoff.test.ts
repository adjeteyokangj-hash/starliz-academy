import assert from "node:assert/strict";
import test from "node:test";

import { buildAiGeneratorUrl } from "../src/lib/admin-ai-generator-url";
import { decodeUniversalPrefillContract } from "../src/lib/ai-prefill-contract";

function paramsFor(href: string): URLSearchParams {
  return new URL(`https://starliz.test${href}`).searchParams;
}

test("buildAiGeneratorUrl includes supported student target query params", () => {
  const href = buildAiGeneratorUrl({
    studentId: "student-1",
    subject: "english-language",
    skill: "Inference",
    strand: "reading",
    englishStrand: "reading",
    topic: "Inference from context",
    activityType: "targeted practice",
    masteryOutcome: "Improve reading inference",
    source: "student-profile",
    weakAreaId: "weak-1",
    yearGroup: "Year 5",
    keyStage: "KS2",
    studentYearGroup: "Year 6",
    studentKeyStage: "KS2",
    targetLearningYearGroup: "Year 5",
    targetLearningKeyStage: "KS2",
    subjectLevel: 5,
    strandLevel: 5,
    levelSource: "progression",
    adminOverrideReason: "Testing override metadata",
    difficulty: 3,
    itemCount: 6,
  });

  const params = paramsFor(href);

  assert.equal(href.startsWith("/admin/ai-generator?"), true);
  assert.equal(params.get("studentId"), "student-1");
  assert.equal(params.get("subject"), "english-language");
  assert.equal(params.get("skill"), "Inference");
  assert.equal(params.get("strand"), "reading");
  assert.equal(params.get("englishStrand"), "reading");
  assert.equal(params.get("topic"), "Inference from context");
  assert.equal(params.get("activityType"), "targeted practice");
  assert.equal(params.get("masteryOutcome"), "Improve reading inference");
  assert.equal(params.get("source"), "student-profile");
  assert.equal(params.get("weakAreaId"), "weak-1");
  assert.equal(params.get("yearGroup"), "Year 5");
  assert.equal(params.get("keyStage"), "KS2");
  assert.equal(params.get("studentYearGroup"), "Year 6");
  assert.equal(params.get("studentKeyStage"), "KS2");
  assert.equal(params.get("targetLearningYearGroup"), "Year 5");
  assert.equal(params.get("targetLearningKeyStage"), "KS2");
  assert.equal(params.get("subjectLevel"), "5");
  assert.equal(params.get("strandLevel"), "5");
  assert.equal(params.get("levelSource"), "progression");
  assert.equal(params.get("adminOverrideReason"), "Testing override metadata");
  assert.equal(params.get("difficulty"), "3");
  assert.equal(params.get("itemCount"), "6");
});

test("buildAiGeneratorUrl omits empty and invalid values", () => {
  assert.equal(
    buildAiGeneratorUrl({
      studentId: " ",
      subject: "maths",
      difficulty: 0,
      itemCount: "not-a-number",
    }),
    "/admin/ai-generator?subject=maths"
  );
});

test("buildAiGeneratorUrl maps English strand targets to parent English context", () => {
  const href = buildAiGeneratorUrl({
    studentId: "student-1",
    subject: "grammar",
    skill: "Grammar",
    strand: "Grammar",
    englishStrand: "Grammar",
    topic: "Grammar placement needs a generated lesson",
    source: "student-profile",
    yearGroup: "Year 4",
    keyStage: "KS2",
    difficulty: 3,
  });

  const params = paramsFor(href);

  assert.equal(params.get("subject"), "english-language");
  assert.equal(params.get("strand"), "grammar");
  assert.equal(params.get("englishStrand"), "grammar");
  assert.equal(params.get("skill"), "Grammar");
  assert.equal(params.get("topic"), "Grammar placement needs a generated lesson");
  assert.equal(params.get("yearGroup"), "Year 4");
  assert.equal(params.get("keyStage"), "KS2");
});

test("buildAiGeneratorUrl maps comprehension targets to parent English context", () => {
  const href = buildAiGeneratorUrl({
    studentId: "student-1",
    subject: "comprehension",
    skill: "Retrieval",
    strand: "Comprehension",
    topic: "Reading comprehension practice",
    source: "student-profile",
    yearGroup: "Year 1",
    keyStage: "KS1",
  });

  const params = paramsFor(href);

  assert.equal(params.get("subject"), "english-language");
  assert.equal(params.get("strand"), "comprehension");
  assert.equal(params.get("englishStrand"), "comprehension");
  assert.equal(params.get("skill"), "Retrieval");
  assert.equal(params.get("yearGroup"), "Year 1");
  assert.equal(params.get("keyStage"), "KS1");
});

test("buildAiGeneratorUrl serializes universal prefill contract when provided", () => {
  const href = buildAiGeneratorUrl({
    subject: "maths",
    prefillContract: {
      version: 1,
      trigger: "student-target",
      studentId: "student-2",
      fields: {
        yearGroup: { value: "Year 6", source: "student", confidence: "high" },
        keyStage: { value: "KS2", source: "curriculum", confidence: "high" },
        subject: { value: "maths", source: "prediction", confidence: "high" },
      },
      warnings: [],
      blockingIssues: [],
    },
  });

  const params = paramsFor(href);
  const encoded = params.get("prefillContract");
  assert.ok(encoded);
  const decoded = decodeUniversalPrefillContract(encoded);
  assert.ok(decoded);
  assert.equal(decoded?.trigger, "student-target");
  assert.equal(decoded?.studentId, "student-2");
  assert.equal(decoded?.fields.subject?.value, "maths");
});

test("buildAiGeneratorUrl keeps student year separate from Year 3 grammar target", () => {
  const href = buildAiGeneratorUrl({
    studentId: "student-year-4",
    subject: "english-language",
    skill: "Grammar",
    strand: "grammar",
    englishStrand: "grammar",
    topic: "Grammar placement needs a generated lesson",
    source: "student-profile",
    yearGroup: "Year 3",
    keyStage: "KS2",
    studentYearGroup: "Year 4",
    studentKeyStage: "KS2",
    targetLearningYearGroup: "Year 3",
    targetLearningKeyStage: "KS2",
    subjectLevel: 3,
    strandLevel: 3,
    levelSource: "progression",
  });

  const params = paramsFor(href);

  assert.equal(params.get("yearGroup"), "Year 3");
  assert.equal(params.get("keyStage"), "KS2");
  assert.equal(params.get("studentYearGroup"), "Year 4");
  assert.equal(params.get("studentKeyStage"), "KS2");
  assert.equal(params.get("targetLearningYearGroup"), "Year 3");
  assert.equal(params.get("targetLearningKeyStage"), "KS2");
  assert.equal(params.get("subjectLevel"), "3");
  assert.equal(params.get("strandLevel"), "3");
});

test("buildAiGeneratorUrl keeps student year separate from lower maths target", () => {
  const href = buildAiGeneratorUrl({
    studentId: "student-year-6",
    subject: "maths",
    skill: "Maths",
    topic: "Maths placement needs a generated lesson",
    source: "student-profile",
    yearGroup: "Year 3",
    keyStage: "KS2",
    studentYearGroup: "Year 6",
    studentKeyStage: "KS2",
    targetLearningYearGroup: "Year 3",
    targetLearningKeyStage: "KS2",
    subjectLevel: 3,
    levelSource: "progression",
  });

  const params = paramsFor(href);

  assert.equal(params.get("subject"), "maths");
  assert.equal(params.get("yearGroup"), "Year 3");
  assert.equal(params.get("studentYearGroup"), "Year 6");
  assert.equal(params.get("targetLearningYearGroup"), "Year 3");
  assert.equal(params.get("subjectLevel"), "3");
});

test("buildAiGeneratorUrl preserves legacy yearGroup as target learning alias", () => {
  const href = buildAiGeneratorUrl({
    subject: "maths",
    skill: "Place value",
    yearGroup: "Year 3",
    keyStage: "KS2",
    source: "student-profile",
  });

  const params = paramsFor(href);

  assert.equal(params.get("yearGroup"), "Year 3");
  assert.equal(params.get("keyStage"), "KS2");
  assert.equal(params.get("targetLearningYearGroup"), null);
});
