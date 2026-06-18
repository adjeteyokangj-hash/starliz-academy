import assert from "node:assert/strict";
import test from "node:test";

import { validateAiContentQuality } from "../src/lib/ai/content-quality";
import { runContentBlackBoxTest } from "../src/lib/ai/content-black-box-test";
import {
  detectRepetitiveQuestionStructures,
  detectWeakDistractors,
  validateCurriculumContentQuality,
  validateGcseMathsQuality,
  validateGrammarQuestionQuality,
  validateMathsQuestionQuality,
  validateReadingPassageQuality,
} from "../src/lib/curriculum-quality";

test("weak KS2 maths question warns or fails", () => {
  const result = validateMathsQuestionQuality({
    keyStage: "KS2",
    yearGroup: "Year 5",
    difficulty: 4,
    item: {
      question: "What is 7 x 8?",
      answer: 56,
      choices: [56, 57, 58],
      explanation: "Work it out.",
    },
  });

  assert.equal(result.passed, true);
  assert.ok(result.warnings.includes("shallow_maths_prompt"));
  assert.ok(result.warnings.includes("vague_explanation"));
});

test("GCSE maths compute-only question fails", () => {
  const result = validateGcseMathsQuality({
    keyStage: "KS4",
    yearGroup: "Year 11",
    subject: "gcse-maths",
    difficulty: 4,
    item: {
      question: "Compute 33 x 2 - 29",
      answer: 37,
      choices: [37, 38, 39],
      explanation: "Multiply then subtract.",
    },
  });

  assert.equal(result.passed, false);
  assert.ok(result.blockingIssues.includes("gcse_maths_compute_only"));
});

test("good GCSE maths question passes", () => {
  const result = validateGcseMathsQuality({
    keyStage: "KS4",
    yearGroup: "Year 11",
    subject: "gcse-maths",
    difficulty: 4,
    item: {
      question: "Solve the linear equation 3x + 7 = 22. Explain the inverse operations used and check your answer.",
      answer: "x = 5",
      choices: ["x = 5", "x = 7", "x = 9", "x = 15"],
      explanation: "Subtract 7 from both sides to get 3x = 15, then divide by 3. Therefore x = 5, and substituting gives 22.",
    },
  });

  assert.equal(result.passed, true);
  assert.equal(result.blockingIssues.length, 0);
  assert.ok(result.qualityTags.includes("gcse_maths_quality"));
});

test("reading passage with no evidence fails", () => {
  const result = validateReadingPassageQuality({
    keyStage: "KS2",
    yearGroup: "Year 5",
    difficulty: 3,
    item: {
      passage: "Maya opened the greenhouse door. Warm air rose around rows of basil and mint. She checked the soil, watered the driest pots, and wrote the date in her notebook.",
      question: "According to the passage, why did Maya repair the bicycle?",
      answer: "Because the chain had snapped on the hill.",
      options: ["Because the chain had snapped on the hill.", "Because the tyres were new.", "Because she liked racing."],
    },
  });

  assert.equal(result.passed, false);
  assert.ok(result.blockingIssues.includes("poor_question_answer_alignment_no_text_evidence"));
});

test("weak reading passage fails", () => {
  const result = validateReadingPassageQuality({
    keyStage: "KS2",
    yearGroup: "Year 4",
    difficulty: 3,
    item: {
      passage: "Tom ran fast.",
      question: "What did Tom do?",
      answer: "Tom ran fast.",
      options: ["Tom ran fast.", "Tom slept.", "Tom cooked."],
    },
  });

  assert.equal(result.passed, false);
  assert.ok(result.blockingIssues.includes("poor_passage_quality_too_short"));
});

test("good reading passage passes", () => {
  const result = validateReadingPassageQuality({
    keyStage: "KS2",
    yearGroup: "Year 5",
    difficulty: 3,
    item: {
      passage: "At the edge of the old harbour, Lina noticed that the tide had dropped below the wooden steps. She compared the wet marks on the posts with yesterday's notes and realised the fishing boats would need to leave later than planned.",
      question: "According to the passage, what evidence helped Lina decide the boats should leave later?",
      answer: "The tide had dropped below the wooden steps and the wet marks on the posts matched her notes.",
      options: [
        "The tide had dropped below the wooden steps and the wet marks on the posts matched her notes.",
        "The boats had already left the harbour before Lina arrived.",
        "The old harbour steps had been freshly painted that morning.",
      ],
    },
  });

  assert.equal(result.passed, true);
  assert.equal(result.blockingIssues.length, 0);
});

