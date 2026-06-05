import assert from "node:assert/strict";
import test from "node:test";

import { buildAiGeneratorUrl } from "../src/lib/admin-ai-generator-url";

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
