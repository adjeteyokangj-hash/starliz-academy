import assert from "node:assert/strict";
import test from "node:test";

import type { ContentItem } from "../src/components/admin/content-library/types";
import { parseBlackBoxContentTest } from "../src/components/admin/content-library/utils";

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
