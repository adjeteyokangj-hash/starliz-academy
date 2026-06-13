import assert from "node:assert/strict";
import test from "node:test";

import {
  GA_ALPHABET_EXPECTED_OBJECTIVE,
  GA_ALPHABET_LESSON_ID,
  GA_ALPHABET_LESSON_TITLE,
  HELLO_OBJECTIVE,
  hasUnexpectedGaAlphabetObjective,
} from "../src/lib/ga-lessons-admin";

test("Ga Alphabet lesson objective must not reuse Hello objective", () => {
  const badLesson = {
    id: GA_ALPHABET_LESSON_ID,
    title: GA_ALPHABET_LESSON_TITLE,
    objective: HELLO_OBJECTIVE,
  };

  assert.equal(hasUnexpectedGaAlphabetObjective(badLesson), true);
});

test("repaired Ga Alphabet objective is accepted", () => {
  const repairedLesson = {
    id: GA_ALPHABET_LESSON_ID,
    title: GA_ALPHABET_LESSON_TITLE,
    objective: GA_ALPHABET_EXPECTED_OBJECTIVE,
  };

  assert.equal(hasUnexpectedGaAlphabetObjective(repairedLesson), false);
  assert.notEqual(repairedLesson.objective, HELLO_OBJECTIVE);
});
