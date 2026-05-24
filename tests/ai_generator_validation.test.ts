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
import { isValidCurriculumPath, GENERATION_CONTENT_TYPE_BY_SUBJECT } from "../src/lib/curriculum";
import { parseJsonWithRepair } from "../src/lib/safe-json";

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

// ─── 9 new required tests ────────────────────────────────────────────────────

test("Year 10 GCSE Science Physics AQA creates valid preview items", () => {
  const items = [
    {
      id: "phys-aqa-1",
      question: "A car of mass 1200 kg accelerates at 2 m/s². Calculate the resultant force using F = m × a.",
      answer: "2400 N",
      explanation: "Apply Newton's Second Law: F = 1200 × 2 = 2400 N. Force is measured in Newtons (N). This is an AQA GCSE Physics calculation.",
      choices: ["2400 N", "600 N", "1200 N"],
      yearGroup: "Year 10",
      skillFocus: "Forces",
      difficulty: 4,
    },
    {
      id: "phys-aqa-2",
      question: "Describe the difference between weight and mass, using correct SI units and Newton's Law of Gravitation.",
      answer: "Mass is measured in kg (scalar); weight is a force measured in Newtons (N = kg × g).",
      explanation: "Weight = mass × gravitational field strength (W = m × g). Mass is constant; weight varies with gravity.",
      choices: ["Mass is force, weight is mass", "Mass in kg, weight in N", "Both measured in kg"],
      yearGroup: "Year 10",
      skillFocus: "Forces",
      difficulty: 3,
    },
  ];

  assert.equal(GENERATION_CONTENT_TYPE_BY_SUBJECT["gcse-physics"], "science");

  const result = validateAiContentQuality({
    type: "science",
    subject: "gcse-physics",
    keyStage: "KS4",
    yearGroup: "Year 10",
    skillFocus: "Forces",
    topic: "AQA Physics practice",
    difficulty: 4,
    requestedCount: 2,
    items,
  });
  assert.equal(result.ok, true);
  assert.equal(Array.isArray(result.cleanedItems), true);
  assert.equal((result.cleanedItems as unknown[]).length, 2);
});

test("Year 10 GCSE Science Physics Edexcel creates valid preview items", () => {
  const items = [
    {
      id: "phys-edx-1",
      question: "Explain Newton's Second Law and calculate the force on a 500 g object accelerating at 4 m/s² (Edexcel GCSE Physics).",
      answer: "F = m × a = 0.5 × 4 = 2 N in the direction of acceleration.",
      explanation: "Newton's Second Law: resultant force (N) = mass (kg) × acceleration (m/s²). Convert 500 g to 0.5 kg first.",
      choices: ["2 N", "20 N", "0.125 N"],
      yearGroup: "Year 10",
      skillFocus: "Forces",
      difficulty: 4,
    },
  ];

  assert.equal(GENERATION_CONTENT_TYPE_BY_SUBJECT["gcse-physics"], "science");

  const result = validateAiContentQuality({
    type: "science",
    subject: "gcse-physics",
    keyStage: "KS4",
    yearGroup: "Year 10",
    skillFocus: "Forces",
    topic: "Edexcel Physics practice",
    difficulty: 4,
    requestedCount: 1,
    items,
  });
  assert.equal(result.ok, true);
});

test("Year 10 GCSE Science Chemistry AQA creates valid preview items", () => {
  const items = [
    {
      id: "chem-aqa-1",
      question: "Explain what happens during a chemical reaction in terms of atoms, bond energy, and whether the reaction is exothermic or endothermic.",
      answer: "Atoms rearrange to form new substances. Bond breaking absorbs energy; bond forming releases energy. Net difference determines exothermic or endothermic.",
      explanation: "AQA GCSE Chemistry: exothermic reactions release energy (e.g. combustion); endothermic reactions absorb energy (e.g. thermal decomposition).",
      choices: ["Atoms are created", "Atoms rearrange: bond energy determines heat change", "Atoms disappear"],
      yearGroup: "Year 10",
      skillFocus: "Chemical reactions",
      difficulty: 3,
    },
    {
      id: "chem-aqa-2",
      question: "Describe the structure of an atom in terms of protons, neutrons and electrons. State where each particle is found.",
      answer: "Protons and neutrons are in the nucleus; electrons orbit the nucleus in shells.",
      explanation: "The nucleus contains protons (positive charge) and neutrons (no charge). Electrons carry negative charge and are found in energy levels around the nucleus.",
      choices: ["All particles in the nucleus", "Nucleus: protons+neutrons; electrons in shells", "Electrons in the nucleus"],
      yearGroup: "Year 10",
      skillFocus: "Atomic structure",
      difficulty: 3,
    },
  ];

  assert.equal(GENERATION_CONTENT_TYPE_BY_SUBJECT["gcse-chemistry"], "science");

  const result = validateAiContentQuality({
    type: "science",
    subject: "gcse-chemistry",
    keyStage: "KS4",
    yearGroup: "Year 10",
    skillFocus: "Chemical reactions",
    topic: "AQA Chemistry practice",
    difficulty: 3,
    requestedCount: 2,
    items,
  });
  assert.equal(result.ok, true);
  assert.equal(Array.isArray(result.cleanedItems), true);
});

