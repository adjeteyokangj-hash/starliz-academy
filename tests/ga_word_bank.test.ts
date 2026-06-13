import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGaWordData,
  isGaAlphabetLetterRowLabel,
  isGaWordSchemaNotReadyError,
  isGaWordStudentSafe,
  parseGaBulkImportText,
  planGaBulkImportCommit,
  previewGaBulkImport,
  toStudentSafeGaWord,
} from "../src/lib/ga-word-bank";
import { normalizeGaCategory } from "../src/lib/ga-word-categories";

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

test("Ga word input uses managed category allow-list when provided", () => {
  const data = buildGaWordData({
    englishWord: "bank",
    gaWord: "sika",
    wordType: "noun",
    category: "money terms",
    level: "Foundation",
  }, { allowedCategories: ["Money Terms"] });

  assert.equal(data.category, "Money Terms");

  assert.throws(() => buildGaWordData({
    englishWord: "bank",
    gaWord: "sika",
    wordType: "noun",
    category: "money terms",
    level: "Foundation",
  }, { allowedCategories: ["Greetings"] }), /Category must be one of/);
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
    pronunciationHint: null,
  });
});

test("Ga schema readiness helper detects missing-table errors", () => {
  assert.equal(isGaWordSchemaNotReadyError(new Error("P2021: The table `public.GaWord` does not exist in the current database.")), true);
  assert.equal(isGaWordSchemaNotReadyError(new Error("relation \"GaSource\" does not exist")), true);
  assert.equal(isGaWordSchemaNotReadyError(new Error("network timeout")), false);
});

test("bulk import preview flags missing required fields", () => {
  const parsed = parseGaBulkImportText([
    "englishWord,gaWord,wordType,category,level,sourcePage,reviewStatus,audioStatus,quizReady,storyReady,notes,sourceName",
    "hello,,expression,Greetings,Foundation,7,Approved,Not Started,true,false,,Kasahorow Ga Children's Dictionary",
  ].join("\n"));
  const preview = previewGaBulkImport(parsed, [{ id: "source-1", sourceName: "Kasahorow Ga Children's Dictionary" }], []);
  assert.equal(preview.totalRows, 1);
  assert.equal(preview.validRows, 0);
  assert.equal(preview.invalidRows, 1);
  assert.match(preview.invalidItems[0].errors.join(" "), /gaWord is required/i);
});

test("bulk import preview rejects unsupported statuses and categories", () => {
  const parsed = parseGaBulkImportText([
    "englishWord,gaWord,wordType,category,level,sourcePage,reviewStatus,audioStatus,quizReady,storyReady,notes,sourceName",
    "hello,Helo,expression,InvalidCategory,Foundation,7,Verified,Ready,true,false,,Kasahorow Ga Children's Dictionary",
  ].join("\n"));
  const preview = previewGaBulkImport(parsed, [{ id: "source-1", sourceName: "Kasahorow Ga Children's Dictionary" }], []);
  assert.equal(preview.validRows, 0);
  assert.equal(preview.invalidRows, 1);
  assert.match(preview.invalidItems[0].errors.join(" "), /Category must be one of/i);
});

test("bulk import preview accepts category Alphabet", () => {
  const parsed = parseGaBulkImportText([
    "englishWord,gaWord,wordType,category,level,sourcePage,reviewStatus,audioStatus,quizReady,storyReady,notes,sourceName",
    "Letter A,A,noun,Alphabet,Foundation,1,Approved,Not Started,true,false,,Kasahorow Ga Children's Dictionary",
  ].join("\n"));
  const preview = previewGaBulkImport(parsed, [{ id: "source-1", sourceName: "Kasahorow Ga Children's Dictionary" }], []);
  assert.equal(preview.validRows, 1);
  assert.equal(preview.invalidRows, 0);
});

test("bulk import duplicate handling supports skip and update planning", () => {
  const parsed = parseGaBulkImportText([
    "englishWord,gaWord,wordType,category,level,sourcePage,reviewStatus,audioStatus,quizReady,storyReady,notes,sourceName",
    "one,ekome,adjective,Numbers,Foundation,18,Approved,Not Started,true,false,,Kasahorow Ga Children's Dictionary",
    "two,enyɔ,adjective,Numbers,Foundation,18,Approved,Not Started,true,false,,Kasahorow Ga Children's Dictionary",
  ].join("\n"));
  const preview = previewGaBulkImport(
    parsed,
    [{ id: "source-1", sourceName: "Kasahorow Ga Children's Dictionary" }],
      [{ id: "existing-1", englishWord: "one", gaWord: "ekome", category: "Numbers", sourcePage: 18 }],
  );
  assert.equal(preview.validRows, 2);
  assert.equal(preview.invalidRows, 0);
  assert.equal(preview.duplicateWarnings, 1);

  const skipPlan = planGaBulkImportCommit(preview.validItems, "skip");
  assert.deepEqual(skipPlan, { creates: 1, updates: 0, skips: 1 });

  const updatePlan = planGaBulkImportCommit(preview.validItems, "update");
  assert.deepEqual(updatePlan, { creates: 1, updates: 1, skips: 0 });
});

test("category normalization maps loose labels to approved category set", () => {
  assert.equal(normalizeGaCategory("Object"), "Objects");
  assert.equal(normalizeGaCategory("people/family"), "People");
  assert.equal(normalizeGaCategory("transportation"), "Transport");
  assert.equal(normalizeGaCategory("alphabet"), "Alphabet");
});

test("alphabet recategorisation label matcher only targets Letter A-Z rows", () => {
  assert.equal(isGaAlphabetLetterRowLabel("Letter A"), true);
  assert.equal(isGaAlphabetLetterRowLabel("letter z"), true);
  assert.equal(isGaAlphabetLetterRowLabel("Letter AA"), false);
  assert.equal(isGaAlphabetLetterRowLabel("Alphabet A"), false);
});

test("duplicate Ga spellings with different meanings/categories can coexist", () => {
  const shoulder = buildGaWordData({
    englishWord: "shoulder",
    gaWord: "kɔŋ",
    wordType: "noun",
    category: "Body",
    level: "Foundation",
  });
  const angle = buildGaWordData({
    englishWord: "angle",
    gaWord: "kɔŋ",
    wordType: "noun",
    category: "Shapes",
    level: "Foundation",
  });

  assert.equal(shoulder.gaWord, angle.gaWord);
  assert.notEqual(shoulder.category, angle.category);
});

test("imported Pending and Reviewed words remain blocked from student payloads while Approved passes", () => {
  const pending = toStudentSafeGaWord({ ...approvedWord, id: "ga-2", reviewStatus: "Pending" });
  const reviewed = toStudentSafeGaWord({ ...approvedWord, id: "ga-3", reviewStatus: "Reviewed" });
  const approved = toStudentSafeGaWord({ ...approvedWord, id: "ga-4", reviewStatus: "Approved" });

  assert.equal(pending, null);
  assert.equal(reviewed, null);
  assert.ok(approved);
  assert.equal(approved?.id, "ga-4");
});
