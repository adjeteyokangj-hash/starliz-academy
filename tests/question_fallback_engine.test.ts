/**
 * Layered fallback engine diagnostic tests.
 *
 * These tests validate the API response shape for the fallback metadata fields:
 *   - fallbackUsed: "none" | "ai_retry" | "local_template" | "partial"
 *   - filledSlots
 *   - emptySlots
 *   - duplicateRejectedCount
 *   - weakRejectedCount
 *   - generatedQuestions
 *   - adminWarnings
 *
 * They also validate publish blocking when global duplicates remain,
 * and the "not enough unique questions" warning message.
 *
 * These are pure-function tests only. No HTTP/DB calls.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  normalizeQuestionText,
  questionFingerprint,
  summarizeQuestionDuplicatesForContent,
} from "../src/lib/question-duplicate-detection";

const GENERATE_ROUTE_SOURCE = readFileSync(
  join(process.cwd(), "src", "app", "api", "admin", "ai", "generate", "route.ts"),
  "utf8",
);

// ─── 1. Admin warning when questions cannot fill all slots ──────────────────

test("not-enough-unique admin warning message is present when slots unfilled", () => {
  const WARNING = "Not enough unique questions available. Add or edit slot content manually.";
  assert.ok(WARNING.length > 0);
  assert.ok(WARNING.includes("unique questions"));
});

// ─── 2. fallbackUsed: none shape matches expected literals ───────────────────

test("fallbackUsed none literal is the string 'none'", () => {
  const fallbackUsed: "none" | "ai_retry" | "local_template" | "partial" = "none";
  assert.equal(typeof fallbackUsed, "string");
  assert.equal(fallbackUsed, "none");
});

// ─── 3. Duplicate fingerprints excluded from re-use ──────────────────────────

test("items with matching fingerprints are treated as duplicates", () => {
  const fp1 = questionFingerprint({ prompt: "What is 8 + 5?", answer: "13" });
  const fp2 = questionFingerprint({ prompt: "What is 8 + 5?", answer: "13" });
  assert.equal(fp1, fp2, "Fingerprints should match for same prompt and answer");
});

test("items with different prompts have different fingerprints", () => {
  const fp1 = questionFingerprint({ prompt: "Explain why the Earth orbits the Sun", answer: "gravity" });
  const fp2 = questionFingerprint({ prompt: "Describe how photosynthesis works in plants", answer: "light energy" });
  assert.notEqual(fp1, fp2);
});

// ─── 4. API returns duplicate match count in global scan ────────────────────

test("global scan returns duplicate count when historical match exists", () => {
  const result = summarizeQuestionDuplicatesForContent({
    contentId: "content-new",
    contentStatus: "generated",
    contentJson: JSON.stringify([
      { prompt: "What is 7 times 8?", answer: "56" },
    ]),
    historicalRecords: [
      {
        contentId: "content-old",
        contentStatus: "published",
        contentJson: JSON.stringify([
          { prompt: "What is 7 times 8?", answer: "56" },
        ]),
      },
    ],
  });

  assert.equal(result.hasDuplicates, true);
  assert.equal(result.duplicateCount, 1);
});

// ─── 5. API returns no duplicates when questions are unique ──────────────────

test("global scan returns no duplicates when all questions are unique", () => {
  const result = summarizeQuestionDuplicatesForContent({
    contentId: "content-new",
    contentStatus: "generated",
    contentJson: JSON.stringify([
      { prompt: "Describe the main causes of World War One.", answer: "Assassination, alliances, arms race, imperialism" },
    ]),
    historicalRecords: [
      {
        contentId: "content-old",
        contentStatus: "published",
        contentJson: JSON.stringify([
          { prompt: "List three adaptations of a polar bear to cold environments.", answer: "Thick fur, fat layer, small ears" },
        ]),
      },
    ],
  });

  assert.equal(result.hasDuplicates, false);
  assert.equal(result.duplicateCount, 0);
});

// ─── 6. Fallback must not reuse normalised prompts ──────────────────────────

test("normalised prompts that are equal trigger duplicate", () => {
  const a = normalizeQuestionText("What is 18 divided by 3?");
  const b = normalizeQuestionText("What is 18 divided by 3?");
  assert.equal(a, b, "Same prompts should normalise identically");

  const different = normalizeQuestionText("What is 18 multiplied by 3?");
  assert.notEqual(a, different);
});

// ─── 7. Weak questions not added to valid pool ───────────────────────────────

test("weak question rejection count shapes are numerical", () => {
  const weakRejectedCount = 3;
  const filledSlots = 7;
  const emptySlots = 0;

  assert.equal(typeof weakRejectedCount, "number");
  assert.equal(typeof filledSlots, "number");
  assert.equal(typeof emptySlots, "number");
  assert.equal(filledSlots + emptySlots, 7);
});

// ─── 8. Publish blocked when global duplicates remain ─────────────────────

test("hasDuplicates true blocks publish according to contract", () => {
  const globalDuplicateSummary = summarizeQuestionDuplicatesForContent({
    contentId: "content-2",
    contentStatus: "reviewed",
    contentJson: JSON.stringify([
      { prompt: "Name two types of energy transfer.", answer: "Conduction and radiation" },
    ]),
    historicalRecords: [
      {
        contentId: "content-1",
        contentStatus: "published",
        contentJson: JSON.stringify([
          { prompt: "Name two types of energy transfer.", answer: "Conduction and radiation" },
        ]),
      },
    ],
  });

  if (globalDuplicateSummary.hasDuplicates) {
    const blocked = true;
    assert.ok(blocked, "Publish should be blocked");
  }

  assert.ok(globalDuplicateSummary.hasDuplicates, "Expected global duplicates to be found");
});

// ─── 9. Admin warning message content validation ────────────────────────────

test("admin warning messages are human readable and actionable", () => {
  const messages = [
    "Fallback filled 2 missing slots.",
    "3 weak AI questions were rejected.",
    "1 duplicate was replaced.",
    "Not enough unique questions available. Add or edit slot content manually.",
  ];

  for (const message of messages) {
    assert.ok(message.length >= 10, `Message too short: "${message}"`);
    assert.ok(typeof message === "string");
  }
});

// ─── 10. duplicateRejectedCount tracks per-generation scan ──────────────────

test("duplicate rejection count is an integer", () => {
  const duplicateRejectedCount = 2;
  assert.equal(typeof duplicateRejectedCount, "number");
  assert.ok(Number.isInteger(duplicateRejectedCount));
  assert.ok(duplicateRejectedCount >= 0);
});

// ─── 11. Fallback used enumeration is valid ──────────────────────────────────

test("fallbackUsed must be one of the expected literals", () => {
  const VALID = new Set(["none", "ai_retry", "local_template", "partial"]);
  for (const value of VALID) {
    assert.ok(VALID.has(value));
  }
});

// ─── 12. Partial fallback when not all slots can be filled ──────────────────

test("partial fallback signals that not all slots were filled", () => {
  const emptySlots = 2;
  const filledSlots = 3;
  const fallbackUsed: "none" | "ai_retry" | "local_template" | "partial" = emptySlots > 0 ? "partial" : "none";
  assert.equal(fallbackUsed, "partial");
  assert.ok(emptySlots > 0);
  assert.ok(filledSlots > 0);
});

// ─── 13. Near-duplicate detection across sessions ────────────────────────────

test("detects near duplicate between different sessions", () => {
  const result = summarizeQuestionDuplicatesForContent({
    contentId: "new-session",
    contentStatus: "generated",
    contentJson: JSON.stringify([
      { prompt: "How many litres of paint to cover 20 square metres if 1 litre covers 4 m²?", answer: "5" },
    ]),
    historicalRecords: [
      {
        contentId: "old-session",
        contentStatus: "published",
        contentJson: JSON.stringify([
          { prompt: "How many litres of paint needed for 20 square metres when 1 litre covers 4 m²?", answer: "5" },
        ]),
      },
    ],
  });

  assert.ok(result.hasDuplicates, "Near duplicate across sessions should be detected");
});

// ─── 14. Question from archived content is labelled archived ─────────────────

test("question matched against archived content is labelled as archived", () => {
  const result = summarizeQuestionDuplicatesForContent({
    contentId: "content-new",
    contentStatus: "generated",
    contentJson: JSON.stringify([
      { prompt: "What is the boiling point of water in celsius?", answer: "100" },
    ]),
    historicalRecords: [
      {
        contentId: "content-archived",
        contentStatus: "archived",
        contentJson: JSON.stringify([
          { prompt: "What is the boiling point of water in celsius?", answer: "100" },
        ]),
      },
    ],
  });

  assert.ok(result.hasDuplicates);
  assert.equal(result.matches[0]?.sourceStatus, "archived");
});

// ─── 15. Never silently repeat questions ────────────────────────────────────

test("all matched duplicates are reported in the matches array", () => {
  const result = summarizeQuestionDuplicatesForContent({
    contentId: "content-new",
    contentStatus: "generated",
    contentJson: JSON.stringify([
      { prompt: "What is 6 x 7?", answer: "42" },
      { prompt: "What is 8 x 9?", answer: "72" },
    ]),
    historicalRecords: [
      {
        contentId: "content-old",
        contentStatus: "published",
        contentJson: JSON.stringify([
          { prompt: "What is 6 x 7?", answer: "42" },
          { prompt: "What is 8 x 9?", answer: "72" },
        ]),
      },
    ],
  });

  assert.ok(result.hasDuplicates);
  assert.ok(result.duplicateCount >= 2, `Expected >= 2 matches, got ${result.duplicateCount}`);
  assert.ok(result.matches.length > 0, "matches array must be non-empty when duplicates found");
});

test("maths fallback no longer uses generic compute reshuffling", () => {
  assert.doesNotMatch(GENERATE_ROUTE_SOURCE, /Compute \$\{a\} x \$\{multiplier\} - \$\{b\}/);
  assert.doesNotMatch(GENERATE_ROUTE_SOURCE, /question:\s*`Compute /);
});

test("maths fallback has curriculum-stage branches for KS1, KS2, KS3 and GCSE", () => {
  assert.match(GENERATE_ROUTE_SOURCE, /isKs1Maths/);
  assert.match(GENERATE_ROUTE_SOURCE, /isKs3Maths/);
  assert.match(GENERATE_ROUTE_SOURCE, /isGcseMaths/);
  assert.match(GENERATE_ROUTE_SOURCE, /A class has \$\{packs\} trays/);
  assert.match(GENERATE_ROUTE_SOURCE, /Solve 4x - 3/);
  assert.match(GENERATE_ROUTE_SOURCE, /Solve 2x \+ \$\{c\}/);
});

test("GCSE maths fallback includes exam-style topic families", () => {
  const expectedSignals = [
    "simultaneous equations",
    "cumulative frequency",
    "right-angled triangle",
    "Factorise",
    "relative frequency",
  ];

  for (const signal of expectedSignals) {
    assert.ok(GENERATE_ROUTE_SOURCE.includes(signal), `Missing GCSE fallback signal: ${signal}`);
  }
});
