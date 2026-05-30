import test from "node:test";
import assert from "node:assert/strict";

import { buildMathsCoachResponse } from "../src/lib/coach/maths-steps";
import { buildSpellingCoachResponse } from "../src/lib/coach/spelling-hints";
import {
  buildCoachRequestBody,
  buildCoachRequestKey,
  shouldApplyCoachResponse,
} from "../src/components/coach/SmartCoachPanel";

test("main coach request keys differ for same hint count when question changes", () => {
  const keyA = buildCoachRequestKey({
    subject: "maths",
    question: "What is 6 multiplied by 7?",
    correctAnswer: "42",
    hintCount: 1,
    attemptCount: 0,
    confidenceScore: 0.5,
  });
  const keyB = buildCoachRequestKey({
    subject: "maths",
    question: "What is 8 multiplied by 7?",
    correctAnswer: "56",
    hintCount: 1,
    attemptCount: 0,
    confidenceScore: 0.5,
  });

  assert.notEqual(keyA, keyB);
  assert.equal(shouldApplyCoachResponse(keyB, keyA), false);
  assert.equal(shouldApplyCoachResponse(keyB, keyB), true);
});

test("coach request body includes provided context identifiers and assignment references", () => {
  const body = buildCoachRequestBody({
    studentId: "student-1",
    subject: "maths",
    question: "What is 6 multiplied by 7?",
    questionId: "q-17",
    lessonItemId: "lesson-item-17",
    strand: "multiplication",
    questionIndex: 6,
    source: "games_math",
    questionTextHash: "hash-17",
    correctAnswer: "42",
    hintCount: 0,
    attemptCount: 1,
    assignmentId: "assignment-1",
    contentId: "content-1",
    confidenceScore: 0.5,
  });

  assert.equal(body.questionId, "q-17");
  assert.equal(body.lessonItemId, "lesson-item-17");
  assert.equal(body.strand, "multiplication");
  assert.equal(body.assignmentId, "assignment-1");
  assert.equal(body.contentId, "content-1");
});

test("6 x 7 coach response uses multiplication guidance without shopping or place-value pollution", () => {
  const response = buildMathsCoachResponse({
    subject: "maths",
    question: "What is 6 multiplied by 7?",
    correctAnswer: "42",
    hintCount: 0,
    attemptCount: 0,
    ageBand: "primary",
    confidenceScore: 0.5,
  });

  const fullText = [
    response.message,
    response.reinforcementNote,
    ...response.steps.map((step) => `${step.expression} ${step.explanation}`),
  ].join(" ").toLowerCase();

  assert.match(fullText, /(groups|repeated addition|skip count|rows|columns|array)/);
  assert.equal(fullText.includes("shopping"), false);
  assert.equal(fullText.includes("£20"), false);
  assert.equal(fullText.includes("toy"), false);
  assert.equal(fullText.includes("money"), false);
  assert.equal(fullText.includes("place value"), false);
  assert.equal(fullText.includes("tens and ones"), false);
  assert.equal(fullText.includes("checking backwards"), false);
});

test("spelling coach does not split full sentence into dotted character output", () => {
  const response = buildSpellingCoachResponse({
    subject: "spelling",
    question: "Write this sentence",
    correctAnswer: "The cat is fast and the dog is happy.",
    hintCount: 0,
    attemptCount: 0,
    ageBand: "primary",
    confidenceScore: 0.5,
  });

  const fullText = [response.message, ...response.steps.map((step) => step.expression)].join(" ");
  assert.equal(fullText.includes(" • "), false);
  assert.equal(fullText.includes("The cat is fast and the dog is happy. The cat is fast and the dog is happy."), false);
});
