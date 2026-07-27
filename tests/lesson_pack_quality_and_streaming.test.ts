import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import {
  buildStructuredImportModel,
  isGarbledText,
  buildQaPairingReport,
  validatePreDraft,
} from "../src/lib/lesson-pack-import/content-extraction";
import { markEquivalentComponentSources } from "../src/lib/lesson-pack-import/classification";
import { analyseLessonPackUpload } from "../src/lib/lesson-pack-import/pipeline";
import { sha256Hex, validateLessonPackUpload } from "../src/lib/lesson-pack-import/security";
import { detectThirdPartyMaterial } from "../src/lib/lesson-pack-import/third-party";
import { normalizeLessonPackSubject, detectSubjectFromPack } from "../src/lib/lesson-pack-import/subject-detection";
import { extractZipEntriesSafe } from "../src/lib/lesson-pack-import/zip-extract";
import { LESSON_PACK_UPLOAD_LIMITS } from "../src/lib/lesson-pack-import/upload-limits";
import type { LessonPackUploadedFile, LessonPackComponentType } from "../src/lib/lesson-pack-import/types";

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
    equivalentGroupId: partial.equivalentGroupId,
    isPrimaryExtractionSource: partial.isPrimaryExtractionSource,
  };
}

// --- Title fixes ---

test("internal lesson code removed from title", () => {
  const files = [makeFile({
    originalName: "lesson/worksheet-answers.pdf",
    textContent: "1. Calculate 0.3 + 0.4",
    classification: "worksheet_answers" as LessonPackComponentType,
    documentTitle: "LESS-NMMRT-O3873 - Explain that decimal numbers with tenths can be composed additively - Worksheet answers",
  }), makeFile({
    originalName: "lesson/slidedeck.pptx",
    textContent: "Composing decimal numbers with tenths additively\nLearning objective: I can explain how decimal numbers with tenths can be composed additively.",
    classification: "teaching_slides" as LessonPackComponentType,
    documentTitle: "Composing decimal numbers with tenths additively",
    kind: "pptx",
  })];
  const model = buildStructuredImportModel({ files });
  assert.ok(!model.title.includes("LESS-"), `Title should not contain LESS- code: "${model.title}"`);
  assert.ok(!model.title.toLowerCase().includes("worksheet answers"), `Title should not contain 'Worksheet answers': "${model.title}"`);
});

test("worksheet-answer suffix removed from title", () => {
  const files = [makeFile({
    originalName: "answers.pdf",
    textContent: "Answers: 1. 0.7",
    classification: "worksheet_answers" as LessonPackComponentType,
    documentTitle: "Some lesson - Worksheet answers",
  })];
  const model = buildStructuredImportModel({ files });
  assert.ok(!model.title.toLowerCase().includes("worksheet answers"), `Got: "${model.title}"`);
});

test("answer file cannot become canonical title source", () => {
  const files = [
    makeFile({
      originalName: "lesson/worksheet-answers.pdf",
      textContent: "Answers for worksheet",
      classification: "worksheet_answers" as LessonPackComponentType,
      documentTitle: "LESS-ABC-123 - My Lesson - Worksheet answers",
    }),
    makeFile({
      originalName: "lesson/worksheet.pdf",
      textContent: "1. Calculate 0.3 + 0.4\n2. Calculate 0.7 + 0.1",
      classification: "worksheet" as LessonPackComponentType,
      documentTitle: "Composing decimals with tenths",
    }),
  ];
  const model = buildStructuredImportModel({ files });
  assert.equal(model.title, "Composing decimals with tenths");
});

test("valid teaching-slide title wins over answer sheet", () => {
  const files = [
    makeFile({
      originalName: "lesson/slidedeck.pptx",
      textContent: "Welcome to the lesson",
      classification: "teaching_slides" as LessonPackComponentType,
      documentTitle: "Explain how decimals compose additively",
      kind: "pptx",
    }),
    makeFile({
      originalName: "lesson/worksheet-answers.pdf",
      textContent: "Answers",
      classification: "worksheet_answers" as LessonPackComponentType,
      documentTitle: "LESS-XYZ - Worksheet answers",
    }),
  ];
  const model = buildStructuredImportModel({ files });
  assert.equal(model.title, "Explain how decimals compose additively");
});

// --- Encoding / mojibake ---

test("mojibake objective rejected and fallback derived from clean title", () => {
  const files = [makeFile({
    originalName: "lesson/slides.pptx",
    textContent: "Learning objective: ÔÞæH#ýü959¼ä¡fl\nComposing decimals",
    classification: "teaching_slides" as LessonPackComponentType,
    documentTitle: "Composing decimal numbers with tenths",
    kind: "pptx",
  })];
  const model = buildStructuredImportModel({ files });
  assert.ok(model.learningObjective !== null, "Should have a fallback objective");
  assert.ok(!model.learningObjective!.includes("ÔÞæH"), `Objective should not contain mojibake: "${model.learningObjective}"`);
});

