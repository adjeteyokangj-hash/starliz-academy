import test from "node:test";
import assert from "node:assert/strict";

import {
  validateQuestion,
  validateQuestionBatch,
  isAssignableQuestion,
} from "../src/lib/starliz-question-validator";

test("question with prompt, answer, and explanation passes validation", () => {
  const result = validateQuestion({
    prompt: "What is 4 × 5?",
    answer: "20",
    explanation: "4 multiplied by 5 equals 20.",
  });
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test("question without explanation is rejected", () => {
  const result = validateQuestion({
    prompt: "What is 6 × 7?",
    answer: "42",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("missing an explanation")));
});

test("question without correct answer is rejected", () => {
  const result = validateQuestion({
    prompt: "What is the capital of France?",
    explanation: "Paris is the capital.",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("missing the correct answer")));
});

test("question without prompt or question text is rejected", () => {
  const result = validateQuestion({
    answer: "Paris",
    explanation: "Paris is the capital of France.",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("missing a prompt")));
});

test("science question can include visual scaffold without rejection", () => {
  const result = validateQuestion({
    prompt: "A circuit has a 12V battery and a 4Ω resistor. Calculate the current.",
    answer: "3A",
    explanation: "Current = Voltage ÷ Resistance = 12 ÷ 4 = 3A.",
    workedSolution: "Step 1: Write the formula. Current = V ÷ R. Step 2: Substitute. 12 ÷ 4 = 3A.",
    visual: {
      type: "diagram",
      title: "Circuit diagram",
      altText: "12V battery connected to 4Ω resistor",
      body: ["[12V Battery] ---> [4Ω Resistor]", "Current I = ?"],
    },
    subject: "Science",
  });
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test("maths question without workedSolution generates a warning in warn mode", () => {
  const result = validateQuestion(
    {
      prompt: "What is 3 + 7?",
      answer: "10",
      explanation: "Three plus seven equals ten.",
      subject: "Maths",
    },
    { mode: "warn" },
  );
  // Should pass (no hard error), but warn about missing workedSolution.
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((w) => w.includes("workedSolution")));
});

test("maths question without workedSolution fails in strict mode", () => {
  const result = validateQuestion(
    {
      prompt: "What is 3 + 7?",
      answer: "10",
      explanation: "Three plus seven equals ten.",
      subject: "Maths",
    },
    { mode: "strict" },
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("workedSolution")));
});

test("spelling question does not require a visual", () => {
  const result = validateQuestion({
    word: "light",
    prompt: "Spell the word: light",
    answer: "light",
    explanation: "The word 'light' uses the igh digraph.",
    subject: "Spelling",
  });
  assert.equal(result.ok, true);
});

test("reading question does not require a visual scaffold", () => {
  const result = validateQuestion({
    prompt: "What did the character decide to do?",
    answer: "She decided to walk home.",
    explanation: "The passage says 'She set off down the road on foot.'",
    passage: "She set off down the road on foot.",
    subject: "Reading",
  });
  assert.equal(result.ok, true);
});

test("repair mode fills missing hints with placeholder text", () => {
  const result = validateQuestion(
    {
      prompt: "What is 8 × 8?",
      answer: "64",
      explanation: "Eight times eight equals sixty-four.",
    },
    { mode: "repair" },
  );
  assert.equal(result.ok, true);
  assert.ok(result.repairedQuestion?.hint1, "Repaired question must have hint1");
  assert.ok(result.repairedQuestion?.hint2, "Repaired question must have hint2");
});

test("batch validation returns valid and invalid counts", () => {
  const batch = [
    { prompt: "Q1", answer: "A1", explanation: "Correct because…" },
    { prompt: "Q2" /* missing answer and explanation */ },
    { prompt: "Q3", answer: "A3", explanation: "Correct because…" },
  ];
  const result = validateQuestionBatch(batch);
  assert.equal(result.total, 3);
  assert.equal(result.valid.length, 2);
  assert.equal(result.invalid.length, 1);
  assert.equal(result.ok, false);
});

test("isAssignableQuestion returns true for complete question, false for incomplete", () => {
  assert.equal(
    isAssignableQuestion({ prompt: "Q?", answer: "A", explanation: "Because…" }),
    true,
  );
  assert.equal(
    isAssignableQuestion({ prompt: "Q?" /* no answer or explanation */ }),
    false,
  );
});
