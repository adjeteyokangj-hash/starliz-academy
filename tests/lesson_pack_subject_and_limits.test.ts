import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import { markEquivalentComponentSources } from "../src/lib/lesson-pack-import/classification";
import { buildStructuredImportModel } from "../src/lib/lesson-pack-import/content-extraction";
import { analyseLessonPackUpload } from "../src/lib/lesson-pack-import/pipeline";
import {
  LESSON_PACK_MAX_FILE_BYTES,
  LESSON_PACK_MAX_FILES,
  LESSON_PACK_MAX_TOTAL_BYTES,
  sha256Hex,
  validateLessonPackUpload,
} from "../src/lib/lesson-pack-import/security";
import {
  detectSubjectFromPack,
  normalizeLessonPackSubject,
} from "../src/lib/lesson-pack-import/subject-detection";
import type { LessonPackUploadedFile } from "../src/lib/lesson-pack-import/types";
import {
  LESSON_PACK_UPLOAD_LIMITS,
  formatLessonPackFileLimitError,
  formatLessonPackTotalLimitError,
} from "../src/lib/lesson-pack-import/upload-limits";
import { extractZipEntriesSafe } from "../src/lib/lesson-pack-import/zip-extract";
import { estimatedDurationMinutes } from "../src/lib/lesson-pack-import/transform";

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

test("reading literacy writing map to canonical english-language subject", () => {
  assert.equal(normalizeLessonPackSubject("reading"), "english-language");
  assert.equal(normalizeLessonPackSubject("literacy"), "english-language");
  assert.equal(normalizeLessonPackSubject("writing"), "english-language");
  assert.equal(normalizeLessonPackSubject("fractions"), "maths");
  assert.equal(normalizeLessonPackSubject("biology"), "science");
  assert.equal(normalizeLessonPackSubject("not-a-real-subject-xyz"), null);
});

test("Year 5 reading preferences lesson detects english-language with Reading curriculum area", () => {
  const result = detectSubjectFromPack({
    title: "Developing reading preferences in Year 5 through personal reflection",
    text: "English reading preferences author illustrator fiction book covers",
  });
  assert.equal(result.value, "english-language");
  assert.equal(result.curriculumArea, "Reading");
  assert.equal(result.needsInput, false);
  assert.notEqual(result.value, "reading");
});

test("manual subject override remains authoritative for lesson packs", () => {
  const result = detectSubjectFromPack({
    title: "Developing reading preferences in Year 5 through personal reflection",
    text: "reading comprehension fiction",
    manualSubject: "maths",
  });
  assert.equal(result.value, "maths");
  assert.match(String(result.warning ?? ""), /Admin selected maths/i);
});

test("unsupported subject detection needs input and is not saved as subject", () => {
  const result = detectSubjectFromPack({
    title: "Mysterious obscure topic without curriculum cues",
    text: "lorem ipsum dolor sit amet completely unrelated gibberish",
    manualSubject: "made-up-subject-999",
  });
  assert.equal(result.value, null);
  assert.equal(result.needsInput, true);
});

test("equivalent PDF/PPTX worksheet does not duplicate activities", () => {
  const files = markEquivalentComponentSources([
    makeFile({
      originalName: "worksheet.pdf",
      classification: "worksheet",
      kind: "pdf",
      textContent: "1. Calculate 1/2 of 24\n2. Calculate 1/4 of 40",
    }),
    makeFile({
      originalName: "worksheet.pptx",
      classification: "worksheet",
      kind: "pptx",
      textContent: "1. Calculate 1/2 of 24\n2. Calculate 1/4 of 40",
    }),
  ]);
  assert.ok(files.every((f) => f.equivalentGroupId));
  assert.equal(files.filter((f) => f.isPrimaryExtractionSource).length, 1);
  const model = buildStructuredImportModel({ files });
  assert.equal(model.worksheetTasks.length, 2);
});

