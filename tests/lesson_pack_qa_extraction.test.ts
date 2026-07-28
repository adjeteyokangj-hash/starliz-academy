import assert from "node:assert/strict";
import test from "node:test";
import {
  extractWorksheetActivities,
  parseAnswerSheet,
  pairActivitiesWithAnswers,
  inferDecimalBlankAnswer,
  normaliseEquationBlank,
  stripDocumentNoise,
  isOversizedPrompt,
  isUsableExtractedText,
} from "../src/lib/lesson-pack-import/qa-extraction";
import { markEquivalentComponentSources } from "../src/lib/lesson-pack-import/classification";
import {
  buildQaPairingReport,
  validatePreDraft,
  isGarbledText,
} from "../src/lib/lesson-pack-import/content-extraction";
import type { LessonPackStructuredModel, LessonPackUploadedFile } from "../src/lib/lesson-pack-import/types";

function baseFile(partial: Partial<LessonPackUploadedFile> & Pick<LessonPackUploadedFile, "id" | "originalName" | "kind" | "textContent" | "classification">): LessonPackUploadedFile {
  return {
    mimeType: "application/octet-stream",
    sizeBytes: 100,
    sha256: partial.id,
    pageOrSlideCount: 1,
    headings: [],
    documentTitle: null,
    metadata: {},
    extractionStatus: "ok",
    classificationConfidence: 0.9,
    classificationEvidence: [],
    ...partial,
  };
}

test("equivalent PDF/PPTX extracted only once via primary source", () => {
  const files = markEquivalentComponentSources([
    baseFile({
      id: "pdf",
      originalName: "lesson/worksheet.pdf",
      kind: "pdf",
      classification: "worksheet",
      textContent: "\u0000".repeat(200) + "%%%%EOF binary garbage #########",
    }),
    baseFile({
      id: "pptx",
      originalName: "lesson/worksheet.pptx",
      kind: "pptx",
      classification: "worksheet",
      textContent: "Task A: Models Complete the part-part-whole models. 1.8 2.4",
    }),
  ]);
  const primary = files.filter((f) => f.isPrimaryExtractionSource);
  assert.equal(primary.length, 1);
  assert.equal(primary[0].id, "pptx");
  assert.ok(files.every((f) => f.equivalentGroupId));
});

test("worksheet page split into multiple focused questions", () => {
  const text = [
    "Task B: Representing additive relationships",
    "1) Fill in the blanks to make these equations correct.",
    "a) 1.8 = 1 + b) 1.8 = + 0.8 c) 2.4 = 2 + d) 2.4 = + 2",
  ].join(" ");
  const acts = extractWorksheetActivities(text, "worksheet");
  assert.ok(acts.length >= 4);
  assert.ok(acts.every((a) => a.prompt.length < 180));
  assert.ok(acts.some((a) => a.subQuestionNumber === "a"));
});

test("student instruction attached to question and footer excluded", () => {
  const text = [
    "Task B: Additive",
    "Fill in the blanks to make these equations correct.",
    "a) 1.8 = 1 +",
    "Oak National Academy",
    "Open Government Licence",
    "LESS-NMMRT-O3873",
  ].join("\n");
  const cleaned = stripDocumentNoise(text);
  assert.equal(/Open Government Licence/i.test(cleaned), false);
  assert.equal(/LESS-/i.test(cleaned), false);
  const acts = extractWorksheetActivities(text, "worksheet");
  assert.ok(acts[0]?.instruction?.toLowerCase().includes("fill in") || acts[0]?.hint === undefined);
  assert.ok(acts.every((a) => !/LESS-/i.test(a.prompt)));
});

test("answer guidance grouped; worked solution does not inflate orphan correct answers", () => {
  const qText = "Task B: X 1) Fill in. a) 1.8 = 1 + b) 1.8 = + 0.8";
  const aText = [
    "a) 1.8 = 1 + b) 1.8 = + 0.8",
    "Accept equivalent representations",
    "Pupils may notice place value",
    "4.7 = 4 + 0.7",
  ].join("\n");
  const acts = extractWorksheetActivities(qText, "worksheet");
  const parsed = parseAnswerSheet(aText, "worksheet_answers");
  assert.ok(parsed.guidanceGroups >= 1);
  const paired = pairActivitiesWithAnswers(acts, parsed.answers);
  assert.equal(paired.questionsMissingAnswers.filter((q) => q.markingMode === "auto").length, 0);
  assert.equal(paired.orphanCorrectAnswers.length, 0);
  assert.ok(parsed.answers.some((a) => a.answerType === "worked_solution"));
});

