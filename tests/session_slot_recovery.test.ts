import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMissingSlotRecoveryPlan,
  buildMissingSlotGenerationRequest,
  formatMissingSlotRecoveryDiagnostics,
  mergeGeneratedIntoEmptySlots,
  selectBestMissingSlotCandidates,
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
    aiMode: "fallback_only",
  });

  assert.equal(request.subject, "maths");
  assert.equal(request.keyStage, "KS2");
  assert.equal(request.yearGroup, "Year 4");
  assert.equal(request.ageGroup, "8-9");
  assert.equal(request.examBoard, undefined);
  assert.equal(request.numberOfItems, 5);
  assert.equal(request.lessonFormat, "math");
  assert.equal(request.questionStyle, "same_lesson_session_format");
  assert.equal(request.aiMode, "fallback_only");
});

test("missing slot recovery plan generates larger internal candidate pool", () => {
  const oneMissing = buildMissingSlotRecoveryPlan({ missingSlots: 1 });
  const fiveMissing = buildMissingSlotRecoveryPlan({ missingSlots: 5 });

  assert.equal(oneMissing.targetSlots, 1);
  assert.equal(oneMissing.internalCandidateTarget >= 8, true);
  assert.equal(fiveMissing.targetSlots, 5);
  assert.equal(fiveMissing.internalCandidateTarget >= 30, true);
  assert.equal(fiveMissing.passes.length, 3);
});

test("generation request can request more candidates than missing slots", () => {
  const request = buildMissingSlotGenerationRequest({
    context: {
      subject: "math",
      level: 5,
      contentType: "math",
    },
    missingSlots: 1,
    candidatePoolSize: 10,
    questionStyles: ["direct_calculation", "word_problem"],
    passId: "alternative",
    passLabel: "Pass 2",
    aiMode: "openai_with_fallback",
  });

  assert.equal(request.numberOfItems, 10);
  assert.deepEqual(request.questionStyles, ["direct_calculation", "word_problem"]);
  assert.equal(request.generationPassId, "alternative");
});

test("generation request derives key stage from year group when key stage is missing", () => {
  const request = buildMissingSlotGenerationRequest({
    context: {
      subject: "reading",
      keyStage: "",
      yearGroup: "Year 4",
      level: 3,
      topic: "Inference",
      contentType: "reading",
    },
    missingSlots: 1,
    aiMode: "fallback_only",
  });

  assert.equal(request.yearGroup, "Year 4");
  assert.equal(request.keyStage, "KS2");
});

test("generation request falls back from empty skill focus to topic", () => {
  const request = buildMissingSlotGenerationRequest({
    context: {
      subject: "maths",
      keyStage: "",
      yearGroup: "Year 4",
      level: 3,
      topic: "Addition reasoning",
      skillFocus: "",
      contentType: "maths",
    },
    missingSlots: 2,
    aiMode: "openai_with_fallback",
  });

  assert.equal(request.keyStage, "KS2");
  assert.equal(request.topic, "Addition reasoning");
  assert.equal(request.skillFocus, "Addition reasoning");
});

test("generation request maps Year 4 reading to english-language with english strand", () => {
  const request = buildMissingSlotGenerationRequest({
    context: {
      subject: "reading",
      keyStage: "KS2",
      yearGroup: "Year 4",
      level: 3,
      topic: "Inference",
      skillFocus: "Retrieval and inference",
      contentType: "reading",
    },
    missingSlots: 1,
    aiMode: "live_openai_only",
  });

  assert.equal(request.subject, "english-language");
  assert.equal(request.englishStrand, "reading");
  assert.equal(request.yearGroup, "Year 4");
});

