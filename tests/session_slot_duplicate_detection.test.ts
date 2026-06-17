import assert from "node:assert/strict";
import test from "node:test";

import { analyzeSessionSlotDuplicates } from "../src/lib/session-slot-duplicates";

test("farmer apples duplicate is detected as near duplicate and same pattern", () => {
  const result = analyzeSessionSlotDuplicates({
    contentType: "math",
    contentJson: JSON.stringify([
      { prompt: "A farmer packs 24 apples into boxes of 6. How many boxes are needed?", answer: "4" },
      { prompt: "A farmer fills boxes with 24 apples, 6 per box. How many boxes does he fill?", answer: "4" },
    ]),
  });

  assert.equal(result.hasExactDuplicates, false);
  assert.ok(result.nearCount >= 1);
  assert.ok(result.samePatternCount >= 1);
  assert.ok(result.duplicateSlotsCount >= 2);
});

test("school bus duplicate is detected as same pattern", () => {
  const result = analyzeSessionSlotDuplicates({
    contentType: "math",
    contentJson: JSON.stringify([
      { prompt: "A school bus has 24 pupils and seats 6 in each row. How many rows are needed?", answer: "4" },
      { prompt: "24 pupils are arranged in rows of 6 on a bus. How many rows are there?", answer: "4" },
    ]),
  });

  assert.equal(result.hasExactDuplicates, false);
  assert.ok(result.samePatternCount >= 1);
});

test("exact duplicate prompt is detected", () => {
  const result = analyzeSessionSlotDuplicates({
    contentType: "math",
    contentJson: JSON.stringify([
      { prompt: "What is 18 divided by 3?", answer: "6" },
      { prompt: "What is 18 divided by 3?", answer: "6" },
    ]),
  });

  assert.equal(result.hasExactDuplicates, true);
  assert.equal(result.exactCount, 1);
});

test("genuinely different questions are not flagged as duplicates", () => {
  const result = analyzeSessionSlotDuplicates({
    contentType: "math",
    contentJson: JSON.stringify([
      { prompt: "What is 15 + 7?", answer: "22" },
      { prompt: "A baker has 48 cupcakes and sells 19. How many remain?", answer: "29" },
      { prompt: "Solve: 4 x 9", answer: "36" },
    ]),
  });

  assert.equal(result.exactCount, 0);
  assert.equal(result.nearCount, 0);
  assert.equal(result.samePatternCount, 0);
  assert.equal(result.duplicateSlotsCount, 0);
});
