import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeContentSessionSlots,
  getIncompleteSlotsReason,
  isGaLessonContent,
  isQuestionSlotFilled,
} from "../src/lib/session-slot-validation";

test("slot analyzer counts filled and missing academic slots", () => {
  const result = analyzeContentSessionSlots({
    contentType: "math",
    contentJson: JSON.stringify([
      { prompt: "2 + 2", answer: 4 },
      { question: "3 + 5", answer: 8 },
      {},
      null,
    ]),
  });

  assert.equal(result.slotValidationExempt, false);
  assert.equal(result.totalSlots, 4);
  assert.equal(result.filledSlots, 2);
  assert.equal(result.missingSlots, 2);
  assert.equal(result.isSessionComplete, false);
});

test("slot analyzer marks complete when all slots are filled", () => {
  const result = analyzeContentSessionSlots({
    contentType: "reading",
    contentJson: JSON.stringify([
      { question: "Q1", answer: "A1", passage: "P1" },
      { question: "Q2", answer: "A2", passage: "P2" },
    ]),
  });

  assert.equal(result.totalSlots, 2);
  assert.equal(result.filledSlots, 2);
  assert.equal(result.missingSlots, 0);
  assert.equal(result.isSessionComplete, true);
});

test("ga content is exempt from slot completeness rules", () => {
  const result = analyzeContentSessionSlots({
    contentType: "ga",
    metadataJson: JSON.stringify({ subject: "ga" }),
    contentJson: JSON.stringify([
      {},
      {},
    ]),
  });

  assert.equal(result.slotValidationExempt, true);
  assert.equal(result.isSessionComplete, true);
});

test("slot fill helper detects prompt-like fields", () => {
  assert.equal(isQuestionSlotFilled({ prompt: "Solve 3 + 2" }), true);
  assert.equal(isQuestionSlotFilled({ question: "What is 4 + 4?" }), true);
  assert.equal(isQuestionSlotFilled({ word: "apple" }), true);
  assert.equal(isQuestionSlotFilled({ answer: "5" }), false);
  assert.equal(isQuestionSlotFilled({}), false);
});

test("ga lesson detector checks multiple signals", () => {
  assert.equal(isGaLessonContent({ contentType: "ga" }), true);
  assert.equal(isGaLessonContent({ metadataJson: JSON.stringify({ subject: "Ga" }) }), true);
  assert.equal(isGaLessonContent({ subject: "math" }), false);
});

test("incomplete reason matches required wording", () => {
  assert.equal(getIncompleteSlotsReason(3), "3 question slots still require content.");
});