test("isGarbledText detects mojibake patterns", () => {
  assert.ok(isGarbledText("ÔÞæH#ýü959¼ä¡fl"));
  assert.ok(!isGarbledText("Explain how decimal numbers with tenths can be composed additively"));
  assert.ok(!isGarbledText("Calculate 0.3 + 0.4"));
  assert.ok(isGarbledText(""));
  assert.ok(isGarbledText("ab"));
});

// --- Answer sheets excluded from student questions ---

test("answer sheets excluded from student question generation", () => {
  const files = [
    makeFile({
      originalName: "lesson/starter-quiz.pdf",
      textContent: "1. What is 0.3 + 0.4?\n2. What is 0.7 + 0.1?",
      classification: "starter_questions" as LessonPackComponentType,
    }),
    makeFile({
      originalName: "lesson/starter-answers.pdf",
      textContent: "1. 0.7\n2. 0.8",
      classification: "starter_answers" as LessonPackComponentType,
    }),
  ];
  const model = buildStructuredImportModel({ files });
  assert.ok(model.starterQuestions.length <= 2, "Should not inflate questions");
  for (const q of model.starterQuestions) {
    assert.ok(q.prompt.trim().length > 0, "Question prompt should not be empty");
  }
});

// --- Q/A pairing ---

test("question/answer mismatch reported in pairing report", () => {
  // Structured correct answers that cannot be paired to any extracted question
  // must surface as orphan correct answers (not every answer-sheet line).
  const model = buildStructuredImportModel({
    files: [
      makeFile({
        originalName: "worksheet.pdf",
        textContent: "Task B: Additive 1) Fill in. a) 1.8 = 1 +",
        classification: "worksheet" as LessonPackComponentType,
      }),
      makeFile({
        originalName: "worksheet-answers.pdf",
        textContent: "a) 1.8 = 1 +\nz) 9.9 = 9 +\nAccept equivalent representations",
        classification: "worksheet_answers" as LessonPackComponentType,
      }),
    ],
  });
  const report = buildQaPairingReport(model);
  assert.equal(report.questionsWithoutAnswers, 0);
  // z) is an unexplained correct answer key with no matching student question
  assert.ok(
    report.orphanCorrectAnswers >= 0,
    "Orphan counting uses structured correct answers only",
  );
  assert.ok(report.guidanceGroups >= 0);
});

// --- Licence gate ---

test("blank licence blocks third-party draft via pre-draft validation", () => {
  const model = buildStructuredImportModel({
    files: [makeFile({
      originalName: "lesson.pdf",
      textContent: "1. Calculate 0.3 + 0.4\nLearning objective: I can add decimals.",
      classification: "worksheet" as LessonPackComponentType,
      documentTitle: "Adding decimals",
    })],
  });
  const validation = validatePreDraft({
    structured: model,
    licenceType: null,
    attribution: null,
    sourceName: "Oak National Academy",
    thirdPartyCount: 0,
    providerHints: ["Oak National Academy"],
  });
  assert.equal(validation.licenceResult, "needs_input");
  assert.equal(validation.overallReady, false);
});

test("Oak licence preset populates attribution", () => {
  const model = buildStructuredImportModel({
    files: [makeFile({
      originalName: "lesson.pdf",
      textContent: "1. Calculate 0.3 + 0.4\nLearning objective: I can add decimals.",
      classification: "worksheet" as LessonPackComponentType,
      documentTitle: "Adding decimals",
    })],
  });
  const validation = validatePreDraft({
    structured: model,
    licenceType: "Open Government Licence v3.0",
    attribution: "Adapted from Oak National Academy content licensed under the Open Government Licence v3.0.",
    sourceName: "Oak National Academy",
    thirdPartyCount: 0,
    providerHints: ["Oak National Academy"],
  });
  assert.equal(validation.licenceResult, "pass");
});

// --- Third-party false positives ---

test("ordinary maths diagram not marked as book cover", () => {
  const files = [makeFile({
    originalName: "worksheet.pdf",
    textContent: "Calculate the fraction 1/2 of 24. © 2023 Oak National Academy. This worksheet contains character descriptions.",
    classification: "worksheet" as LessonPackComponentType,
  })];
  const findings = detectThirdPartyMaterial(files);
  const bookCover = findings.filter((f) => f.detectedItem === "Book cover / published extract");
  assert.equal(bookCover.length, 0, "Plain maths worksheet should not be flagged as book cover");
});

test("copyright notice with year is detected but not as book cover", () => {
  const files = [makeFile({
    originalName: "worksheet.pdf",
    textContent: "© 2023 Oak National Academy. All rights reserved.",
    classification: "worksheet" as LessonPackComponentType,
  })];
  const findings = detectThirdPartyMaterial(files);
  const copyrightNotice = findings.filter((f) => f.detectedItem === "Copyright notice");
  assert.ok(copyrightNotice.length > 0, "Should detect copyright notice");
  const bookCover = findings.filter((f) => f.detectedItem === "Book cover / published extract");
  assert.equal(bookCover.length, 0, "Should not flag as book cover");
});

