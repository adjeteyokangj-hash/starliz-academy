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

test("does not force visual-required for generic maths items", () => {
  const items = normalizeLessonContentItems([
    {
      id: "math-generic-1",
      prompt: "9 + 4",
      answer: 13,
      options: [12, 13, 14],
    },
  ], { contentType: "math", subject: "Maths" });

  const item = first(items);
  assert.equal(item.visuals.required, false);
  assert.equal(item.visuals.type, "none");
});

test("expands a daytime maths pack as maths questions with four options", () => {
  const items = normalizeLessonContentJson(JSON.stringify({
    subjectType: "maths",
    title: "maths: Lesson block 1 · New concept",
    estimatedMinutes: 10,
    learningObjective: "Multiply two-digit numbers using a written method",
    activities: [{ kind: "multiple-choice", estimatedMinutes: 8 }],
    questions: [
      { prompt: "What is 6 x 2?", answer: "12" },
      { prompt: "If you have 4 rows of 4 apples, how many apples do you have in total?", answer: 16 },
    ],
  }), {
    contentType: "math",
    subject: "maths",
    skillFocus: "maths",
    yearGroup: "Year 4",
  });

  assert.ok(items.length >= 8);
  assert.equal(items[0]?.questionType, "math");
  assert.equal(items[1]?.questionType, "math");
  assert.equal(items[0]?.passage ?? "", "");
  assert.ok((items[0]?.options.length ?? 0) >= 4);
  assert.ok((items[1]?.options.length ?? 0) >= 4);
  assert.equal(items[0]?.options.includes("12"), true);
  assert.equal(items[1]?.options.includes("16"), true);
  assert.match(String(items[0]?.learningFocus ?? "").toLowerCase(), /written method|multiplication/);
});

test("pads explain-how maths answers to four choices", () => {
  const items = normalizeLessonContentItems([
    {
      prompt: "Explain how you can use an array to solve 3 x 5.",
      answer: "You can draw 3 rows with 5 items in each row to see the total.",
      skillFocus: "To understand and apply the concept of multiplication using arrays.",
    },
  ], { contentType: "math", subject: "maths", yearGroup: "Year 4" });

  const item = first(items);
  assert.equal(item.questionType, "math");
  assert.ok(item.options.length >= 4);
  assert.equal(item.options.includes("You can draw 3 rows with 5 items in each row to see the total."), true);
  assert.match(item.learningFocus.toLowerCase(), /array|multiplication/);
});

test("18-minute daytime maths pack expands beyond three questions", () => {
  const items = normalizeLessonContentJson(JSON.stringify({
    subjectType: "maths",
    title: "maths: Lesson block 1 · New concept",
    estimatedMinutes: 18,
    learningObjective: "To understand and apply the concept of multiplication using arrays.",
    activities: [{ kind: "multiple-choice", estimatedMinutes: 16 }],
    questions: [
      {
        prompt: "Explain how you can use an array to solve 3 x 5.",
        answer: "You can draw 3 rows with 5 items in each row to see the total.",
      },
      { prompt: "What is 4 x 4?", answer: 16 },
      { prompt: "What is 6 x 2?", answer: "12" },
    ],
  }), {
    contentType: "math",
    subject: "maths",
    skillFocus: "maths",
    yearGroup: "Year 4",
  });

  assert.ok(items.length >= 8);
  assert.equal(items.every((item) => item.questionType === "math"), true);
  assert.equal(items.every((item) => item.options.length >= 4), true);
  const positions = new Set(
    items.map((item) => item.options.findIndex((option) => String(option) === String(item.correctAnswer))),
  );
  assert.ok(positions.size >= 2, "Correct answers should appear in more than one option slot");
  const extraPrompts = items.slice(3).map((item) => item.question.toLowerCase());
  assert.equal(extraPrompts.some((prompt) => /^\s*what is \d+ \+ \d+/.test(prompt)), false);
  assert.ok(extraPrompts.some((prompt) => /array|×|groups|rows|trays|missing/.test(prompt)));
  const calculation = items.find((item) => /which calculation matches an array/i.test(item.question));
  if (calculation) {
    assert.match(String(calculation.correctAnswer), /×/);
    assert.equal(calculation.options.some((option) => /×/.test(String(option))), true);
    assert.equal(calculation.options.some((option) => /\+/.test(String(option))), true);
  }
});

test("does not treat a maths word problem as a reading lesson", () => {
  const items = normalizeLessonContentItems([
    {
      question: "A shop sells 6 bags of 2 apples. How many apples is that?",
      answer: 12,
      skillFocus: "maths",
    },
  ], { contentType: "math", subject: "maths", yearGroup: "Year 4" });

  const item = first(items);
  assert.equal(item.questionType, "math");
  assert.ok(item.options.length >= 4);
  assert.match(item.learningFocus.toLowerCase(), /multiplication|written method|number/);
});

test("Year 1 maths packs fill with number bonds, not Year 4 arrays", () => {
  const items = normalizeLessonContentJson(JSON.stringify({
    subjectType: "maths",
    title: "maths: Lesson block 1 · New concept",
    estimatedMinutes: 18,
    learningObjective: "To use number bonds and addition.",
    activities: [{ kind: "multiple-choice", estimatedMinutes: 16 }],
    questions: [
      { prompt: "What is 3 + 4?", answer: 7 },
      { prompt: "What is 2 + 6?", answer: 8 },
    ],
  }), {
    contentType: "math",
    subject: "maths",
    skillFocus: "maths",
    yearGroup: "Year 1",
  });

  assert.ok(items.length >= 8);
  assert.equal(items.every((row) => row.questionType === "math"), true);
  const extras = items.map((row) => row.question.toLowerCase());
  assert.equal(extras.some((prompt) => /array has \d+ rows/.test(prompt)), false);
  assert.ok(extras.some((prompt) => /\+|bond|more than|cubes|apples/.test(prompt)));
});
