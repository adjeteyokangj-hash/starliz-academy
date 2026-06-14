import assert from "node:assert/strict";
import test from "node:test";

import { buildLessonEditorStateById, type GaLessonAdminRow } from "../src/lib/ga-lessons-admin";

function makeLesson(input: {
  id: string;
  title: string;
  objective: string;
  category: string;
  level: string;
  packKey: string;
  lessonOrder: number;
  wordIds: string[];
  quizIds: string[];
}): GaLessonAdminRow {
  return {
    id: input.id,
    title: input.title,
    slug: `${input.id}-slug`,
    description: `${input.title} description`,
    level: input.level,
    category: input.category,
    objective: input.objective,
    publishStatus: "Draft",
    packKey: input.packKey,
    lessonOrder: input.lessonOrder,
    words: input.wordIds.map((wordId, index) => ({
      wordId,
      word: {
        id: wordId,
        englishWord: `English ${index + 1}`,
        gaWord: `Ga ${index + 1}`,
        category: input.category,
        level: input.level,
      },
    })),
    quizQuestions: input.quizIds.map((id) => ({ id })),
  };
}

test("Ga lesson editor switches from Lesson A to Lesson B by id with no state leak", () => {
  const lessonA = makeLesson({
    id: "lesson-a",
    title: "Lesson A",
    objective: "Objective A",
    category: "Greetings",
    level: "Foundation",
    packKey: "pack-a",
    lessonOrder: 1,
    wordIds: ["w-a-1", "w-a-2"],
    quizIds: ["q-a-1"],
  });

  const lessonB = makeLesson({
    id: "lesson-b",
    title: "Lesson B",
    objective: "Objective B",
    category: "School",
    level: "Core",
    packKey: "pack-b",
    lessonOrder: 2,
    wordIds: ["w-b-1", "w-b-2", "w-b-3"],
    quizIds: ["q-b-1", "q-b-2"],
  });

  const lessons = [lessonA, lessonB];

  const openedA = buildLessonEditorStateById("lesson-a", lessons);
  assert.ok(openedA);
  assert.equal(openedA.lessonId, lessonA.id);
  assert.equal(openedA.lessonTitle, lessonA.title);

  const openedB = buildLessonEditorStateById("lesson-b", lessons);
  assert.ok(openedB);

  // Final displayed editor state should be Lesson B only.
  assert.equal(openedB.lessonId, lessonB.id);
  assert.equal(openedB.lessonTitle, lessonB.title);
  assert.equal(openedB.form.objective, lessonB.objective);
  assert.equal(openedB.form.category, lessonB.category);
  assert.equal(openedB.form.level, lessonB.level);
  assert.equal(openedB.form.packKey, lessonB.packKey);
  assert.equal(openedB.form.lessonOrder, String(lessonB.lessonOrder));
  assert.deepEqual(openedB.selectedWordIds, lessonB.words.map((row) => row.wordId));
  assert.deepEqual(openedB.loadedQuizQuestionIds, lessonB.quizQuestions?.map((row) => row.id) ?? []);

  // Regression check: Lesson A data must not leak into Lesson B.
  assert.notEqual(openedB.lessonTitle, lessonA.title);
  assert.notEqual(openedB.form.objective, lessonA.objective);
  assert.notDeepEqual(openedB.selectedWordIds, lessonA.words.map((row) => row.wordId));
  assert.notDeepEqual(openedB.loadedQuizQuestionIds, lessonA.quizQuestions?.map((row) => row.id) ?? []);
});