test("upload limits are shared and error messages use configured values", () => {
  assert.equal(LESSON_PACK_UPLOAD_LIMITS.maxFileBytes, 100 * 1024 * 1024);
  assert.equal(LESSON_PACK_UPLOAD_LIMITS.maxTotalBytes, 300 * 1024 * 1024);
  assert.equal(LESSON_PACK_UPLOAD_LIMITS.maxFiles, 40);
  assert.match(formatLessonPackFileLimitError(), /100MB/);
  assert.match(formatLessonPackTotalLimitError(), /300MB/);
  const ok99 = validateLessonPackUpload({
    fileName: "pack.zip",
    mimeType: "application/zip",
    sizeBytes: 99 * 1024 * 1024,
    bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  });
  assert.equal(ok99.ok, true);
  const bad101 = validateLessonPackUpload({
    fileName: "pack.zip",
    mimeType: "application/zip",
    sizeBytes: 101 * 1024 * 1024,
  });
  assert.equal(bad101.ok, false);
  assert.match(String(bad101.ok === false ? bad101.error : ""), /100MB/);
});

test("37MB-sized ZIP upload validates against individual file limit", () => {
  const size = 37 * 1024 * 1024;
  const result = validateLessonPackUpload({
    fileName: "compose-and-calculate-with-decimals-including-column-addition-and-subtraction-389.zip",
    mimeType: "application/zip",
    sizeBytes: size,
    bytes: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64)]),
  });
  assert.equal(result.ok, true);
});

test("combined upload above 300MB is rejected by analyse pipeline", () => {
  const analysis = analyseLessonPackUpload({
    files: [
      { fileName: "a.txt", mimeType: "text/plain", bytes: Buffer.alloc(151 * 1024 * 1024, 61) },
      { fileName: "b.txt", mimeType: "text/plain", bytes: Buffer.alloc(151 * 1024 * 1024, 62) },
    ],
  });
  assert.ok(analysis.errors.some((e) => /300MB combined limit/i.test(e)));
});

test("ZIP path traversal and nested ZIP are rejected", () => {
  const traversal = buildStoredZip([{ name: "../evil.txt", content: "x" }]);
  const nested = buildStoredZip([{ name: "inner.zip", content: "PK\u0003\u0004nested" }]);
  const t = extractZipEntriesSafe(traversal);
  assert.equal(t.entries.length, 0);
  const n = extractZipEntriesSafe(nested);
  assert.ok(n.errors.some((e) => /Nested ZIP/i.test(e)) || n.entries.every((e) => !e.path.endsWith(".zip")));
});

test("client and server limits module exports identical configured caps", () => {
  assert.equal(LESSON_PACK_UPLOAD_LIMITS.maxFileBytes, LESSON_PACK_MAX_FILE_BYTES);
  assert.equal(LESSON_PACK_UPLOAD_LIMITS.maxTotalBytes, LESSON_PACK_MAX_TOTAL_BYTES);
  assert.equal(LESSON_PACK_UPLOAD_LIMITS.maxFiles, LESSON_PACK_MAX_FILES);
});

test("general library preserves source duration while short learning expands to 90/120", () => {
  assert.equal(estimatedDurationMinutes("general_library", 55), 55);
  assert.equal(estimatedDurationMinutes("short_learning_90", 55), 90);
  assert.equal(estimatedDurationMinutes("short_learning_120", 55), 120);
});

test("canonical subject is saved into analyse preview for reading pack title", () => {
  const analysis = analyseLessonPackUpload({
    files: [{
      fileName: "slidedeck.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      bytes: Buffer.from("PK\u0003\u0004fake"),
    }],
    // Force text path via plain extractable txt instead of broken pptx
  });
  // Use txt for reliable extraction
  const analysis2 = analyseLessonPackUpload({
    files: [{
      fileName: "teacher-notes.txt",
      mimeType: "text/plain",
      bytes: Buffer.from(
        "Developing reading preferences in Year 5 through personal reflection\nEnglish\nLearning objective: Reflect on reading preferences.\n1. Which author do you enjoy?\n",
        "utf8",
      ),
    }],
    sessionType: "general_library",
  });
  assert.equal(analysis2.lessons[0]?.subject, "english-language");
  assert.equal(analysis2.lessons[0]?.curriculumArea, "Reading");
  assert.equal(analysis2.lessons[0]?.yearGroup, "Year 5");
  void analysis;
});
