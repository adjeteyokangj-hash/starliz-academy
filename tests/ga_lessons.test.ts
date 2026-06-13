import test from "node:test";
import assert from "node:assert/strict";
import {
  assertOnlyApprovedGaWords,
  buildGaLessonData,
  buildGaProgressData,
  toStudentSafeGaLesson,
} from "../src/lib/ga-lessons";

const approvedWord = {
  id: "word-approved",
  englishWord: "hello",
  gaWord: "mi",
  wordType: "expression",
  category: "Greetings",
  level: "Foundation",
  quizReady: true,
  storyReady: false,
  reviewStatus: "Approved",
};

const reviewedWord = {
  ...approvedWord,
  id: "word-reviewed",
  englishWord: "tomorrow",
  gaWord: "reviewed-ga",
  reviewStatus: "Reviewed",
};

function lessonFixture(overrides: Partial<Parameters<typeof toStudentSafeGaLesson>[0]> = {}): Parameters<typeof toStudentSafeGaLesson>[0] {
  return {
    id: "lesson-1",
    title: "Hello, Yes, No",
    slug: "hello-yes-no",
    description: null,
    level: "Foundation",
    category: "Greetings",
    objective: "Practise first Ga greetings.",
    packKey: "beginner-pack-1",
    lessonOrder: 1,
    publishStatus: "Published",
    words: [
      { word: approvedWord, sortOrder: 1 },
      { word: reviewedWord, sortOrder: 2 },
    ],
    activities: [{ id: "activity-1", activityType: "flashcards", title: "Flashcards", instructions: null, sortOrder: 1 }],
    quizQuestions: [
      {
        id: "quiz-1",
        questionType: "english_to_ga",
        prompt: "What is hello in Ga?",
        optionsJson: JSON.stringify(["mi", "other"]),
        correctAnswer: "mi",
        explanation: null,
        sortOrder: 1,
        word: approvedWord,
      },
      {
        id: "quiz-2",
        questionType: "english_to_ga",
        prompt: "What is tomorrow in Ga?",
        optionsJson: JSON.stringify(["reviewed-ga", "other"]),
        correctAnswer: "reviewed-ga",
        explanation: null,
        sortOrder: 2,
        word: reviewedWord,
      },
    ],
    ...overrides,
  };
}

test("Ga lessons cannot attach non-Approved words", () => {
  assert.throws(() => assertOnlyApprovedGaWords([approvedWord, reviewedWord], ["word-approved", "word-reviewed"]), /only use Approved Ga words/);
  assert.doesNotThrow(() => assertOnlyApprovedGaWords([approvedWord], ["word-approved"]));
});

test("student Ga lessons hide unpublished lessons", () => {
  assert.equal(toStudentSafeGaLesson(lessonFixture({ publishStatus: "Draft" })), null);
});

test("student Ga lessons expose only Approved words and quiz questions", () => {
  const safe = toStudentSafeGaLesson(lessonFixture());
  assert.ok(safe);
  assert.deepEqual(safe.words.map((word) => word.id), ["word-approved"]);
  assert.deepEqual(safe.flashcards.map((card) => card.wordId), ["word-approved"]);
  assert.deepEqual(safe.quizQuestions.map((question) => question.id), ["quiz-1"]);
});

test("Ga lesson data validates Beginner Pack 1 fields", () => {
  const data = buildGaLessonData({
    title: " Hello, Yes, No ",
    level: "Foundation",
    category: "Greetings",
    objective: "Practise first Ga greetings.",
    publishStatus: "Draft",
  });
  assert.equal(data.title, "Hello, Yes, No");
  assert.equal(data.slug, "hello-yes-no");
  assert.equal(data.publishStatus, "Draft");
});

test("Ga lesson data accepts Alphabet as a valid lesson category", () => {
  const data = buildGaLessonData({
    title: "Alphabet letters A-C",
    level: "Foundation",
    category: "Alphabet",
    objective: "Teach alphabet letters A-C.",
    publishStatus: "Draft",
  });
  assert.equal(data.category, "Alphabet");
});

test("Ga lesson data uses managed category allow-list when provided", () => {
  const data = buildGaLessonData({
    title: "Money words",
    level: "Foundation",
    category: "money terms",
    objective: "Introduce money words.",
    publishStatus: "Draft",
  }, { allowedCategories: ["Money Terms"] });

  assert.equal(data.category, "Money Terms");

  assert.throws(() => buildGaLessonData({
    title: "Money words",
    level: "Foundation",
    category: "money terms",
    objective: "Introduce money words.",
    publishStatus: "Draft",
  }, { allowedCategories: ["Greetings"] }), /Category must be one of/);
});

test("Ga lesson progress clamps scores safely", () => {
  assert.deepEqual(buildGaProgressData({ correctAnswers: 9, totalQuestions: 5, completed: true }), {
    status: "completed",
    score: 100,
    totalQuestions: 5,
    correctAnswers: 5,
  });
});
