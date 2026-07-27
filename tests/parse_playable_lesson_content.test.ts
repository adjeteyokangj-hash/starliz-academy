import test from "node:test";
import assert from "node:assert/strict";
import {
  canApprovePlayableLesson,
  parsePlayableLessonContent,
} from "../src/lib/schools/parse-playable-lesson-content";

const mathsObjectPack = {
  subjectType: "maths",
  title: "Lesson block 3 · Harder questions · Multiplication facts",
  estimatedMinutes: 14,
  targetItems: 2,
  activities: [
    { kind: "teacher-explanation", estimatedMinutes: 3 },
    { kind: "worked-example", estimatedMinutes: 3 },
    { kind: "scaffold", estimatedMinutes: 3 },
    { kind: "reasoning", estimatedMinutes: 3 },
    { kind: "independent", estimatedMinutes: 2 },
  ],
  learningObjective: "To recall and use multiplication facts up to 12 times 12.",
  explanation: "Multiplication facts help us solve larger problems quickly.",
  workedExamples: [
    {
      question: "What is 8 times 9?",
      steps: ["Recall your times tables.", "Multiply the two numbers."],
      answer: "72",
    },
  ],
  generationStatus: "ok",
  failureReason: null,
  questions: [
    {
      prompt: "What is 9 times 8?",
      question: "What is 9 times 8?",
      answer: "72",
      correctAnswer: "72",
      explanation: "9 groups of 8 equals 72.",
      hints: ["Use your times tables.", "9 × 8 is the same as 8 × 9."],
      hint: "Use your times tables.",
      breakdown: {
        simplerQuestion: "What is 8 times 9?",
        steps: ["Recall your times tables.", "Multiply the two numbers."],
        keyWords: [{ word: "multiply", meaning: "Add a number to itself a set number of times." }],
        startingPoint: "Think of 8 groups of 9.",
      },
    },
  ],
  items: [
    {
      prompt: "What is 9 times 8?",
      question: "What is 9 times 8?",
      answer: "72",
      correctAnswer: "72",
      explanation: "9 groups of 8 equals 72.",
      hints: ["Use your times tables."],
    },
    {
      prompt: "What is 7 times 6?",
      question: "What is 7 times 6?",
      answer: "42",
      correctAnswer: "42",
      explanation: "7 groups of 6 equals 42.",
      hints: ["Count in sixes."],
    },
  ],
};

const readingObjectPack = {
  subjectType: "guided-reading",
  title: "Reading comprehension",
  estimatedMinutes: 15,
  targetItems: 2,
  activities: [
    { kind: "read-passage", estimatedMinutes: 5 },
    { kind: "short-answer", estimatedMinutes: 5 },
    { kind: "reasoning", estimatedMinutes: 5 },
  ],
  passage: {
    title: "The Market Stall",
    text: "Amira helped her dad at the market stall. She counted oranges carefully.",
    paragraphs: ["Amira helped her dad at the market stall.", "She counted oranges carefully."],
    wordCount: 14,
  },
  vocabulary: [
    { word: "stall", childFriendlyMeaning: "A small shop table in a market", example: "They sold fruit from a stall." },
  ],
  generationStatus: "ok",
  failureReason: null,
  questions: [
    {
      prompt: "Where did Amira help her dad?",
      question: "Where did Amira help her dad?",
      answer: "At the market stall",
      explanation: "The passage says she helped at the market stall.",
      hints: ["Look at the first sentence."],
    },
  ],
  items: [
    {
      prompt: "Where did Amira help her dad?",
      question: "Where did Amira help her dad?",
      answer: "At the market stall",
      explanation: "The passage says she helped at the market stall.",
      hints: ["Look at the first sentence."],
    },
  ],
};

test("object-shaped contentJson parsing for maths", () => {
  const parsed = parsePlayableLessonContent(JSON.stringify(mathsObjectPack), { contentType: "math" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.learningObjective, mathsObjectPack.learningObjective);
  assert.match(parsed.explanation ?? "", /Multiplication facts/);
  assert.equal(parsed.workedExamples.length, 1);
  assert.equal(parsed.activities.length, 5);
  assert.equal(parsed.hasReviewableBody, true);
  assert.equal(canApprovePlayableLesson(parsed), true);
});

test("questions[] and items[] support with duplicate normalisation", () => {
  const parsed = parsePlayableLessonContent(JSON.stringify(mathsObjectPack), { contentType: "math" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.questions.length, 2);
  assert.equal(parsed.questions[0]?.prompt, "What is 9 times 8?");
  assert.equal(parsed.questions[0]?.answer, "72");
  assert.equal(parsed.questions[1]?.prompt, "What is 7 times 6?");
  assert.ok(parsed.questions[0]?.hints.length >= 1);
  assert.ok(parsed.questions[0]?.breakdown?.steps.length);
});

test("worked examples and activities are preserved", () => {
  const parsed = parsePlayableLessonContent(JSON.stringify(mathsObjectPack), { contentType: "math" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.workedExamples[0]?.answer, "72");
  assert.deepEqual(
    parsed.activities.map((a) => a.kind),
    ["teacher-explanation", "worked-example", "scaffold", "reasoning", "independent"],
  );
});

test("English reading object shape renders passage and vocabulary", () => {
  const parsed = parsePlayableLessonContent(JSON.stringify(readingObjectPack), {
    contentType: "reading",
    subject: "english",
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.passage?.title, "The Market Stall");
  assert.match(parsed.passage?.text ?? "", /Amira/);
  assert.equal(parsed.vocabulary.length, 1);
  assert.equal(parsed.questions.length, 1);
  assert.equal(canApprovePlayableLesson(parsed), true);
});

test("legacy array contentJson is accepted", () => {
  const parsed = parsePlayableLessonContent(
    JSON.stringify([
      { prompt: "2 + 2?", question: "2 + 2?", answer: "4", explanation: "Add.", hints: ["Count on."] },
      { prompt: "3 + 1?", question: "3 + 1?", answer: "4", explanation: "Add.", hints: [] },
    ]),
    { contentType: "math" },
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.questions.length, 2);
  assert.equal(parsed.hasReviewableBody, true);
});

test("malformed JSON fails safely", () => {
  const parsed = parsePlayableLessonContent("{not-json", { contentType: "math" });
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.match(parsed.error, /malformed/i);
  assert.equal(canApprovePlayableLesson(parsed), false);
});

test("empty content fails approval", () => {
  const empty = parsePlayableLessonContent("", { contentType: "math" });
  assert.equal(empty.ok, false);
  assert.equal(canApprovePlayableLesson(empty), false);

  const hollow = parsePlayableLessonContent(
    JSON.stringify({
      subjectType: "maths",
      title: "Empty",
      estimatedMinutes: 10,
      targetItems: 0,
      activities: [],
      questions: [],
      items: [],
      generationStatus: "ok",
    }),
    { contentType: "math" },
  );
  assert.equal(hollow.ok, true);
  if (!hollow.ok) return;
  assert.equal(hollow.hasReviewableBody, false);
  assert.equal(canApprovePlayableLesson(hollow), false);
  assert.ok(hollow.approvalDenialReasons.some((r) => /empty|missing/i.test(r)));
});

test("failed generationStatus blocks approval", () => {
  const parsed = parsePlayableLessonContent(
    JSON.stringify({
      ...mathsObjectPack,
      generationStatus: "failed",
      failureReason: "OpenAI returned incomplete pack",
    }),
    { contentType: "math" },
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(canApprovePlayableLesson(parsed), false);
  assert.ok(parsed.approvalDenialReasons.some((r) => /failed|incomplete/i.test(r)));
});
