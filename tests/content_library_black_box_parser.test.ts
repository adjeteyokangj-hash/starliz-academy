import assert from "node:assert/strict";
import test from "node:test";

import type { ContentItem } from "../src/components/admin/content-library/types";
import { parseBlackBoxContentTest, parseBlackBoxRuntimeTest } from "../src/components/admin/content-library/utils";

function makeContentItem(metadata: unknown): ContentItem {
  return {
    id: "content-1",
    contentType: "maths",
    level: 3,
    topic: "Fractions",
    contentJson: "[]",
    usedCount: 0,
    createdAt: "2026-06-11T00:00:00.000Z",
    createdBy: "test@example.com",
    status: "generated",
    metadataJson: JSON.stringify(metadata),
  };
}

test("content library black box parser normalises old raw score shape", () => {
  const result = parseBlackBoxContentTest(makeContentItem({
    blackBoxContentTest: {
      decision: "APPROVE",
      score: 438,
      maxScore: 500,
      reasons: [],
    },
  }));

  assert.equal(result?.score, 88);
  assert.equal(result?.rawScore, 438);
  assert.equal(result?.rawMaxScore, 500);
});

test("content library black box parser keeps new normalised score shape", () => {
  const result = parseBlackBoxContentTest(makeContentItem({
    blackBoxContentTest: {
      decision: "NEEDS_ADMIN_REVIEW",
      score: 88,
      maxScore: 100,
      reasons: ["Admin review is required."],
    },
  }));

  assert.equal(result?.score, 88);
  assert.equal(result?.maxScore, 100);
});

test("content library black box parser exposes score cap diagnostics", () => {
  const result = parseBlackBoxContentTest(makeContentItem({
    blackBoxContentTest: {
      decision: "NEEDS_ADMIN_REVIEW",
      score: 74,
      maxScore: 100,
      scoreCap: {
        capPercent: 74,
        reason: "Score capped at 74 because 7/10 items show level/difficulty/readability/answer-depth warnings.",
        warningItemCount: 7,
        totalItemCount: 10,
      },
    },
  }));

  assert.equal(result?.scoreCap?.capPercent, 74);
  assert.equal(result?.scoreCap?.warningItemCount, 7);
  assert.equal(result?.scoreCap?.totalItemCount, 10);
  assert.match(result?.scoreCap?.reason ?? "", /Score capped at 74/i);
});

test("content library black box parser prefers pass rate score shape", () => {
  const result = parseBlackBoxContentTest(makeContentItem({
    blackBoxContentTest: {
      decision: "APPROVE",
      score: 12,
      maxScore: 99,
      passRate: 0.876,
      reasons: [],
    },
  }));

  assert.equal(result?.score, 88);
  assert.equal(result?.passRate, 0.876);
});

test("content library black box parser supports recommendation fallback", () => {
  const result = parseBlackBoxContentTest(makeContentItem({
    blackBoxContentTest: {
      decision: "RECLASSIFY",
      score: 88,
      recommendation: {
        subject: "reading",
        strand: "reading",
        reasons: ["Detected reading content."],
      },
    },
  }));

  assert.equal(result?.reclassificationRecommendation?.subject, "reading");
  assert.equal(result?.reclassificationRecommendation?.strand, "reading");
  assert.deepEqual(result?.reclassificationRecommendation?.reasons, ["Detected reading content."]);
});

test("content library black box parser exposes item level recommendation", () => {
  const result = parseBlackBoxContentTest(makeContentItem({
    blackBoxContentTest: {
      decision: "NEEDS_ADMIN_REVIEW",
      score: 82,
      maxScore: 100,
      itemChecks: [{
        itemIndex: 0,
        score: 80,
        declaredLevel: 2,
        estimatedLevel: 4,
        recommendedLevel: 4,
        levelDelta: 2,
        levelRecommendation: {
          action: "promote",
          amount: 2,
          reason: "Increase question difficulty by 2 levels.",
        },
        reasons: ["Item appears too easy for the selected level."],
      }],
    },
  }));

  const itemCheck = result?.itemChecks?.[0];
  assert.equal(itemCheck?.declaredLevel, 2);
  assert.equal(itemCheck?.estimatedLevel, 4);
  assert.equal(itemCheck?.recommendedLevel, 4);
  assert.equal(itemCheck?.levelDelta, 2);
  assert.equal(itemCheck?.levelRecommendation?.action, "promote");
});

test("runtime parser ignores content-only blackBoxLiveTest metadata", () => {
  const result = parseBlackBoxRuntimeTest(makeContentItem({
    blackBoxLiveTest: {
      status: "passed",
      score: 90,
      reasons: ["Content test passed."],
    },
  }));

  assert.equal(result, null);
});

test("runtime parser prefers explicit runtime metadata", () => {
  const result = parseBlackBoxRuntimeTest(makeContentItem({
    blackBoxLiveTest: {
      status: "passed",
      score: 90,
      reasons: ["Content test passed."],
    },
    blackBoxRuntimeTest: {
      status: "not_run",
      reasons: ["Runtime simulation pending."],
      testedAt: "2026-06-18T08:30:00.000Z",
    },
  }));

  assert.equal(result?.status, "not_run");
  assert.deepEqual(result?.reasons, ["Runtime simulation pending."]);
});
