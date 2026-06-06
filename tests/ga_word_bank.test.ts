import test from "node:test";
import assert from "node:assert/strict";
import { buildGaWordData, isGaWordSchemaNotReadyError, isGaWordStudentSafe, toStudentSafeGaWord } from "../src/lib/ga-word-bank";

const approvedWord = {
  id: "ga-1",
  englishWord: "hello",
  gaWord: "mi",
  wordType: "expression",
  category: "Greetings",
  level: "Foundation",
  quizReady: true,
  storyReady: false,
  reviewStatus: "Approved",
};

test("Ga word input keeps controlled review and source metadata", () => {
  const data = buildGaWordData({
    englishWord: " apple ",
    gaWord: " aplo ",
    wordType: "noun",
    category: "Food",
    level: "Beginner 1",
    sourceId: "source-1",
    sourcePage: 53,
    reviewStatus: "Reviewed",
    audioStatus: "Needs Review",
    quizReady: true,
    storyReady: true,
    notes: "Dictionary page checked.",
  });

  assert.equal(data.englishWord, "apple");
  assert.equal(data.gaWord, "aplo");
  assert.equal(data.sourcePage, 53);
  assert.equal(data.reviewStatus, "Reviewed");
  assert.equal(data.audioStatus, "Needs Review");
  assert.equal(data.quizReady, true);
  assert.equal(data.storyReady, true);
});

test("Ga word input rejects uncontrolled values", () => {
  assert.throws(() => buildGaWordData({
    englishWord: "dog",
    gaWord: "gbee",
    wordType: "slang",
    category: "Animals",
    level: "Foundation",
  }), /Word type must be one of/);
});

test("student-safe Ga payload only allows Approved words", () => {
  assert.equal(isGaWordStudentSafe({ reviewStatus: "Pending" }), false);
  assert.equal(toStudentSafeGaWord({ ...approvedWord, reviewStatus: "Reviewed" }), null);
  assert.deepEqual(toStudentSafeGaWord(approvedWord), {
    id: "ga-1",
    englishWord: "hello",
    gaWord: "mi",
    wordType: "expression",
    category: "Greetings",
    level: "Foundation",
    quizReady: true,
    storyReady: false,
  });
});

test("Ga schema readiness helper detects missing-table errors", () => {
  assert.equal(isGaWordSchemaNotReadyError(new Error("P2021: The table `public.GaWord` does not exist in the current database.")), true);
  assert.equal(isGaWordSchemaNotReadyError(new Error("relation \"GaSource\" does not exist")), true);
  assert.equal(isGaWordSchemaNotReadyError(new Error("network timeout")), false);
});
