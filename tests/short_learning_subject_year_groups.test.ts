import test from "node:test";
import assert from "node:assert/strict";
import { SHORT_LEARNING_MANUAL_SUBJECT_KEYS } from "../src/lib/schools/short-learning-subjects";
import {
  adminShortLearningSubjectOptions,
  canonicalShortLearningSubjectKey,
  classifyEnglishSkillIntent,
  defaultShortLearningSkillFocus,
  resolveShortLearningSkillFocus,
  shortLearningSkillsForYear,
  shortLearningSubjectMatchValues,
  shortLearningSubjectMode,
} from "../src/lib/schools/short-learning-curriculum";
import { buildSubjectPracticeFillItems } from "../src/lib/schools/subject-practice-fill";
import { classifyDaytimeSubjectMode, contentTypeForSubjectMode } from "../src/lib/schools/daytime-subject-mode";
import { normalizeLessonContentJson } from "../src/lib/lesson-runtime-normalizer";

test("Admin Short Learning subjects match parent booking subjects", () => {
  const adminKeys = adminShortLearningSubjectOptions().map((option) => option.key);
  assert.deepEqual(adminKeys, [...SHORT_LEARNING_MANUAL_SUBJECT_KEYS]);
  assert.equal(canonicalShortLearningSubjectKey("History"), "history");
  assert.equal(canonicalShortLearningSubjectKey("Religious Education"), "religious-education");
  assert.equal(canonicalShortLearningSubjectKey("spelling"), "english");
  assert.ok(shortLearningSubjectMatchValues("History").includes("history"));
  assert.ok(shortLearningSubjectMatchValues("History").includes("History"));
});

test("year-group skills stay in-subject and are not a Maths dump", () => {
  assert.match(defaultShortLearningSkillFocus("history", "Year 4"), /Egypt|Roman|Stone|local/i);
  assert.match(defaultShortLearningSkillFocus("maths", "Year 4"), /multipl|array/i);
  assert.equal(
    shortLearningSkillsForYear("history", "Year 4").some((skill) => /multipl|number bond/i.test(skill)),
    false,
  );
  assert.notEqual(defaultShortLearningSkillFocus("history", "Year 3"), defaultShortLearningSkillFocus("history", "Year 7"));
  assert.equal(shortLearningSubjectMode("science"), "science");
  assert.equal(classifyDaytimeSubjectMode("history"), "humanities");
  assert.equal(contentTypeForSubjectMode("humanities"), "lesson");
  assert.equal(classifyDaytimeSubjectMode("physical-education"), "practical-pe");
});

test("parent notes like UAT weekend do not become the English generation skill", () => {
  assert.match(
    resolveShortLearningSkillFocus({
      learningFocus: "UAT weekend",
      subject: "english",
      yearGroup: "Year 6",
    }),
    /inference|comprehension|relative|summaris/i,
  );
  assert.equal(
    resolveShortLearningSkillFocus({
      learningFocus: "Reading inference",
      subject: "english",
      yearGroup: "Year 6",
    }),
    "Reading inference",
  );
  assert.match(
    resolveShortLearningSkillFocus({
      learningFocus: "",
      subject: "english",
      yearGroup: "Year 6",
    }),
    /inference|comprehension|relative|summaris/i,
  );
  assert.equal(classifyEnglishSkillIntent("Relative clauses"), "grammar");
  assert.equal(classifyEnglishSkillIntent("Fronted adverbials"), "grammar");
  assert.equal(classifyEnglishSkillIntent("Formal and informal language"), "grammar");
  assert.equal(classifyEnglishSkillIntent("Reading inference"), "comprehension");
  assert.equal(classifyEnglishSkillIntent("Summarising a text"), "comprehension");
});

test("history and science fill questions are not Year 4 arrays", () => {
  const history = buildSubjectPracticeFillItems({ subject: "history", yearGroup: "Year 4", count: 6 });
  assert.ok(history.length >= 4);
  assert.equal(history.some((item) => /array has \d+ rows|What is \d+/.test(item.prompt)), false);
  assert.ok(history.some((item) => /Roman|Egypt|Stone Age|source/i.test(item.prompt)));
  assert.equal(history.every((item) => item.choices.length >= 4), true);

  const science = buildSubjectPracticeFillItems({ subject: "science", yearGroup: "Year 4", count: 6 });
  assert.ok(science.some((item) => /circuit|vibrate|solid to liquid|shadow/i.test(item.prompt)));

  const y3 = buildSubjectPracticeFillItems({ subject: "history", yearGroup: "Year 3", count: 1 });
  const y4 = buildSubjectPracticeFillItems({ subject: "history", yearGroup: "Year 4", count: 1 });
  assert.notEqual(y3[0]?.prompt, y4[0]?.prompt);
});

test("a Year 4 history pack does not become a Maths lesson", () => {
  const items = normalizeLessonContentJson(JSON.stringify({
    subjectType: "maths",
    title: "history: Lesson block 1",
    estimatedMinutes: 18,
    learningObjective: "The Romans in Britain",
    activities: [{ kind: "multiple-choice", estimatedMinutes: 16 }],
    questions: [{ prompt: "An array has 3 rows of 4. How many altogether?", answer: "12" }],
  }), {
    contentType: "lesson",
    subject: "history",
    yearGroup: "Year 4",
    skillFocus: "The Romans in Britain",
  });

  assert.ok(items.length >= 4);
  assert.equal(items.every((item) => item.questionType !== "math"), true);
  assert.equal(items.some((item) => /array has \d+ rows/.test(item.question)), false);
  assert.ok(items.some((item) => /Roman|Egypt|Stone Age|source/i.test(item.question)));
  assert.equal(items.every((item) => item.options.length >= 4), true);
});