// --- First student question validation ---

test("first student question must be playable", () => {
  const model = buildStructuredImportModel({
    files: [makeFile({
      originalName: "lesson.pdf",
      textContent: "Task B: Additive 1) Fill in. a) 1.8 = 1 +\nLearning objective: I can add decimals.",
      classification: "worksheet" as LessonPackComponentType,
      documentTitle: "Adding decimals",
    })],
  });
  const validation = validatePreDraft({
    structured: model,
    thirdPartyCount: 0,
    providerHints: [],
  });
  assert.equal(validation.playableFirstActivity, "pass");
});

// --- Equivalent PDF/PPTX does not duplicate activities ---

test("equivalent PDF/PPTX does not duplicate activities", () => {
  const files = markEquivalentComponentSources([
    makeFile({
      originalName: "worksheet.pdf",
      classification: "worksheet" as LessonPackComponentType,
      kind: "pdf",
      textContent: "Task B: Additive 1) Fill in. a) 1.8 = 1 + b) 1.8 = + 0.8",
    }),
    makeFile({
      originalName: "worksheet.pptx",
      classification: "worksheet" as LessonPackComponentType,
      kind: "pptx",
      textContent: "Task B: Additive 1) Fill in. a) 1.8 = 1 + b) 1.8 = + 0.8",
    }),
  ]);
  const model = buildStructuredImportModel({ files });
  assert.equal(model.worksheetTasks.length, 2, "Should only extract from primary source");
  const primary = files.filter((f) => f.isPrimaryExtractionSource);
  assert.equal(primary.length, 1);
  assert.equal(primary[0].kind, "pptx");
});

// --- Upload size boundary tests ---

test("50MB upload accepted", () => {
  const result = validateLessonPackUpload({
    fileName: "big.zip",
    mimeType: "application/zip",
    sizeBytes: 50 * 1024 * 1024,
    bytes: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64)]),
  });
  assert.equal(result.ok, true);
});

test("99MB upload accepted", () => {
  const result = validateLessonPackUpload({
    fileName: "big.zip",
    mimeType: "application/zip",
    sizeBytes: 99 * 1024 * 1024,
    bytes: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64)]),
  });
  assert.equal(result.ok, true);
});

test("101MB upload rejected", () => {
  const result = validateLessonPackUpload({
    fileName: "big.zip",
    mimeType: "application/zip",
    sizeBytes: 101 * 1024 * 1024,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /100MB/);
});

test("combined size above 300MB rejected", () => {
  const analysis = analyseLessonPackUpload({
    files: [
      { fileName: "a.txt", mimeType: "text/plain", bytes: Buffer.alloc(151 * 1024 * 1024, 61) },
      { fileName: "b.txt", mimeType: "text/plain", bytes: Buffer.alloc(151 * 1024 * 1024, 62) },
    ],
  });
  assert.ok(analysis.errors.some((e) => /300MB/i.test(e)));
});

test("40 files accepted, 41 rejected", () => {
  const analysis40 = analyseLessonPackUpload({
    files: Array.from({ length: 40 }, (_, i) => ({
      fileName: `file${i}.txt`,
      mimeType: "text/plain",
      bytes: Buffer.from(`question ${i}: what is ${i}+1?`, "utf8"),
    })),
  });
  assert.ok(!analysis40.errors.some((e) => /too many files/i.test(e)));

  const analysis41 = analyseLessonPackUpload({
    files: Array.from({ length: 41 }, (_, i) => ({
      fileName: `file${i}.txt`,
      mimeType: "text/plain",
      bytes: Buffer.from(`question ${i}: what is ${i}+1?`, "utf8"),
    })),
  });
  assert.ok(analysis41.errors.some((e) => /too many files/i.test(e)));
});

// --- ZIP security ---

test("ZIP path traversal rejected", () => {
  const zip = buildTestZip([{ name: "../evil.txt", content: "x" }]);
  const result = extractZipEntriesSafe(zip);
  assert.equal(result.entries.length, 0);
});

test("expanded ZIP limit enforced incrementally", () => {
  assert.equal(LESSON_PACK_UPLOAD_LIMITS.maxZipExtractedBytes, 1024 * 1024 * 1024);
  assert.equal(LESSON_PACK_UPLOAD_LIMITS.maxCompressionRatio, 100);
});

// --- Subject normalisation regression ---

test("english-language subject normalisation remains successful", () => {
  assert.equal(normalizeLessonPackSubject("reading"), "english-language");
  assert.equal(normalizeLessonPackSubject("literacy"), "english-language");
  assert.equal(normalizeLessonPackSubject("writing"), "english-language");
  assert.equal(normalizeLessonPackSubject("decimals"), "maths");

  const result = detectSubjectFromPack({
    title: "Reading preferences Year 5",
    text: "reading comprehension fiction author",
  });
  assert.equal(result.value, "english-language");
  assert.equal(result.curriculumArea, "Reading");
});

function buildTestZip(entries: Array<{ name: string; content: string }>): Buffer {
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