test("weak distractors fail", () => {
  const result = detectWeakDistractors({
    item: {
      question: "Which sentence is correct?",
      answer: "The list of books is on my desk.",
      options: ["The list of books is on my desk.", "The list of books is on my desk.", ""],
    },
  });

  assert.equal(result.passed, false);
  assert.ok(result.blockingIssues.includes("weak_distractors_duplicate_options"));
  assert.ok(result.blockingIssues.includes("weak_distractors_blank_option"));
});

test("repeated structures warn", () => {
  const result = detectRepetitiveQuestionStructures({
    items: [
      { question: "A box has 12 pencils. How many in 3 boxes?", answer: 36 },
      { question: "A box has 18 pencils. How many in 4 boxes?", answer: 72 },
      { question: "A box has 24 pencils. How many in 5 boxes?", answer: 120 },
    ],
  });

  assert.equal(result.passed, true);
  assert.ok(result.warnings.some((warning) => warning.includes("Repeated question structure")));
});

test("good phonics and grammar fallback pass", () => {
  const phonics = validateCurriculumContentQuality({
    type: "phonics",
    keyStage: "KS1",
    yearGroup: "Year 1",
    items: [{
      word: "ship",
      hint: "Use the /sh/ digraph at the start.",
      sentenceContext: "The ___ sailed across the bay.",
      phonicsStage: "Phase 3",
    }],
  });
  const grammar = validateGrammarQuestionQuality({
    keyStage: "KS2",
    yearGroup: "Year 5",
    item: {
      question: "Rewrite the sentence with correct subject-verb agreement: The list of books are on my desk.",
      answer: "The list of books is on my desk.",
      options: [
        "The list of books is on my desk.",
        "The list of books are on my desk.",
        "The list of books were on my desk.",
      ],
      explanation: "The subject is 'list' (singular), so the verb must be 'is'.",
    },
  });

  assert.equal(phonics.passed, true);
  assert.equal(grammar.passed, true);
});

test("fallback placeholder-style content fails", () => {
  const result = validateCurriculumContentQuality({
    type: "science",
    keyStage: "KS3",
    yearGroup: "Year 8",
    difficulty: 3,
    items: [{
      question: "Year 8 science application: explain core skill in context.",
      answer: "Model science answer for core skill in curriculum practice.",
      choices: ["Model science answer", "Option B", "Option C"],
      explanation: "Model science explanation.",
    }],
  });

  assert.equal(result.passed, false);
  assert.ok(result.blockingIssues.includes("placeholder_style_content"));
});

test("content-quality validator blocks GCSE compute-only content", () => {
  const quality = validateAiContentQuality({
    type: "maths",
    subject: "gcse-maths",
    keyStage: "KS4",
    yearGroup: "Year 11",
    difficulty: 4,
    requestedCount: 1,
    items: [{
      question: "Compute 33 x 2 - 29",
      answer: 37,
      choices: [37, 38, 39],
      explanation: "Multiply then subtract.",
      yearGroup: "Year 11",
      difficulty: 4,
    }],
  });

  assert.equal(quality.ok, false);
  assert.match(quality.error ?? "", /GCSE maths/i);
  assert.ok(quality.meta?.curriculumQuality?.blockingIssues.includes("gcse_maths_compute_only"));
});

test("Black Box surfaces curriculum quality reasons", () => {
  const result = runContentBlackBoxTest({
    subject: "gcse-maths",
    keyStage: "KS4",
    yearGroup: "Year 11",
    level: 4,
    difficulty: 4,
    topic: "Algebra",
    skillFocus: "Solving equations",
    items: [{
      question: "Compute 33 x 2 - 29",
      answer: 37,
      choices: [37, 38, 39],
      explanation: "Multiply then subtract.",
      yearGroup: "Year 11",
      difficulty: 4,
    }],
  });

  assert.equal(result.decision, "REJECT");
  assert.ok(result.reasons.some((reason) => reason.includes("Curriculum quality block")));
});