test("Year 10 GCSE Science Chemistry Edexcel creates valid preview items", () => {
  const items = [
    {
      id: "chem-edx-1",
      question: "Explain the difference between an element, a compound and a mixture. Give one example of each in an Edexcel GCSE Chemistry context.",
      answer: "Element: one type of atom (e.g. oxygen). Compound: atoms chemically bonded in fixed ratios (e.g. water H₂O). Mixture: substances not chemically combined (e.g. salt water).",
      explanation: "Edexcel GCSE Chemistry: elements cannot be broken down further. Compounds have fixed ratios of atoms. Mixtures can be separated by physical means.",
      choices: ["Element has mixed atoms", "Element: one atom type; compound: bonded elements; mixture: unbonded", "Compound is a mixture"],
      yearGroup: "Year 10",
      skillFocus: "Elements compounds mixtures",
      difficulty: 3,
    },
  ];

  assert.equal(GENERATION_CONTENT_TYPE_BY_SUBJECT["gcse-chemistry"], "science");

  const result = validateAiContentQuality({
    type: "science",
    subject: "gcse-chemistry",
    keyStage: "KS4",
    yearGroup: "Year 10",
    skillFocus: "Elements compounds mixtures",
    topic: "Edexcel Chemistry practice",
    difficulty: 3,
    requestedCount: 1,
    items,
  });
  assert.equal(result.ok, true);
});

test("Maths does not use spelling validation pipeline", () => {
  assert.equal(GENERATION_CONTENT_TYPE_BY_SUBJECT["maths"], "maths");
  assert.equal(GENERATION_CONTENT_TYPE_BY_SUBJECT["gcse-maths"], "maths");
  assert.notEqual(GENERATION_CONTENT_TYPE_BY_SUBJECT["maths"], "spelling");
  assert.notEqual(GENERATION_CONTENT_TYPE_BY_SUBJECT["gcse-maths"], "spelling");

  // Maths content passes maths validation without requiring spelling-specific fields
  const result = validateAiContentQuality({
    type: "maths",
    subject: "maths",
    keyStage: "KS2",
    yearGroup: "Year 5",
    skillFocus: "Fractions",
    topic: "Fractions practice",
    difficulty: 3,
    items: [{
      question: "Calculate 3/4 of 240. Show your working.",
      answer: 180,
      choices: [180, 200, 120],
      explanation: "Divide by 4 to get 60, then multiply by 3 to get 180.",
    }],
  });
  assert.equal(result.ok, true);

  // Maths items should NOT carry phonics-stage markers required by spelling validator
  const cleaned = result.cleanedItems as Record<string, unknown>[] | undefined;
  assert.equal(cleaned !== undefined, true);
  assert.equal(cleaned?.some((item) => typeof item.phonicsStage !== "undefined" && item.phonicsStage !== null) ?? false, false);
});

test("Science does not use spelling validation pipeline", () => {
  assert.equal(GENERATION_CONTENT_TYPE_BY_SUBJECT["gcse-physics"], "science");
  assert.equal(GENERATION_CONTENT_TYPE_BY_SUBJECT["gcse-biology"], "science");
  assert.equal(GENERATION_CONTENT_TYPE_BY_SUBJECT["gcse-science"], "science");
  assert.notEqual(GENERATION_CONTENT_TYPE_BY_SUBJECT["gcse-physics"], "spelling");
  assert.notEqual(GENERATION_CONTENT_TYPE_BY_SUBJECT["gcse-biology"], "spelling");
  assert.notEqual(GENERATION_CONTENT_TYPE_BY_SUBJECT["gcse-chemistry"], "spelling");
  assert.notEqual(GENERATION_CONTENT_TYPE_BY_SUBJECT["gcse-science"], "spelling");

  // Science content passes science validation without requiring word/hint/sentenceContext spelling fields
  const result = validateAiContentQuality({
    type: "science",
    subject: "gcse-physics",
    keyStage: "KS4",
    yearGroup: "Year 10",
    skillFocus: "Forces",
    topic: "Physics practice",
    difficulty: 3,
    items: [{
      question: "A force of 30 N acts on an object of mass 5 kg. Calculate the resulting acceleration using Newton's Second Law.",
      answer: "6 m/s²",
      explanation: "Newton's Second Law: a = F ÷ m = 30 ÷ 5 = 6 m/s². Acceleration is in the direction of the force.",
      choices: ["6 m/s²", "150 m/s²", "0.17 m/s²"],
      yearGroup: "Year 10",
    }],
  });
  assert.equal(result.ok, true);
});