test("candidate selection filters duplicates and preserves same-level preference", () => {
  const existingItems = [
    { question: "6 x ? = 42", answer: "7", difficulty: 5, topic: "Missing Factors", skillFocus: "Missing Factors" },
    { question: "What is 8 x 7?", answer: "56", difficulty: 5, topic: "Missing Factors", skillFocus: "Missing Factors" },
    {},
    {},
  ] as Array<Record<string, unknown>>;

  const generatedItems = [
    { question: "6 x ? = 42", answer: "7", difficulty: 5, topic: "Missing Factors", skillFocus: "Missing Factors" },
    { question: "A school has 42 chairs in 6 equal rows. How many chairs in each row?", answer: "7", difficulty: 5, topic: "Missing Factors", skillFocus: "Missing Factors" },
    { question: "Find the missing number: ? x 7 = 42", answer: "6", difficulty: 5, topic: "Missing Factors", skillFocus: "Missing Factors" },
    { question: "Find the missing number: ? x 7 = 42", answer: "6", difficulty: 5, topic: "Missing Factors", skillFocus: "Missing Factors" },
    { question: "What is 12 + 6?", answer: "18", difficulty: 3, topic: "Addition", skillFocus: "Addition" },
  ] as Array<Record<string, unknown>>;

  const selection = selectBestMissingSlotCandidates({
    existingItems,
    generatedItems,
    missingSlots: 2,
    targetLevel: 5,
    topic: "Missing Factors",
    skillFocus: "Missing Factors",
  });

  assert.equal(selection.selectedItems.length, 2);
  assert.equal(selection.diagnostics.duplicatesRemoved >= 1, true);
  assert.equal(selection.diagnostics.levelMismatchRemoved >= 1, true);
  assert.equal(
    selection.diagnostics.duplicatesRemoved
      + selection.diagnostics.nearDuplicatesRemoved
      + selection.diagnostics.samePatternRemoved >= 2,
    true,
  );
  assert.equal(
    selection.selectedItems.every((item) => Number(item.difficulty ?? item.level) === 5),
    true,
  );
  assert.equal(selection.diagnostics.exhausted, false);
});

test("merge keeps final student-facing slot count unchanged", () => {
  const existing = [
    { question: "Keep slot 1", answer: "1" },
    { question: "Keep slot 2", answer: "2" },
    {},
  ] as Array<Record<string, unknown>>;

  const selection = selectBestMissingSlotCandidates({
    existingItems: existing,
    generatedItems: [
      { question: "Fill slot 3", answer: "3", difficulty: 5, topic: "Missing Factors", skillFocus: "Missing Factors" },
      { question: "Extra candidate", answer: "4", difficulty: 5, topic: "Missing Factors", skillFocus: "Missing Factors" },
    ],
    missingSlots: 1,
    targetLevel: 5,
    topic: "Missing Factors",
    skillFocus: "Missing Factors",
  });

  const merged = mergeGeneratedIntoEmptySlots({
    existingItems: existing,
    generatedItems: selection.selectedItems,
  });

  assert.equal(merged.mergedItems.length, existing.length);
  assert.equal(merged.summary.totalSlots, existing.length);
  assert.equal(merged.mergedItems[0].question, "Keep slot 1");
  assert.equal(merged.mergedItems[1].question, "Keep slot 2");
});

test("recovery diagnostics includes counters and exhaustion guidance", () => {
  const diagnostics = formatMissingSlotRecoveryDiagnostics({
    attempts: [
      {
        passId: "exact",
        passLabel: "Pass 1: exact-match generation",
        requestedCandidates: 4,
        generatedCandidates: 2,
      },
    ],
    selection: {
      targetSlots: 1,
      candidatesGenerated: 2,
      acceptedCandidates: 0,
      duplicatesRemoved: 1,
      nearDuplicatesRemoved: 1,
      samePatternRemoved: 0,
      levelMismatchRemoved: 0,
      topicMismatchRemoved: 0,
      styleDiversity: {},
      exhausted: true,
    },
    mergedSummary: {
      totalSlots: 10,
      filledSlots: 9,
      missingSlots: 1,
      filledSlotIndexes: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      emptySlotIndexes: [9],
    },
  });

  assert.match(diagnostics, /Missing Slot Recovery/i);
  assert.match(diagnostics, /Duplicates removed: 1/i);
  assert.match(diagnostics, /Generation exhausted/i);
  assert.match(diagnostics, /Suggestions:/i);
});
