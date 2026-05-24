import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateAiGeneratorSaveState,
  findAiGeneratorPreviewMissingFields,
  formatAiGeneratorSaveBlockedMessage,
  formatAiGeneratorValidationSuccessMessage,
} from "../src/lib/admin-ai-generator-validation";
import {
  assessSpellingItemForDifficulty,
  buildDeterministicSpellingFallback,
  detectSpellingSkillFocusKind,
  normalizeAdminAiGeneratorFailure,
  shouldUseDeterministicSpellingFallback,
} from "../src/lib/admin-ai-generator-spelling";
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

test("Year 4 prefixes fallback generates valid spelling items", () => {
  const items = buildDeterministicSpellingFallback({
    yearGroup: "Year 4",
    skillFocus: "Prefixes",
    topic: "Prefixes practice",
    count: 5,
    difficulty: 5,
  });

  assert.equal(items.length, 5);
  const result = validateAiContentQuality({
    type: "spelling",
    keyStage: "KS2",
    yearGroup: "Year 4",
    skillFocus: "Prefixes",
    requestedCount: 5,
    items,
  });

  assert.equal(result.ok, true);
});

test("malformed AI output becomes a clear invalid generated content error", () => {
  const failure = normalizeAdminAiGeneratorFailure(
    new Error("Generation failed due to malformed AI output. Stages: raw -> repair"),
    { yearGroup: "Year 4", skillFocus: "Prefixes", generationType: "spelling" },
  );

  assert.equal(failure.errorCode, "invalid_generated_content");
  assert.match(failure.message, /invalid format/i);
});

test("invalid API key becomes a clear model error and enables spelling fallback", () => {
  const providerError = Object.assign(new Error("OpenAI request failed with status 401 (invalid_api_key)"), {
    providerStatus: 401,
    providerCode: "invalid_api_key",
  });
  const failure = normalizeAdminAiGeneratorFailure(providerError, {
    yearGroup: "Year 4",
    skillFocus: "Prefixes",
    generationType: "spelling",
  });

  assert.equal(failure.errorCode, "model_error");
  assert.match(failure.message, /api key was rejected/i);
  assert.equal(shouldUseDeterministicSpellingFallback(failure.errorCode), true);
});

test("save is blocked when preview content is missing required spelling fields", () => {
  const missingFields = findAiGeneratorPreviewMissingFields({
    title: "Spelling - Prefixes practice",
    subject: "spelling",
    keyStage: "KS2",
    yearGroup: "Year 4",
    skillFocus: "Prefixes",
    difficulty: 5,
    topic: "Prefixes practice",
    items: [{ word: "unhappy", hint: "", sentenceContext: "" }],
  }, "spelling");

  assert.deepEqual(missingFields, ["items[1].hint", "items[1].sentenceContext"]);
  assert.match(
    formatAiGeneratorSaveBlockedMessage({ reason: "preview-invalid", missingFields }),
    /Generate a valid preview before saving/i,
  );
});

test("Year 4 suffixes difficulty 5 rejects simple words", () => {
  for (const simple of ["line", "shine", "time"]) {
    const result = validateAiContentQuality({
      type: "spelling",
      keyStage: "KS2",
      yearGroup: "Year 4",
      skillFocus: "Suffixes",
      difficulty: 5,
      items: [{ word: simple, hint: "Try again", sentenceContext: "A weak sentence." }],
    });
    assert.equal(result.ok, false);
    assert.match(String(result.error), /too simple|stronger Year 4|suffix focus/i);
  }
});

test("Year 4 suffixes difficulty 5 accepts stronger suffix words", () => {
  const strong = ["carefully", "happiness", "preparation", "courageous", "believable"];
  const items = strong.map((word) => ({
    word,
    hint: "Explain the suffix and meaning shift.",
    sentenceContext: `Use ${word} in a precise Year 4 sentence.`,
  }));
  const result = validateAiContentQuality({
    type: "spelling",
    keyStage: "KS2",
    yearGroup: "Year 4",
    skillFocus: "Suffixes",
    difficulty: 5,
    items,
  });
  assert.equal(result.ok, true);
});

