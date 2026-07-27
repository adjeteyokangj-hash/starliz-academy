/**
 * Bulk Educational Content Import v1 - focused tests.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";

import { classifyLessonPackFile, groupFilesIntoLessonPacks } from "../src/lib/lesson-pack-import/classification";
import {
  buildStructuredImportModel,
  extractNumberedItems,
  linkQuestionsAndAnswers,
  validateQuestionAnswerSeparation,
} from "../src/lib/lesson-pack-import/content-extraction";
import { detectDifficultyFromPack } from "../src/lib/lesson-pack-import/difficulty-detection";
import { analyseLessonPackDuplicates } from "../src/lib/lesson-pack-import/duplicates";
import { analyseLessonPackUpload, assertDraftPublishBlocked } from "../src/lib/lesson-pack-import/pipeline";
import {
  buildSourceFingerprint,
  sha256Hex,
  validateLessonPackUpload,
} from "../src/lib/lesson-pack-import/security";
import { detectSubjectFromPack } from "../src/lib/lesson-pack-import/subject-detection";
import { detectThirdPartyMaterial } from "../src/lib/lesson-pack-import/third-party";
import { transformToStarLizDraft } from "../src/lib/lesson-pack-import/transform";
import type { LessonPackUploadedFile } from "../src/lib/lesson-pack-import/types";
import { detectYearGroupFromPack } from "../src/lib/lesson-pack-import/year-detection";
import { extractZipEntries } from "../src/lib/lesson-pack-import/zip-extract";

function makeFile(partial: Partial<LessonPackUploadedFile> & Pick<LessonPackUploadedFile, "originalName" | "textContent">): LessonPackUploadedFile {
  return {
    id: partial.id ?? sha256Hex(partial.originalName).slice(0, 12),
    originalName: partial.originalName,
    mimeType: partial.mimeType ?? "application/pdf",
    sizeBytes: partial.sizeBytes ?? 100,
    sha256: partial.sha256 ?? sha256Hex(partial.originalName + partial.textContent),
    kind: partial.kind ?? "pdf",
    textContent: partial.textContent,
    pageOrSlideCount: partial.pageOrSlideCount ?? 1,
    headings: partial.headings ?? [],
    documentTitle: partial.documentTitle ?? null,
    metadata: partial.metadata ?? {},
    extractionStatus: partial.extractionStatus ?? "ok",
    classification: partial.classification ?? "unknown",
    classificationConfidence: partial.classificationConfidence ?? 0,
    classificationEvidence: partial.classificationEvidence ?? [],
    manualClassification: partial.manualClassification,
    lessonGroupId: partial.lessonGroupId,
  };
}

function buildStoredZip(entries: Array<{ name: string; content: string }>): Buffer {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.content, "utf8");
    const compressed = deflateRawSync(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, compressed);
  }
  return Buffer.concat(chunks);
}

const YEAR5_PACK_TEXT = [
  "Year 5 Maths - Fractions of amounts",
  "Learning objective: Calculate fractions of amounts in everyday contexts.",
  "Key vocabulary: numerator, denominator, fraction, whole",
  "Prior knowledge: Recall multiplication facts.",
  "",
  "Starter quiz",
  "1. What is 1/2 of 24?",
  "2. What is 1/4 of 40?",
  "3. Explain why 2/4 is equivalent to 1/2.",
  "",
  "Teaching explanation",
  "To find a fraction of an amount, divide by the denominator then multiply by the numerator.",
  "",
  "Worked example",
  "Find 3/5 of 40. 40 / 5 = 8. 8 x 3 = 24.",
  "",
  "Worksheet",
  "1. Calculate 2/3 of 18.",
  "2. Calculate 3/4 of 36.",
  "3. A bag has 60 sweets. How many is 1/5 of the bag?",
  "4. Justify which is larger: 2/5 of 50 or 1/2 of 40.",
  "",
  "Misconceptions",
  "Learners may multiply by the denominator instead of dividing.",
  "",
  "Exit quiz",
  "1. What is 3/8 of 32?",
  "2. Explain how you find a fraction of an amount.",
].join("\n");

test("classifies multi-file lesson pack components from filename and content", () => {
  const raw = [
    makeFile({ originalName: "starter-quiz-questions.pdf", textContent: "Starter quiz\n1. What is 1/2 of 24?\n2. What is 1/4 of 40?", documentTitle: "Starter quiz questions" }),
    makeFile({ originalName: "starter-quiz-answers.pdf", textContent: "Starter quiz answers\n1. 12\n2. 10", documentTitle: "Starter answers" }),
    makeFile({ originalName: "slidedeck.pptx", kind: "pptx", textContent: "Year 5 Fractions\nLearning objective: Calculate fractions of amounts\nTeaching explanation", documentTitle: "Teaching slides" }),
    makeFile({ originalName: "worksheet.pdf", textContent: "Worksheet\n1. Calculate 2/3 of 18.\n2. Calculate 3/4 of 36." }),
    makeFile({ originalName: "worksheet-answers.pdf", textContent: "Worksheet answers\n1. 12\n2. 27\nMark scheme" }),
    makeFile({ originalName: "exit-quiz-questions.pdf", textContent: "Exit quiz\n1. What is 3/8 of 32?" }),
    makeFile({ originalName: "exit-quiz-answers.pdf", textContent: "Exit quiz answers\n1. 12" }),
  ];
  const files = raw.map((file) => {
    const result = classifyLessonPackFile(file);
    return { ...file, classification: result.classification, classificationConfidence: result.confidence, classificationEvidence: result.evidence };
  });
  assert.equal(files[0].classification, "starter_questions");
  assert.equal(files[1].classification, "starter_answers");
  assert.equal(files[2].classification, "teaching_slides");
  assert.equal(files[3].classification, "worksheet");
  assert.equal(files[4].classification, "worksheet_answers");
  assert.equal(files[5].classification, "exit_questions");
  assert.equal(files[6].classification, "exit_answers");
});

test("separates questions from answers and links by stable IDs", () => {
  const files = [
    makeFile({ originalName: "starter-quiz-questions.pdf", classification: "starter_questions", textContent: "1. What is 1/2 of 24?\n2. What is 1/4 of 40?" }),
    makeFile({ originalName: "starter-quiz-answers.pdf", classification: "starter_answers", textContent: "1. 12\n2. 10" }),
  ];
  const model = buildStructuredImportModel({ files });
  assert.equal(model.starterQuestions.length, 2);
  assert.equal(model.starterQuestions[0].prompt.includes("1/2 of 24"), true);
  assert.equal(model.starterQuestions[0].answer, "12");
  assert.equal(model.starterQuestions[1].answer, "10");
  assert.ok(model.starterQuestions[0].id.startsWith("q_"));
  const issues = validateQuestionAnswerSeparation(model);
  assert.equal(issues.filter((i) => i.includes("looks like an answer sheet")).length, 0);
});

test("detects Year 5 from uploaded example text", () => {
  const result = detectYearGroupFromPack({
    title: "Year 5 Maths - Fractions of amounts",
    headings: ["Year 5 Maths", "Learning objective"],
    text: YEAR5_PACK_TEXT,
  });
  assert.equal(result.value, "Year 5");
  assert.ok(result.confidence >= 0.9);
  assert.ok(result.evidence.some((e) => /Year 5/i.test(e)));
  assert.equal(result.keyStage, "KS2");
});

test("manual year-group override is authoritative with mismatch warning", () => {
  const result = detectYearGroupFromPack({
    title: "Year 5 Maths - Fractions of amounts",
    text: YEAR5_PACK_TEXT,
    manualYearGroup: "Year 2",
  });
  assert.equal(result.value, "Year 2");
  assert.ok(result.mismatchWarning);
  assert.match(result.mismatchWarning ?? "", /Year 5/);
});

test("detects difficulty on StarLiz 1-5 scale", () => {
  const files = [makeFile({ originalName: "worksheet.pdf", classification: "worksheet", textContent: YEAR5_PACK_TEXT, documentTitle: "Year 5 Fractions" })];
  const structured = buildStructuredImportModel({ files });
  const difficulty = detectDifficultyFromPack({ structured, combinedText: YEAR5_PACK_TEXT, yearGroup: "Year 5" });
  assert.ok(difficulty.overall >= 1 && difficulty.overall <= 5);
  assert.ok(difficulty.reasons.length >= 1);
  assert.ok(difficulty.byBlock.length >= 1);
});

test("detects maths subject from pack content", () => {
  const result = detectSubjectFromPack({ title: "Year 5 Maths - Fractions of amounts", text: YEAR5_PACK_TEXT });
  assert.equal(result.value, "maths");
  assert.ok(result.confidence >= 0.5);
});

test("detects multiple lessons in one ZIP via folder grouping", () => {
  const zip = buildStoredZip([
    { name: "lesson-a/starter-quiz-questions.txt", content: "Lesson A starter\n1. 2+2?" },
    { name: "lesson-a/worksheet.txt", content: "Lesson A worksheet\n1. 3+3?" },
    { name: "lesson-b/starter-quiz-questions.txt", content: "Lesson B starter\n1. Photosynthesis?" },
    { name: "lesson-b/worksheet.txt", content: "Lesson B worksheet\n1. Habitat?" },
  ]);
  assert.equal(extractZipEntries(zip).length, 4);
  const analysis = analyseLessonPackUpload({
    files: [{ fileName: "pack.zip", mimeType: "application/zip", bytes: zip }],
    sessionType: "school_day",
  });
  assert.ok(analysis.lessonCount >= 2, "expected >=2 lessons, got " + analysis.lessonCount);
});

test("exact and near duplicate detection reuses existing StarLiz detector", () => {
  const files = [
    makeFile({ originalName: "starter-quiz-questions.pdf", classification: "starter_questions", textContent: "1. What is 18 divided by 3?" }),
    makeFile({ originalName: "exit-quiz-questions.pdf", classification: "exit_questions", textContent: "1. What is 18 divided by 3?" }),
  ];
  const structured = buildStructuredImportModel({ files });
  const report = analyseLessonPackDuplicates({
    structured,
    fileHashes: files.map((f) => f.sha256),
    yearGroup: "Year 5",
    subject: "maths",
    historicalRecords: [{
      contentId: "old-1",
      contentStatus: "published",
      contentSubject: "maths",
      contentYearGroup: "Year 5",
      topic: "Fractions",
      contentJson: JSON.stringify([{ prompt: "What is 18 divided by 3?", answer: "6" }]),
    }],
  });
  assert.ok(["exact", "high_confidence", "possible"].includes(report.level));
  assert.ok(report.matches.length >= 1);
});

test("detects question clone with changed numbers across starter and exit", () => {
  const structured = buildStructuredImportModel({
    files: [
      makeFile({ originalName: "starter-quiz-questions.pdf", classification: "starter_questions", textContent: "1. A baker uses 36 eggs to make 6 cakes. How many eggs per cake?" }),
      makeFile({ originalName: "exit-quiz-questions.pdf", classification: "exit_questions", textContent: "1. A baker uses 48 eggs to make 8 cakes. How many eggs per cake?" }),
    ],
  });
  const report = analyseLessonPackDuplicates({ structured, fileHashes: ["a", "b"], historicalRecords: [] });
  assert.ok(report.matches.some((m) => /clone with changed numbers|starter and exit/i.test(m.reason)));
});

test("duplicate override and publish-blocked helpers", () => {
  assert.equal(assertDraftPublishBlocked("awaiting_review"), true);
  assert.equal(assertDraftPublishBlocked("generated"), true);
  assert.equal(assertDraftPublishBlocked("approved"), false);
});

test("third-party images and branding are flagged for exclusion by default", () => {
  const findings = detectThirdPartyMaterial([
    makeFile({ originalName: "slidedeck.pptx", kind: "pptx", textContent: "Oak National Academy logo\nPhotograph of a book cover\nYouTube.com embed", documentTitle: "Oak slides" }),
  ]);
  assert.ok(findings.length >= 1);
  assert.ok(findings.every((f) => f.action === "exclude"));
});

test("licence and attribution metadata preserved into StarLiz transform", () => {
  const structured = buildStructuredImportModel({
    files: [makeFile({ originalName: "teacher-notes.pdf", classification: "teacher_notes", textContent: YEAR5_PACK_TEXT, documentTitle: "Year 5 Fractions" })],
    sourceName: "Oak National Academy",
    sourceUrl: "https://www.thenational.academy/example",
    licenceType: "OGL",
    attribution: "Adapted from Oak National Academy",
  });
  const transformed = transformToStarLizDraft({ structured, sessionType: "school_day", difficulty: 3, excludeThirdParty: true });
  assert.equal(transformed.metadata.licenceType, "OGL");
  assert.equal(transformed.metadata.attribution, "Adapted from Oak National Academy");
  assert.equal(transformed.metadata.studentFacingBranding, "starliz");
  assert.equal(transformed.metadata.adaptedFromThirdParty, true);
  assert.ok(transformed.items.some((item) => item.block === "lesson_introduction"));
  assert.ok(transformed.items.some((item) => item.block === "ai_tutor_support"));
});

test("partial file failure does not discard successful files", () => {
  const pdfHeader = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  const analysis = analyseLessonPackUpload({
    files: [
      { fileName: "good.txt", mimeType: "text/plain", bytes: Buffer.from(YEAR5_PACK_TEXT, "utf8") },
      { fileName: "bad.exe", mimeType: "application/octet-stream", bytes: Buffer.from("MZ") },
      { fileName: "notes.pdf", mimeType: "application/pdf", bytes: pdfHeader },
    ],
  });
  assert.ok(analysis.files.length >= 1);
  assert.ok(analysis.partialFailures.length >= 1);
  assert.ok(analysis.lessons.length >= 1);
});

test("malicious executable uploads are rejected", () => {
  const result = validateLessonPackUpload({
    fileName: "payload.exe",
    mimeType: "application/octet-stream",
    sizeBytes: 12,
    bytes: Buffer.from("MZ.............."),
  });
  assert.equal(result.ok, false);
});

test("source fingerprint is stable for identical packs", () => {
  const a = buildSourceFingerprint({
    fileHashes: ["aaa", "bbb"],
    normalisedTitle: "Year 5 Fractions",
    sourceProvider: "Oak",
    sourceUrl: "https://example.com",
    yearGroup: "Year 5",
    subject: "maths",
    normalisedContent: "objective text",
  });
  const b = buildSourceFingerprint({
    fileHashes: ["bbb", "aaa"],
    normalisedTitle: "Year 5 Fractions",
    sourceProvider: "Oak",
    sourceUrl: "https://example.com",
    yearGroup: "Year 5",
    subject: "maths",
    normalisedContent: "objective text",
  });
  assert.equal(a, b);
});

test("linkQuestionsAndAnswers does not expose answer sheets as student prompts", () => {
  const questions = extractNumberedItems("1. What is 1/2 of 24?\n2. What is 1/5 of 50?").map((item, index) => ({
    id: "q_" + index,
    prompt: item.body,
    sourceComponent: "starter_questions" as const,
  }));
  const answers = extractNumberedItems("1. 12\n2. 10").map((item, index) => ({
    id: "a_" + index,
    prompt: "",
    answer: item.body,
    sourceComponent: "starter_answers" as const,
  }));
  const linked = linkQuestionsAndAnswers(questions, answers);
  assert.equal(linked[0].prompt.includes("What is"), true);
  assert.equal(linked[0].answer, "12");
});

test("manual classification override wins over auto classification", () => {
  const file = makeFile({ originalName: "mystery.pdf", textContent: "random text", manualClassification: "teacher_notes" });
  const result = classifyLessonPackFile(file);
  assert.equal(result.classification, "teacher_notes");
  assert.equal(result.confidence, 1);
});

test("groupFilesIntoLessonPacks keeps related components together", () => {
  const groups = groupFilesIntoLessonPacks([
    makeFile({ originalName: "fractions-starter-questions.pdf", textContent: "q" }),
    makeFile({ originalName: "fractions-worksheet.pdf", textContent: "w" }),
    makeFile({ originalName: "forces-starter-questions.pdf", textContent: "q2" }),
  ]);
  assert.ok(groups.size >= 1);
});