test("question-number and sub-question pairing", () => {
  const acts = extractWorksheetActivities(
    "Task B: X 1) Fill in. a) 2.4 = 2 + b) 2.4 = + 2",
    "worksheet",
  );
  const parsed = parseAnswerSheet(
    "a) 2.4 = 2 + b) 2.4 = + 2",
    "worksheet_answers",
  );
  const paired = pairActivitiesWithAnswers(acts, parsed.answers);
  const a = paired.paired.find((x) => x.subQuestionNumber === "a");
  assert.equal(a?.answer, "0.4");
  assert.ok(a?.pairingMethod);
});

test("open-ended task uses guided_review; teacher notes are not orphan answers", () => {
  const acts = extractWorksheetActivities(
    [
      "Task B: Representing additive relationships",
      "2) Write two addition and two subtraction equations to represent this part-part-whole model.",
      "4.7",
    ].join("\n"),
    "worksheet",
  );
  assert.ok(acts.some((a) => a.markingMode === "guided_review"), `got ${acts.map((a) => a.prompt).join(" | ")}`);
  const parsed = parseAnswerSheet(
    "Pupils may notice partitioning\nAccept equivalent representations\n4.7 = 4 + 0.7",
    "worksheet_answers",
  );
  const paired = pairActivitiesWithAnswers(acts, parsed.answers);
  assert.equal(paired.orphanCorrectAnswers.length, 0);
});

test("decimal operators and spacing preserved; oversized prompt rejected", () => {
  assert.equal(normaliseEquationBlank("1.8 = 1 +"), "1.8 = 1 + ___");
  assert.equal(inferDecimalBlankAnswer("a) 1.8 = 1 + ___"), "0.8");
  assert.equal(isOversizedPrompt("5 .2 5.2 0.2 5 5 0.2 7 .3 7 0.3 7 7.3 0.3 103.2 Complete the part-part-whole models."), true);
  assert.equal(isOversizedPrompt("a) 1.8 = 1 + ___"), false);
});

test("first playable question validation blocks concatenated dumps", () => {
  const structured = {
    title: "Compose decimals",
    subject: null,
    yearGroup: null,
    keyStage: null,
    curriculumArea: null,
    learningObjective: "I can compose decimal numbers with tenths.",
    lessonOutcome: null,
    keywords: [],
    priorKnowledge: [],
    teachingExplanations: [],
    workedExamples: [],
    guidedPractice: [],
    independentPractice: [],
    reflectionTasks: [],
    starterQuestions: [{
      id: "q1",
      prompt: "5 .2 5.2 0.2 5 5 0.2 7 .3 7 0.3 7 7.3 0.3 103.2 Complete the part-part-whole models.",
      sourceComponent: "worksheet" as const,
      markingMode: "auto" as const,
    }],
    starterAnswers: [],
    worksheetTasks: [],
    worksheetAnswers: [],
    exitQuestions: [],
    exitAnswers: [],
    misconceptions: [],
    teacherNotes: [],
    sourceMetadata: { providerHints: ["Oak National Academy"] },
    licenceMetadata: {},
  } satisfies LessonPackStructuredModel;

  const validation = validatePreDraft({
    structured,
    sourceName: "Oak National Academy",
    licenceType: "OGL",
    attribution: "Adapted from Oak.",
    thirdPartyCount: 0,
    providerHints: ["Oak National Academy"],
  });
  assert.equal(validation.playableFirstActivity, "blocked");
  assert.equal(validation.overallReady, false);
});