test("Year 4 prefixes difficulty 5 accepts strong prefix words", () => {
  const strong = ["misbehave", "disappear", "preview", "submarine", "interact"];
  const items = strong.map((word) => ({
    word,
    hint: "Identify the prefix before spelling.",
    sentenceContext: `Write a sentence that uses ${word} in context.`,
  }));
  const result = validateAiContentQuality({
    type: "spelling",
    keyStage: "KS2",
    yearGroup: "Year 4",
    skillFocus: "Prefixes",
    difficulty: 5,
    items,
  });
  assert.equal(result.ok, true);
});

test("Year 4 homophones require pair/group", () => {
  const single = validateAiContentQuality({
    type: "spelling",
    keyStage: "KS2",
    yearGroup: "Year 4",
    skillFocus: "Homophones",
    difficulty: 5,
    items: [{ word: "their", hint: "Choose correctly", sentenceContext: "Their bag was on the floor." }],
  });
  assert.equal(single.ok, false);

  const pair = validateAiContentQuality({
    type: "spelling",
    keyStage: "KS2",
    yearGroup: "Year 4",
    skillFocus: "Homophones",
    difficulty: 5,
    items: [{
      word: "their",
      hint: "Choose the right form.",
      sentenceContext: "Their project was displayed in the hall.",
      homophoneGroup: ["their", "there", "they're"],
      meaning: "possessive form",
    }],
  });
  assert.equal(pair.ok, true);
});

test("Year 4 compound words require visible parts", () => {
  const weak = validateAiContentQuality({
    type: "spelling",
    keyStage: "KS2",
    yearGroup: "Year 4",
    skillFocus: "Compound words",
    difficulty: 5,
    items: [{ word: "mountain", hint: "Think carefully", sentenceContext: "We climbed a mountain yesterday." }],
  });
  assert.equal(weak.ok, false);

  const strong = validateAiContentQuality({
    type: "spelling",
    keyStage: "KS2",
    yearGroup: "Year 4",
    skillFocus: "Compound words",
    difficulty: 5,
    items: [{ word: "earthquake", hint: "Split the roots", sentenceContext: "An earthquake can shake buildings.", firstWord: "earth", secondWord: "quake" }],
  });
  assert.equal(strong.ok, true);
});

test("fallback output matches skill focus for suffixes and compounds", () => {
  const suffixFallback = buildDeterministicSpellingFallback({
    yearGroup: "Year 4",
    keyStage: "KS2",
    skillFocus: "Suffixes",
    topic: "Suffixes practice",
    count: 5,
    difficulty: 5,
  });
  assert.equal(suffixFallback.every((item) => String(item.spellingPattern ?? "").startsWith("-")), true);

  const compoundFallback = buildDeterministicSpellingFallback({
    yearGroup: "Year 4",
    keyStage: "KS2",
    skillFocus: "Compound words",
    topic: "Compound words practice",
    count: 5,
    difficulty: 5,
  });
  assert.equal(compoundFallback.every((item) => Array.isArray(item.homophoneGroup) || item.firstWord || item.secondWord), true);
});

test("assessment utility marks age-appropriate Year 4 prefix words", () => {
  const assessed = assessSpellingItemForDifficulty({
    word: "misbehave",
    sentenceContext: "Do not misbehave when visitors arrive.",
    skillFocus: "Prefixes",
    yearGroup: "Year 4",
    keyStage: "KS2",
    difficulty: 5,
    item: { word: "misbehave" },
  });
  assert.equal(assessed.valid, true);
  assert.equal(assessed.validationLevel, "age-appropriate");
  assert.equal(detectSpellingSkillFocusKind("Prefixes"), "prefixes");
});