test("Spelling still uses spelling validation pipeline", () => {
  assert.equal(GENERATION_CONTENT_TYPE_BY_SUBJECT["spelling"], "spelling");
  assert.equal(GENERATION_CONTENT_TYPE_BY_SUBJECT["phonics"], "phonics");

  // Spelling items without required hint + sentenceContext fail spelling validation
  const missingFields = validateAiContentQuality({
    type: "spelling",
    subject: "spelling",
    keyStage: "KS2",
    yearGroup: "Year 4",
    skillFocus: "Prefixes",
    difficulty: 3,
    items: [{ word: "misbehave" }],
  });
  assert.equal(missingFields.ok, false);

  // Proper spelling items with all required fields pass
  const properItem = validateAiContentQuality({
    type: "spelling",
    subject: "spelling",
    keyStage: "KS2",
    yearGroup: "Year 4",
    skillFocus: "Prefixes",
    difficulty: 3,
    items: [{
      word: "misbehave",
      hint: "Identify the prefix and how it changes the meaning of the root word.",
      sentenceContext: "The pupils agreed not to misbehave during the school trip.",
    }],
  });
  assert.equal(properItem.ok, true);
});

test("Error messages are subject-aware and not always 'spelling generator'", () => {
  const physicsFailure = normalizeAdminAiGeneratorFailure(
    new Error("No valid gcse-physics content remained after validation."),
    { subject: "gcse-physics", yearGroup: "Year 10", skillFocus: "Forces", generationType: "science" },
  );
  assert.equal(physicsFailure.errorCode, "invalid_generated_content");
  assert.match(physicsFailure.message, /science content generator/i);
  assert.doesNotMatch(physicsFailure.message, /spelling generator/i);

  const mathsFailure = normalizeAdminAiGeneratorFailure(
    new Error("No valid maths content remained after validation."),
    { subject: "maths", yearGroup: "Year 5", skillFocus: "Fractions", generationType: "maths" },
  );
  assert.match(mathsFailure.message, /maths content generator/i);
  assert.doesNotMatch(mathsFailure.message, /spelling generator/i);

  const spellingFailure = normalizeAdminAiGeneratorFailure(
    new Error("Unable to generate 5 valid Silent e items after auto-repair."),
    { subject: "spelling", yearGroup: "Year 3", skillFocus: "Silent e", generationType: "spelling" },
  );
  assert.match(spellingFailure.message, /spelling generator/i);

  const frenchFailure = normalizeAdminAiGeneratorFailure(
    new Error("No valid gcse-french content remained after validation."),
    { subject: "gcse-french", yearGroup: "Year 11", skillFocus: "Vocabulary", generationType: "languages" },
  );
  assert.match(frenchFailure.message, /languages content generator/i);
  assert.doesNotMatch(frenchFailure.message, /spelling generator/i);
});

test("Invalid AI JSON can be recovered when valid JSON is embedded in prose", () => {
  // Plain valid JSON parses directly
  const direct = parseJsonWithRepair<{ word: string }>('{"word":"hello"}');
  assert.equal(direct.success, true);
  if (direct.success) assert.equal(direct.data.word, "hello");

  // Fenced JSON (as OpenAI sometimes returns) is stripped and parsed
  const fenced = parseJsonWithRepair<unknown[]>('```json\n[{"id":"1","question":"What is force?"}]\n```');
  assert.equal(fenced.success, true);
  if (fenced.success) assert.equal(Array.isArray(fenced.data), true);

  // Valid JSON embedded inside prose (extra text before/after) is extracted
  const withProse = parseJsonWithRepair<unknown[]>(
    'Here are your items:\n[{"id":"1","question":"Describe Newton\'s Second Law of Motion.","answer":"F=ma"}]\nThank you!',
  );
  assert.equal(withProse.success, true);
  if (withProse.success) assert.equal(Array.isArray(withProse.data), true);

  // Completely invalid JSON fails gracefully with diagnostics
  const invalid = parseJsonWithRepair("This is not JSON at all — no brackets or braces.");
  assert.equal(invalid.success, false);
  assert.equal(Array.isArray(invalid.diagnostics.stagesTried), true);
  assert.equal(invalid.diagnostics.stagesTried.length > 0, true);
});
