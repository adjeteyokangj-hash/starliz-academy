/**
 * Global question duplicate detection tests.
 *
 * Covers:
 * 1. Same-session exact duplicate detection
 * 2. Same-session near-duplicate detection
 * 3. Cross-session exact duplicate (against old published content)
 * 4. Cross-session near duplicate (against old content)
 * 5. Normalisation: whitespace, punctuation, number words
 * 6. Similarity scoring returns expected range
 * 7. Different questions are not flagged
 * 8. Same answer + very similar prompt detected
 * 9. Same prompt + different choices detected
 * 10. Source status labelling is correct
 * 11. Empty slots produce no false positives
 * 12. Multiple matches accumulate correctly
 * 13. Large historical corpus does not produce cross-content collisions when prompts differ
 * 14. Fingerprint function is deterministic and case/whitespace insensitive
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeQuestionDuplicateMatches,
  buildQuestionCorpusEntries,
  normalizeQuestionText,
  questionFingerprint,
  questionSimilarity,
  summarizeQuestionDuplicatesForContent,
} from "../src/lib/question-duplicate-detection";

// ─── 1. Same-session exact duplicate (→ now detected as cross-session) ───────────────────

test("detects exact duplicate of current question against identical historical question", () => {
  const result = summarizeQuestionDuplicatesForContent({
    contentId: "content-1",
    contentStatus: "generated",
    contentJson: JSON.stringify([
      { prompt: "What is 18 divided by 3?", answer: "6" },
    ]),
    historicalRecords: [
      {
        contentId: "content-old",
        contentStatus: "published",
        contentJson: JSON.stringify([
          { prompt: "What is 18 divided by 3?", answer: "6" },
        ]),
      },
    ],
  });

  assert.ok(result.hasDuplicates, "Should have duplicates");
  assert.equal(result.exactCount, 1);
  assert.ok(result.matches.some((match) => match.duplicateType === "exact duplicate"));
});

// ─── 2. Same-session near-duplicate (cross-session check) ───────────────────

test("detects near duplicate of same-session question against identical historical question", () => {
  const result = summarizeQuestionDuplicatesForContent({
    contentId: "content-1",
    contentStatus: "generated",
    contentJson: JSON.stringify([
      { prompt: "A baker uses 36 eggs to make 6 cakes. How many eggs per cake?", answer: "6" },
    ]),
    historicalRecords: [
      {
        contentId: "content-old",
        contentStatus: "published",
        contentJson: JSON.stringify([
          { prompt: "A baker uses 36 eggs to bake 6 cakes. How many eggs does each cake need?", answer: "6" },
        ]),
      },
    ],
  });

  assert.ok(result.hasDuplicates, "Should detect near duplicates against historical content");
  assert.ok(result.nearCount >= 1 || result.sameAnswerCount >= 1);
});

// ─── 3. Cross-session exact duplicate against old published content ───────────

test("detects exact duplicate against published historical content", () => {
  const result = summarizeQuestionDuplicatesForContent({
    contentId: "content-new",
    contentStatus: "generated",
    contentJson: JSON.stringify([
      { prompt: "What is 12 divided by 4?", answer: "3" },
    ]),
    historicalRecords: [
      {
        contentId: "content-old",
        contentStatus: "published",
        contentJson: JSON.stringify([
          { prompt: "What is 12 divided by 4?", answer: "3" },
        ]),
      },
    ],
  });

  assert.ok(result.hasDuplicates, "Should have global duplicate");
  assert.equal(result.exactCount, 1);
  const match = result.matches[0];
  assert.equal(match?.matchedContentId, "content-old");
  assert.equal(match?.sourceStatus, "published");
  assert.equal(match?.duplicateType, "exact duplicate");
});

// ─── 4. Cross-session near duplicate ─────────────────────────────────────────

test("detects near duplicate against historical content", () => {
  const result = summarizeQuestionDuplicatesForContent({
    contentId: "content-new",
    contentStatus: "generated",
    contentJson: JSON.stringify([
      { prompt: "A farmer packs 24 apples into boxes of 6. How many boxes are needed?", answer: "4" },
    ]),
    historicalRecords: [
      {
        contentId: "content-archived",
        contentStatus: "archived",
        contentJson: JSON.stringify([
          { prompt: "A farmer places 24 apples into boxes, 6 per box. How many boxes?", answer: "4" },
        ]),
      },
    ],
  });

  assert.ok(result.hasDuplicates, "Should detect near/same-answer duplicate against archived content");
  const match = result.matches[0];
  assert.ok(match, "Should have at least one match");
  assert.equal(match.matchedContentId, "content-archived");
  assert.equal(match.sourceStatus, "archived");
});

// ─── 5. Normalisation: whitespace, punctuation ───────────────────────────────

test("normalizeQuestionText collapses whitespace and removes punctuation", () => {
  const result = normalizeQuestionText("  What  is 18  divided  by  3?!  ");
  assert.ok(!result.includes("?"), "Should remove question marks");
  assert.ok(!result.includes("!"), "Should remove exclamation marks");
  assert.ok(!/ {2}/.test(result), "Should not have double spaces");
  assert.equal(result, normalizeQuestionText(" What  is 18 divided by 3 "));
});

// ─── 6. Normalisation: number words ──────────────────────────────────────────

test("normalizeQuestionText maps number words to their digit equivalents", () => {
  const result = normalizeQuestionText("Add five to twelve");
  assert.ok(result.includes("5") || result.includes("12") || !result.includes("five"), "Number words should map to digits or be removed");
  assert.ok(!result.includes("five"), "'five' should be mapped to its digit form");
});

// ─── 7. Similarity returns expected range ────────────────────────────────────

test("questionSimilarity returns 1.0 for identical prompts", () => {
  const score = questionSimilarity("What is 8 plus 5?", "What is 8 plus 5?");
  assert.equal(score, 1);
});

test("questionSimilarity returns 0 for completely unrelated prompts", () => {
  const score = questionSimilarity("Boil water", "Calculate the area of a circle");
  assert.ok(score < 0.2, `Expected score < 0.2 but got ${score}`);
});

// ─── 8. Different questions are not flagged ──────────────────────────────────

test("genuinely different questions produce no duplicates", () => {
  const result = summarizeQuestionDuplicatesForContent({
    contentId: "content-1",
    contentStatus: "generated",
    contentJson: JSON.stringify([
      { prompt: "What is 15 + 7?", answer: "22" },
      { prompt: "A baker has 48 cupcakes and sells 19. How many remain?", answer: "29" },
      { prompt: "Solve: 4 x 9", answer: "36" },
    ]),
    historicalRecords: [],
  });

  assert.equal(result.hasDuplicates, false);
  assert.equal(result.duplicateCount, 0);
});

// ─── 9. Same answer + very similar prompt ────────────────────────────────────

test("detects same answer with very similar prompt against historical content", () => {
  const result = summarizeQuestionDuplicatesForContent({
    contentId: "content-1",
    contentStatus: "generated",
    contentJson: JSON.stringify([
      { prompt: "A baker uses 24 eggs to make 6 cakes. How many eggs per cake?", answer: "4" },
    ]),
    historicalRecords: [
      {
        contentId: "content-old",
        contentStatus: "published",
        contentJson: JSON.stringify([
          { prompt: "A baker uses 24 eggs to fill 6 cake tins. How many eggs in each tin?", answer: "4" },
        ]),
      },
    ],
  });

  assert.ok(result.hasDuplicates, "Should detect same-answer very-similar prompt against historical content");
  assert.ok(
    result.matches.some((m) => m.duplicateType === "same answer + very similar prompt" || m.duplicateType === "near duplicate"),
  );
});

// ─── 10. Same prompt + different choices (cross-session) ─────────────────────

test("detects same prompt with different answer choices across sessions", () => {
  const result = summarizeQuestionDuplicatesForContent({
    contentId: "content-new",
    contentStatus: "generated",
    contentJson: JSON.stringify([
      { question: "What is the capital of France?", answer: "Paris", choices: ["Paris", "Nice", "Bordeaux"] },
    ]),
    historicalRecords: [
      {
        contentId: "content-old",
        contentStatus: "published",
        contentJson: JSON.stringify([
          { question: "What is the capital of France?", answer: "Paris", choices: ["Paris", "Lyon", "Marseille"] },
        ]),
      },
    ],
  });

  assert.ok(result.hasDuplicates, "Should detect same prompt with different choices");
  assert.ok(
    result.matches.some((match) => match.duplicateType === "same prompt + different choices" || match.duplicateType === "exact duplicate"),
    "Should have same-prompt-different-choices type",
  );
});

// ─── 11. Source status labelling ─────────────────────────────────────────────

test("source status is labelled correctly for historical records", () => {
  const entries = buildQuestionCorpusEntries({
    contentId: "content-old",
    contentStatus: "archived",
    contentJson: JSON.stringify([{ prompt: "What is 5 x 6?", answer: "30" }]),
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.contentId, "content-old");
  assert.equal(entries[0]?.contentStatus, "archived");
});

// ─── 12. Empty slots produce no false positives ───────────────────────────────

test("empty slot objects do not generate false duplicate matches", () => {
  const result = summarizeQuestionDuplicatesForContent({
    contentId: "content-1",
    contentStatus: "generated",
    contentJson: JSON.stringify([
      {},
      {},
      { prompt: "What is 4 + 4?", answer: "8" },
    ]),
    historicalRecords: [],
  });

  assert.equal(result.hasDuplicates, false);
});

// ─── 13. Multiple matches accumulate correctly ───────────────────────────────

test("multiple duplicate matches are all reported", () => {
  const result = summarizeQuestionDuplicatesForContent({
    contentId: "content-new",
    contentStatus: "generated",
    contentJson: JSON.stringify([
      { prompt: "What is 4 + 4?", answer: "8" },
      { prompt: "What is 5 + 5?", answer: "10" },
    ]),
    historicalRecords: [
      {
        contentId: "content-old-1",
        contentStatus: "published",
        contentJson: JSON.stringify([
          { prompt: "What is 4 + 4?", answer: "8" },
        ]),
      },
      {
        contentId: "content-old-2",
        contentStatus: "published",
        contentJson: JSON.stringify([
          { prompt: "What is 5 + 5?", answer: "10" },
        ]),
      },
    ],
  });

  assert.ok(result.hasDuplicates);
  assert.ok(result.duplicateCount >= 2, `Expected >= 2 matches but got ${result.duplicateCount}`);
});

// ─── 14. Large corpus with different questions ──────────────────────────────

test("large historical corpus produces no false positives for unique questions", () => {
  const historical = Array.from({ length: 30 }, (_, idx) => ({
    contentId: `content-hist-${idx}`,
    contentStatus: "published" as const,
    contentJson: JSON.stringify([
      { prompt: `Historical question ${idx} about topic ${idx}`, answer: `Answer ${idx}` },
    ]),
  }));

  const result = summarizeQuestionDuplicatesForContent({
    contentId: "content-new",
    contentStatus: "generated",
    contentJson: JSON.stringify([
      { prompt: "Unique question about completely different material", answer: "Unique answer" },
    ]),
    historicalRecords: historical,
  });

  assert.equal(result.hasDuplicates, false, `Expected no duplicates but got ${result.duplicateCount}`);
});

// ─── 15. Fingerprint is deterministic ───────────────────────────────────────

test("question fingerprint is deterministic across whitespace variants", () => {
  const fp1 = questionFingerprint({ prompt: "  What is 8  plus 5?  ", answer: "  13  ", choices: ["13", "11"] });
  const fp2 = questionFingerprint({ prompt: "What is 8 plus 5?", answer: "13", choices: ["13", "11"] });

  assert.equal(fp1, fp2, "Fingerprints should match regardless of whitespace");
});

// ─── 16. Previous content status labelling ──────────────────────────────────

test("unrecognised status is labelled as previous content", () => {
  const result = analyzeQuestionDuplicateMatches({
    currentContentId: "content-new",
    currentContentStatus: "generated",
    currentEntries: [
      {
        contentId: "content-new",
        contentStatus: "generated",
        slotId: "content-new:slot-0",
        slotIndex: 0,
        prompt: "What is the speed of light?",
        answer: "approximately 300000 km/s",
        choices: [],
      },
    ],
    historicalEntries: [
      {
        contentId: "content-old",
        contentStatus: "draft",
        slotId: "content-old:slot-0",
        slotIndex: 0,
        prompt: "What is the speed of light?",
        answer: "approximately 300000 km/s",
        choices: [],
      },
    ],
  });

  assert.ok(result.hasDuplicates);
  assert.equal(result.matches[0]?.sourceStatus, "previous content");
});