test("all auto-marked questions require answers in pairing report", () => {
  const structured = {
    title: "Compose decimals",
    subject: null,
    yearGroup: null,
    keyStage: null,
    curriculumArea: null,
    learningObjective: "I can compose decimals.",
    lessonOutcome: null,
    keywords: [],
    priorKnowledge: [],
    teachingExplanations: [],
    workedExamples: [],
    guidedPractice: [],
    independentPractice: [],
    reflectionTasks: [],
    starterQuestions: [],
    starterAnswers: [],
    worksheetTasks: [
      {
        id: "q1",
        prompt: "a) 1.8 = 1 + ___",
        answer: "0.8",
        sourceComponent: "worksheet" as const,
        markingMode: "auto" as const,
      },
      {
        id: "q2",
        prompt: "Write equations for the model",
        explanation: "Use addition and subtraction that match the part-part-whole model.",
        sourceComponent: "worksheet" as const,
        markingMode: "guided_review" as const,
      },
    ],
    worksheetAnswers: [],
    exitQuestions: [],
    exitAnswers: [],
    misconceptions: [],
    teacherNotes: [],
    sourceMetadata: {
      providerHints: ["Oak National Academy"],
      extractionMeta: {
        primarySources: [],
        guidanceGroups: 1,
        excludedFragments: 2,
        orphanCorrectAnswers: 0,
        questionsMissingAnswers: 0,
        autoMarked: 1,
        guidedReview: 1,
      },
    },
    licenceMetadata: {},
  } satisfies LessonPackStructuredModel;

  const report = buildQaPairingReport(structured);
  assert.equal(report.questionsWithoutAnswers, 0);
  assert.equal(report.orphanCorrectAnswers, 0);
  assert.equal(report.autoMarkedQuestions, 1);
  assert.equal(report.guidedReviewActivities, 1);

  const validation = validatePreDraft({
    structured,
    sourceName: "Oak National Academy",
    licenceType: "OGL",
    attribution: "Adapted from Oak.",
    thirdPartyCount: 0,
    providerHints: ["Oak National Academy"],
  });
  assert.equal(validation.questionAnswerPairing, "pass");
  assert.equal(validation.playableFirstActivity, "pass");
  assert.equal(isGarbledText(structured.learningObjective!), false);
  assert.equal(isUsableExtractedText("Task A: Complete models 1.8 = 1 + 0.8"), true);
});

test("manual pairing cannot cross lesson boundary (answers stay lesson-scoped)", () => {
  const lesson1 = extractWorksheetActivities(
    "Task B: Additive relationships 1) Fill in the blanks. a) 1.8 = 1 +",
    "worksheet",
    "lesson-1-file",
  );
  assert.ok(lesson1.length >= 1, "expected at least one extracted activity");
  const lesson2Answers = parseAnswerSheet("a) 9.9 = 9 +", "worksheet_answers", "lesson-2-file");
  const paired = pairActivitiesWithAnswers(lesson1, lesson2Answers.answers);
  assert.equal(paired.paired[0]?.answer, "0.8");
  assert.notEqual(paired.paired[0]?.answer, "0.9");
  assert.equal(paired.paired[0]?.sourceFileId, "lesson-1-file");
});

test("multiline lettered question body still extracts sub-questions", () => {
  const text = [
    "Task B: Representing additive relationships",
    "1) Fill in the blanks to make these equations correct.",
    "a) 1.8 = 1 +",
    "b) 1.8 =",
    "+ 0.8",
    "c) 2.4 = 2 +",
  ].join("\n");
  const acts = extractWorksheetActivities(text, "worksheet");
  assert.ok(acts.some((a) => a.subQuestionNumber === "a"));
  assert.ok(acts.some((a) => a.subQuestionNumber === "b"));
  assert.ok(acts.some((a) => a.subQuestionNumber === "c"));
  assert.ok(acts.every((a) => a.prompt.length < 180));
  // Boundaries: a remains its own equation, not swallowed by b
  const a = acts.find((x) => x.subQuestionNumber === "a");
  assert.ok(a?.prompt.includes("1.8 = 1 +"));
  assert.equal(/b\)/.test(a?.prompt ?? ""), false);
});

test("multiline answer sheet still pairs lettered blanks", () => {
  const qText = [
    "Task B: Additive",
    "1) Fill in the blanks.",
    "a) 1.8 = 1 +",
    "b) 2.4 = 2 +",
  ].join("\n");
  const aText = [
    "a) 1.8 = 1 +",
    "b) 2.4 = 2 +",
    "Accept equivalent representations",
    "Pupils may notice place value",
  ].join("\n");
  const acts = extractWorksheetActivities(qText, "worksheet");
  const parsed = parseAnswerSheet(aText, "worksheet_answers");
  const paired = pairActivitiesWithAnswers(acts, parsed.answers);
  assert.equal(paired.paired.find((x) => x.subQuestionNumber === "a")?.answer, "0.8");
  assert.equal(paired.paired.find((x) => x.subQuestionNumber === "b")?.answer, "0.4");
  assert.equal(paired.orphanCorrectAnswers.length, 0);
  assert.ok(parsed.guidanceGroups >= 1);
  assert.ok(!parsed.answers.some((ans) => /Pupils may notice/i.test(ans.acceptedAnswers.join(" "))));
});

