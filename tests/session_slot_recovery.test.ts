import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMissingSlotGenerationRequest,
  mergeGeneratedIntoEmptySlots,
  summarizeSessionSlots,
} from "../src/lib/session-slot-recovery";

test("empty slot recovery detects missing slots", () => {
  const summary = summarizeSessionSlots([
    { prompt: "Q1", answer: "A1" },
    { question: "Q2", answer: "A2" },
    {},
    {},
  ]);

  assert.equal(summary.totalSlots, 4);
  assert.equal(summary.filledSlots, 2);
  assert.equal(summary.missingSlots, 2);
  assert.deepEqual(summary.emptySlotIndexes, [2, 3]);
});

test("generate missing slots merge preserves existing filled slots", () => {
  const slotOne = { prompt: "Keep slot 1", answer: "1" };
  const slotTwo = { prompt: "Keep slot 2", answer: "2" };
  const existing = [slotOne, slotTwo, {}, {}];

  const merged = mergeGeneratedIntoEmptySlots({
    existingItems: existing,
    generatedItems: [
      { prompt: "New slot 3", answer: "3" },
      { prompt: "New slot 4", answer: "4" },
    ],
  });

  assert.deepEqual(merged.mergedItems[0], slotOne);
  assert.deepEqual(merged.mergedItems[1], slotTwo);
  assert.equal(merged.replacedCount, 2);
  assert.equal(merged.summary.filledSlots, 4);
  assert.equal(merged.summary.missingSlots, 0);
});

test("generation request uses missing slot count and lesson metadata", () => {
  const request = buildMissingSlotGenerationRequest({
    context: {
      subject: "math",
      keyStage: "KS2",
      yearGroup: "Year 4",
      ageGroup: "8-9",
      examBoard: "None",
      level: 5,
      topic: "Exam-style questions",
      skillFocus: "Multiplication facts",
      curriculumPathway: "uk-nc",
      module: "Number",
      contentType: "math",
      avoidPrompts: ["2 x 3"],
    },
    missingSlots: 5,
  });

  assert.equal(request.subject, "math");
  assert.equal(request.keyStage, "KS2");
  assert.equal(request.yearGroup, "Year 4");
  assert.equal(request.ageGroup, "8-9");
  assert.equal(request.examBoard, "None");
  assert.equal(request.numberOfItems, 5);
  assert.equal(request.lessonFormat, "math");
  assert.equal(request.questionStyle, "same_lesson_session_format");
});
