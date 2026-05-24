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
import { isValidCurriculumPath } from "../src/lib/curriculum";

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
  const strong = ["carefully", "happiness", "enjoyment", "preparation", "poisonous"];
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

test("Year 1 spelling accepts accessible CVC-aligned content", () => {
  const result = validateAiContentQuality({
    type: "spelling",
    subject: "spelling",
    keyStage: "KS1",
    yearGroup: "Year 1",
    skillFocus: "CVC words",
    topic: "CVC words practice",
    difficulty: 1,
    items: [
      { word: "cat", hint: "Say each sound.", sentenceContext: "The cat sat on the mat.", yearGroup: "Year 1" },
      { word: "dog", hint: "Blend the sounds.", sentenceContext: "The dog ran to the gate.", yearGroup: "Year 1" },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.meta?.yearLevelMatch, true);
  assert.equal(result.meta?.difficultyMatch, true);
});

test("Year 6 reading difficulty 5 rejects passages that are too short", () => {
  const result = validateAiContentQuality({
    type: "reading",
    subject: "english-language",
    keyStage: "KS2",
    yearGroup: "Year 6",
    skillFocus: "Analysis",
    topic: "Author intent",
    difficulty: 5,
    items: [
      {
        passage: "A short passage.",
        question: "What is the writer trying to do?",
        answer: "To inform.",
      },
    ],
  });
  assert.equal(result.ok, false);
  assert.match(String(result.error), /too easy|validation/i);
});

test("maths difficulty calibration distinguishes easy and hard prompts", () => {
  const tooEasy = validateAiContentQuality({
    type: "maths",
    subject: "maths",
    keyStage: "KS2",
    yearGroup: "Year 5",
    skillFocus: "Problem solving",
    topic: "fractions",
    difficulty: 5,
    items: [{ question: "2 + 2", answer: 4, yearGroup: "Year 5" }],
  });
  assert.equal(tooEasy.ok, false);

  const stronger = validateAiContentQuality({
    type: "maths",
    subject: "maths",
    keyStage: "KS2",
    yearGroup: "Year 5",
    skillFocus: "Problem solving",
    topic: "fractions",
    difficulty: 5,
    items: [{ question: "18 x 3 then subtract 11. Explain your method.", answer: 43, yearGroup: "Year 5" }],
  });
  assert.equal(stronger.ok, true);
});

test("science subject-aware validation rejects non-science content", () => {
  const result = validateAiContentQuality({
    type: "reading",
    subject: "science",
    keyStage: "KS2",
    yearGroup: "Year 4",
    skillFocus: "Scientific reasoning",
    topic: "forces",
    difficulty: 3,
    items: [
      {
        passage: "In a castle, a king prepared for a feast.",
        question: "Who arrived first?",
        answer: "The cook.",
        yearGroup: "Year 4",
      },
    ],
  });
  assert.equal(result.ok, false);
  assert.match(String(result.error), /subject/i);
});

test("history and geography prompts must match selected skill/topic", () => {
  const history = validateAiContentQuality({
    type: "reading",
    subject: "gcse-history",
    keyStage: "KS4",
    yearGroup: "Year 10",
    skillFocus: "Source analysis",
    topic: "Industrial Revolution",
    difficulty: 4,
    items: [{ passage: "The source evidence from the Industrial Revolution period shows harsh factory conditions and social change.", question: "What does this source suggest about Industrial Revolution working life?", answer: "Working conditions were harsh during the Industrial Revolution." }],
  });
  assert.equal(history.ok, true);

  const geographyMismatch = validateAiContentQuality({
    type: "reading",
    subject: "gcse-geography",
    keyStage: "KS4",
    yearGroup: "Year 10",
    skillFocus: "Map skills",
    topic: "coasts",
    difficulty: 4,
    items: [{ passage: "A poem explored loneliness and identity.", question: "What feeling is created?", answer: "Sadness." }],
  });
  assert.equal(geographyMismatch.ok, false);
});

test("languages content requires language-mode signals and supports fallback-like structure", () => {
  const invalid = validateAiContentQuality({
    type: "languages",
    subject: "gcse-french",
    keyStage: "KS4",
    yearGroup: "Year 10",
    skillFocus: "Translation",
    topic: "family",
    difficulty: 3,
    items: [{ question: "What is 6 x 4?", answer: "24" }],
  });
  assert.equal(invalid.ok, false);

  const calibrated = validateAiContentQuality({
    type: "languages",
    subject: "gcse-french",
    keyStage: "KS4",
    yearGroup: "Year 10",
    skillFocus: "Translation",
    topic: "family",
    difficulty: 3,
    items: [{
      question: "Translation: describe your family in French.",
      answer: "Je parle de ma famille.",
      targetVocabulary: "la famille",
      englishMeaning: "family",
      activityMode: "translation",
    }],
  });
  assert.equal(calibrated.ok, true);
});

test("Year 4 English spelling difficulty 4 rejects too-easy Year 1 words", () => {
  const result = validateAiContentQuality({
    type: "spelling",
    subject: "english-language",
    keyStage: "KS2",
    yearGroup: "Year 4",
    skillFocus: "Spelling",
    difficulty: 4,
    items: [
      { word: "cat", hint: "Say each sound.", sentenceContext: "The cat sat on the mat." },
      { word: "dog", hint: "Blend the sounds.", sentenceContext: "The dog ran to the gate." },
    ],
  });

  assert.equal(result.ok, false);
  assert.match(String(result.error), /too easy|too simple|stronger|spelling/i);
});

test("Year 4 English spelling difficulty 4 accepts stronger words", () => {
  const result = validateAiContentQuality({
    type: "spelling",
    subject: "english-language",
    keyStage: "KS2",
    yearGroup: "Year 4",
    skillFocus: "Spelling",
    difficulty: 4,
    items: [
      { word: "carefully", hint: "Split into syllables.", sentenceContext: "Read the instructions carefully before starting." },
      { word: "enjoyment", hint: "Look for the suffix.", sentenceContext: "Reading for enjoyment helps build vocabulary." },
    ],
  });

  assert.equal(result.ok, true);
});

test("English reading strand still requires a passage", () => {
  const result = validateAiContentQuality({
    type: "reading",
    subject: "english-language",
    keyStage: "KS2",
    yearGroup: "Year 4",
    skillFocus: "Reading comprehension",
    difficulty: 3,
    items: [{ question: "What is the main idea?", answer: "The main idea is friendship." }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "Reading output must include a passage.");
});

test("GCSE English Language punctuation mapping accepts strategic punctuation flow", () => {
  const result = isValidCurriculumPath({
    yearGroup: "Year 10",
    subject: "gcse-english-language",
    skillFocus: "Strategic punctuation",
    topic: "Strategic punctuation drill",
  });

  assert.equal(result.ok, true);
});

test("GCSE Physics mapping accepts forces route", () => {
  const result = isValidCurriculumPath({
    yearGroup: "Year 10",
    subject: "gcse-physics",
    skillFocus: "Forces",
    topic: "Forces practice",
  });

  assert.equal(result.ok, true);
});

test("science validation rejects pure arithmetic prompts", () => {
  const result = validateAiContentQuality({
    type: "science",
    subject: "gcse-physics",
    keyStage: "KS4",
    yearGroup: "Year 10",
    skillFocus: "Forces",
    topic: "Physics practice",
    items: [{
      id: "bad-science-1",
      question: "31 x 2 then subtract 28",
      answer: "34",
      explanation: "Multiply then subtract.",
    }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "Generated content did not match GCSE Physics. Please regenerate.");
});

test("science validation accepts physics-context equations", () => {
  const result = validateAiContentQuality({
    type: "science",
    subject: "gcse-physics",
    keyStage: "KS4",
    yearGroup: "Year 10",
    skillFocus: "Forces",
    topic: "Physics practice",
    items: [{
      id: "physics-1",
      question: "A car has a mass of 1200 kg and accelerates at 2 m/s². Calculate the resultant force.",
      answer: "2400 N",
      explanation: "Use F = m × a, so 1200 × 2 = 2400 N.",
      yearGroup: "Year 10",
      skillFocus: "Forces",
      difficulty: 5,
    }],
  });

  assert.equal(result.ok, true);
});
