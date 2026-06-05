import assert from "node:assert/strict";
import test from "node:test";

import { buildAiGeneratorUrl } from "../src/lib/admin-ai-generator-url";

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

  assert.equal(
    href,
    "/admin/ai-generator?studentId=student-1&subject=english-language&skill=Inference&strand=reading&englishStrand=reading&topic=Inference+from+context&activityType=targeted+practice&masteryOutcome=Improve+reading+inference&source=student-profile&weakAreaId=weak-1&yearGroup=Year+5&keyStage=KS2&difficulty=3&itemCount=6"
  );
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
