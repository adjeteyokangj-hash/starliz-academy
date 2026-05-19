import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeLessonContentItems,
  normalizeLessonContentJson,
  type NormalizedLessonItem,
} from "../src/lib/lesson-runtime-normalizer";

function first(items: NormalizedLessonItem[]): NormalizedLessonItem {
  const item = items[0];
  assert.ok(item, "Expected at least one normalized item");
  return item;
}

test("normalizes maths payload into the shared runtime shape", () => {
  const items = normalizeLessonContentItems([
    {
      id: "math-1",
      prompt: "7 + 2",
      answer: 9,
      choices: [8, 9, 10],
      skillFocus: "addition",
      difficulty: 2,
    },
  ], { contentType: "math", subject: "Maths" });

  const item = first(items);
  assert.equal(item.questionType, "math");
  assert.equal(item.question, "7 + 2");
  assert.equal(item.correctAnswer, 9);
  assert.ok(item.explanation.length > 0);
  assert.ok(item.hint.length > 0);
  assert.ok(item.coachSteps.length >= 3);
  assert.ok(item.guidedSteps.length >= 3);
  assert.ok(item.retryPrompts.length >= 3);
  assert.ok(item.reviewPrompt.length > 0);
  assert.equal(item.learningFocus.toLowerCase().includes("addition"), true);
});

test("normalizes spelling payload and keeps legacy aliases", () => {
  const items = normalizeLessonContentItems([
    {
      id: "spell-1",
      word: "light",
      hint: "Listen for the sounds.",
      skillFocus: "silent_e",
      difficulty: 1,
    },
  ], { contentType: "spelling", subject: "Spelling" });

  const item = first(items);
  assert.equal(item.questionType, "spelling");
  assert.equal(item.question, "Spell light");
  assert.equal(item.correctAnswer, "light");
  assert.equal(item.word, "light");
  assert.equal(item.prompt, "Spell light");
  assert.equal(item.visuals.required, false);
  assert.ok(item.coachSteps[0].length > 0);
});

test("expands reading bundles into one normalized item per question", () => {
  const items = normalizeLessonContentItems([
    {
      id: "read-1",
      type: "reading",
      passage: "Lena packs a small red bag for school.",
      questions: [
        { question: "What does Lena pack?", answer: "a bag", options: ["a bag", "a bike"] },
        { question: "What colour is the bag?", answer: "red", options: ["red", "blue"] },
      ],
      skillFocus: "reading comprehension",
      difficulty: 2,
    },
  ], { contentType: "reading", subject: "Reading" });

  assert.equal(items.length, 2);
  assert.equal(items[0]?.passage, "Lena packs a small red bag for school.");
  assert.equal(items[0]?.questionType, "reading");
  assert.equal(items[1]?.correctAnswer, "red");
});

test("normalizes fallback-style content and fills safe defaults", () => {
  const json = JSON.stringify([
    { id: "fallback-1", prompt: "10 - 3", answer: 7, options: [6, 7, 8] },
    { id: "fallback-2", word: "cake", hint: "Listen carefully." },
  ]);

  const items = normalizeLessonContentJson(json, { contentType: "math", subject: "Maths", difficulty: 3 });
  assert.equal(items.length, 2);
  assert.equal(items[0]?.questionType, "math");
  assert.equal(items[0]?.masterySignals.attemptCount, 0);
  assert.equal(items[1]?.questionType, "spelling");
  assert.equal(items[1]?.learningFocus.length > 0, true);
});