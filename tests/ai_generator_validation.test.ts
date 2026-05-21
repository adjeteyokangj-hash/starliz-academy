import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateAiGeneratorSaveState,
  formatAiGeneratorValidationSuccessMessage,
} from "../src/lib/admin-ai-generator-validation";
import { validateAiContentQuality } from "../src/lib/ai/content-quality";

const frenchVocabularyItem = {
  id: "fr-vocab-1",
  targetVocabulary: "la maison",
  englishMeaning: "the house",
  pronunciationHint: "lah meh-zon",
  exampleSentence: "J'habite dans une maison.",
  question: "What does la maison mean?",
  answer: "the house",
  options: ["the house", "the school", "the town"],
  explanation: "La maison means the house.",
};

test("GCSE French Vocabulary validates without a passage and enables save", () => {
  const result = validateAiContentQuality({
    type: "languages",
    keyStage: "KS4",
    yearGroup: "Year 11",
    skillFocus: "Vocabulary",
    items: [frenchVocabularyItem],
  });

  assert.equal(result.ok, true);

  const saveState = evaluateAiGeneratorSaveState({
    itemCount: 1,
    hasPreviewUnavailable: false,
    safetyStatus: "passed",
    apiValid: result.meta?.valid ?? true,
  });

  assert.equal(saveState.blocked, false);
  assert.equal(formatAiGeneratorValidationSuccessMessage("gcse-french", "Vocabulary"), "Final GCSE French vocabulary set is valid.");
});

test("GCSE French Reading comprehension requires a passage", () => {
  const result = validateAiContentQuality({
    type: "languages",
    keyStage: "KS4",
    yearGroup: "Year 11",
    skillFocus: "Reading comprehension",
    items: [{
      id: "fr-reading-1",
      question: "What is the writer's opinion of school?",
      answer: "They enjoy school.",
      explanation: "The answer should be found in the text.",
    }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "Reading output must include a passage.");
});

test("GCSE English Language Reading comprehension requires a passage", () => {
  const result = validateAiContentQuality({
    type: "reading",
    keyStage: "KS4",
    yearGroup: "Year 11",
    skillFocus: "Reading comprehension",
    items: [{
      id: "eng-reading-1",
      question: "How does the writer create tension?",
      answer: "Through short sentences.",
      explanation: "The answer should be based on the passage.",
    }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "Reading output must include a passage.");
});

test("invalid generated preview still blocks save", () => {
  assert.deepEqual(
    evaluateAiGeneratorSaveState({
      itemCount: 1,
      hasPreviewUnavailable: false,
      safetyStatus: "passed",
      apiValid: false,
    }),
    { blocked: true, reason: "api-invalid" },
  );
});
