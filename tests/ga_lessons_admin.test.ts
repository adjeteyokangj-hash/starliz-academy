import test from "node:test";
import assert from "node:assert/strict";
import {
  getLessonPublishRequest,
  getLessonUpsertRequest,
  lessonFormFromRow,
  mergeLessonLinkedWords,
  selectedWordIdsFromLesson,
} from "../src/lib/ga-lessons-admin";

const lessonRow = {
  id: "lesson-1",
  title: "Alphabet Lesson A-C",
  level: "Foundation",
  category: "Alphabet",
  objective: "Recognise letters A to C",
  publishStatus: "Draft",
  packKey: "beginner-pack-1",
  lessonOrder: 2,
  description: "Letter introduction",
  words: [
    {
      wordId: "word-a",
      word: {
        id: "word-a",
        englishWord: "Letter A",
        gaWord: "A",
        category: "Alphabet",
        level: "Foundation",
      },
    },
    {
      wordId: "word-b",
      word: {
        id: "word-b",
        englishWord: "Letter B",
        gaWord: "B",
        category: "Alphabet",
        level: "Foundation",
      },
    },
  ],
};

test("lesson list row can open existing lesson in edit form state", () => {
  const form = lessonFormFromRow(lessonRow);
  assert.equal(form.title, "Alphabet Lesson A-C");
  assert.equal(form.level, "Foundation");
  assert.equal(form.category, "Alphabet");
  assert.equal(form.publishStatus, "Draft");
  assert.equal(form.packKey, "beginner-pack-1");
  assert.equal(form.lessonOrder, "2");
  assert.equal(form.objective, "Recognise letters A to C");
});

test("editing request targets existing lesson PATCH endpoint to avoid duplicate creates", () => {
  assert.deepEqual(getLessonUpsertRequest("lesson-1"), {
    method: "PATCH",
    url: "/api/admin/ga/lessons/lesson-1",
  });
  assert.deepEqual(getLessonUpsertRequest(null), {
    method: "POST",
    url: "/api/admin/ga/lessons",
  });
});

test("publish action targets lesson patch endpoint with Published status", () => {
  assert.deepEqual(getLessonPublishRequest("lesson-1"), {
    method: "PATCH",
    url: "/api/admin/ga/lessons/lesson-1",
    body: { publishStatus: "Published" },
  });
  assert.equal(getLessonPublishRequest(null), null);
});

test("selected linked approved words are preserved when opening edit", () => {
  assert.deepEqual(selectedWordIdsFromLesson(lessonRow), ["word-a", "word-b"]);
});

test("approved words list is merged with linked lesson words", () => {
  const merged = mergeLessonLinkedWords([
    {
      id: "word-a",
      englishWord: "Letter A",
      gaWord: "A",
      category: "Alphabet",
      level: "Foundation",
    },
  ], [lessonRow]);

  assert.equal(merged.some((word) => word.id === "word-a"), true);
  assert.equal(merged.some((word) => word.id === "word-b"), true);
});