test("decimal expressions remain intact across multiline lettered chunks", () => {
  const text = "Task B: X\n1) Fill in.\na) 103.2 = 100 +\nb) 2.4 = 2 +";
  const acts = extractWorksheetActivities(text, "worksheet");
  const a = acts.find((x) => x.subQuestionNumber === "a");
  const b = acts.find((x) => x.subQuestionNumber === "b");
  assert.ok(a?.prompt.includes("103.2"));
  assert.ok(b?.prompt.includes("2.4"));
  assert.equal(inferDecimalBlankAnswer(a?.prompt ?? ""), "3.2");
  assert.equal(inferDecimalBlankAnswer(b?.prompt ?? ""), "0.4");
});
test("equivalent PDF/PPTX primaries are scoped per lesson folder", () => {
  const files = markEquivalentComponentSources([
    {
      id: "l1-pdf",
      originalName: "1-lesson-a/worksheet.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      sha256: "1",
      kind: "pdf",
      textContent: "%%%%EOF binary garbage",
      pageOrSlideCount: 1,
      headings: [],
      documentTitle: null,
      metadata: {},
      extractionStatus: "ok",
      classification: "worksheet",
      classificationConfidence: 0.9,
      classificationEvidence: [],
      lessonGroupId: "1-lesson-a",
    },
    {
      id: "l1-pptx",
      originalName: "1-lesson-a/worksheet.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      sizeBytes: 10,
      sha256: "2",
      kind: "pptx",
      textContent: "Task A: Complete the models. a) 1.8 = 1 +",
      pageOrSlideCount: 1,
      headings: [],
      documentTitle: null,
      metadata: {},
      extractionStatus: "ok",
      classification: "worksheet",
      classificationConfidence: 0.9,
      classificationEvidence: [],
      lessonGroupId: "1-lesson-a",
    },
    {
      id: "l2-pdf",
      originalName: "2-lesson-b/worksheet.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      sha256: "3",
      kind: "pdf",
      textContent: "%%%%EOF binary garbage",
      pageOrSlideCount: 1,
      headings: [],
      documentTitle: null,
      metadata: {},
      extractionStatus: "ok",
      classification: "worksheet",
      classificationConfidence: 0.9,
      classificationEvidence: [],
      lessonGroupId: "2-lesson-b",
    },
    {
      id: "l2-pptx",
      originalName: "2-lesson-b/worksheet.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      sizeBytes: 10,
      sha256: "4",
      kind: "pptx",
      textContent: "Task A: Round decimals. a) 2.4 = 2 +",
      pageOrSlideCount: 1,
      headings: [],
      documentTitle: null,
      metadata: {},
      extractionStatus: "ok",
      classification: "worksheet",
      classificationConfidence: 0.9,
      classificationEvidence: [],
      lessonGroupId: "2-lesson-b",
    },
  ]);
  const primary = files.filter((f) => f.isPrimaryExtractionSource);
  assert.equal(primary.length, 2);
  assert.ok(primary.some((f) => f.id === "l1-pptx"));
  assert.ok(primary.some((f) => f.id === "l2-pptx"));
  assert.equal(files.find((f) => f.id === "l1-pdf")?.isPrimaryExtractionSource, false);
  assert.equal(files.find((f) => f.id === "l2-pdf")?.isPrimaryExtractionSource, false);
});
test("incomplete answer-sheet equation fragments are not orphan correct answers", () => {
  const parsed = parseAnswerSheet(
    [
      "Task B: Additive",
      "a) 1.8 = 1 +",
      "b) 1.8 = + 0.8",
      "4.7 = 4 + 0.7",
      "4 = 4.",
      "4 = 0.3",
    ].join("\n"),
    "worksheet_answers",
  );
  assert.equal(parsed.answers.some((a) => a.answerType === "correct" && a.acceptedAnswers.includes("4 = 4.")), false);
  assert.equal(parsed.answers.some((a) => a.acceptedAnswers.includes("0.3") && !a.subQuestionNumber), false);
  assert.ok(parsed.answers.some((a) => a.answerType === "worked_solution" && a.acceptedAnswers.some((v) => v.includes("4.7 = 4 + 0.7"))));
  assert.ok(parsed.excludedFragments >= 1);
  const acts = extractWorksheetActivities(
    "Task B: X 1) Fill in. a) 1.8 = 1 + b) 1.8 = + 0.8",
    "worksheet",
  );
  const paired = pairActivitiesWithAnswers(acts, parsed.answers);
  assert.equal(paired.orphanCorrectAnswers.length, 0);
});
