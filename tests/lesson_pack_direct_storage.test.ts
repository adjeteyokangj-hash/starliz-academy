import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import {
  assertPrivateObjectKey,
  buildPrivateObjectKey,
  createSignedUpload,
  deleteStoredObject,
  getLessonPackStorageProvider,
  headStoredObject,
  verifyLocalUploadToken,
  writeLocalObjectFromBuffer,
  cleanupExpiredLocalObjects,
} from "../src/lib/lesson-pack-import/object-storage";
import { isGarbledText, buildStructuredImportModel, validatePreDraft } from "../src/lib/lesson-pack-import/content-extraction";
import { analyseLessonPackUpload } from "../src/lib/lesson-pack-import/pipeline";
import { sha256Hex, validateLessonPackUpload } from "../src/lib/lesson-pack-import/security";
import type { LessonPackComponentType, LessonPackUploadedFile } from "../src/lib/lesson-pack-import/types";
import { LESSON_PACK_UPLOAD_LIMITS } from "../src/lib/lesson-pack-import/upload-limits";

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
  };
}

test("private object keys are scoped to user and session", () => {
  const key = buildPrivateObjectKey({
    userId: "admin1",
    sessionId: "sessionABC",
    fileId: "file1",
    fileName: "pack.zip",
  });
  assert.match(key, /^lesson-packs\/private\/admin1\/sessionABC\//);
  assert.doesNotThrow(() => assertPrivateObjectKey(key, "sessionABC", "admin1"));
  assert.throws(() => assertPrivateObjectKey(key, "other", "admin1"));
  assert.throws(() => assertPrivateObjectKey("avatars/public.png", "sessionABC", "admin1"));
});

test("local signed upload is restricted to assigned private object and expires", async () => {
  process.env.LESSON_PACK_UPLOAD_SIGNING_SECRET = "test-secret-lesson-pack";
  const signed = await createSignedUpload({
    userId: "user1",
    sessionId: "sess1",
    fileId: "f1",
    fileName: "lesson.zip",
    mimeType: "application/zip",
    expectedSizeBytes: 1024,
    expiresInSeconds: 60,
  });
  assert.equal(signed.provider, getLessonPackStorageProvider() === "r2" ? "r2" : "local");
  if (signed.provider === "local") {
    assert.match(signed.uploadUrl, /\/api\/admin\/lesson-pack-import\/direct-put\?token=/);
    const token = decodeURIComponent(signed.uploadUrl.split("token=")[1]);
    const claims = verifyLocalUploadToken(token);
    assert.equal(claims.objectKey, signed.objectKey);
    assert.equal(claims.userId, "user1");
    assert.equal(claims.sessionId, "sess1");
  }
});

test("expired local upload token is rejected", () => {
  process.env.LESSON_PACK_UPLOAD_SIGNING_SECRET = "test-secret-lesson-pack";
  const body = Buffer.from(JSON.stringify({
    sessionId: "s",
    userId: "u",
    objectKey: "lesson-packs/private/u/s/f-x.zip",
    mimeType: "application/zip",
    maxBytes: 100,
    exp: Date.now() - 1000,
  })).toString("base64url");
  const sig = createHmac("sha256", "test-secret-lesson-pack").update(body).digest("base64url");
  assert.throws(() => verifyLocalUploadToken(`${body}.${sig}`), /expired/i);
});

test("actual stored size is used for limits (101MB rejected)", () => {
  const bad = validateLessonPackUpload({
    fileName: "huge.zip",
    mimeType: "application/zip",
    sizeBytes: 101 * 1024 * 1024,
    bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  });
  assert.equal(bad.ok, false);
});

test("local object write + head + delete works without public URL", async () => {
  if (getLessonPackStorageProvider() === "r2") return;
  const key = buildPrivateObjectKey({
    userId: "u-test",
    sessionId: "s-test",
    fileId: "f-test",
    fileName: "sample.txt",
  });
  const bytes = Buffer.from("Learning objective: I can add decimals.\n1. What is 0.3+0.4?");
  await writeLocalObjectFromBuffer(key, bytes);
  const head = await headStoredObject(key);
  assert.ok(head);
  assert.equal(head!.sizeBytes, bytes.length);
  await deleteStoredObject(key);
  const gone = await headStoredObject(key);
  assert.equal(gone, null);
});

test("source fingerprint calculated from verified content hashes", () => {
  const a = sha256Hex(Buffer.from("content-a"));
  const b = sha256Hex(Buffer.from("content-a"));
  assert.equal(a, b);
  const analysis = analyseLessonPackUpload({
    files: [{
      fileName: "notes.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("Year 5 Maths\nLearning objective: I can add decimals.\n1. Calculate 0.3+0.4\n", "utf8"),
    }],
  });
  assert.ok(analysis.lessons[0]?.duplicateReport.sourceFingerprint);
  assert.match(analysis.lessons[0]!.duplicateReport.sourceFingerprint, /^[a-f0-9]{64}$/);
});

test("corrupted objective rejected and answer file cannot become title", () => {
  assert.ok(isGarbledText("ÔÞæH#ýü959¼ä¡fl"));
  const model = buildStructuredImportModel({
    files: [
      makeFile({
        originalName: "answers.pdf",
        classification: "worksheet_answers" as LessonPackComponentType,
        documentTitle: "LESS-NMMRT-O3873 - Worksheet answers",
        textContent: "1. 0.7",
      }),
      makeFile({
        originalName: "slides.pptx",
        classification: "teaching_slides" as LessonPackComponentType,
        kind: "pptx",
        documentTitle: "Explain how decimal numbers with tenths can be composed additively",
        textContent: "Learning objective: ÔÞæH#ýü959¼ä¡fl",
      }),
    ],
  });
  assert.ok(!/LESS-/i.test(model.title));
  assert.ok(!/worksheet answers/i.test(model.title));
  assert.ok(model.learningObjective && !isGarbledText(model.learningObjective));
});

test("licence confirmation required for third-party draft readiness", () => {
  const model = buildStructuredImportModel({
    files: [makeFile({
      originalName: "w.pdf",
      classification: "worksheet" as LessonPackComponentType,
      documentTitle: "Decimals",
      textContent: "1. Add 0.1 and 0.2\nLearning objective: I can add decimals.",
    })],
    sourceName: "Oak National Academy",
  });
  const blocked = validatePreDraft({
    structured: model,
    sourceName: "Oak National Academy",
    licenceType: null,
    attribution: null,
    thirdPartyCount: 1,
    providerHints: ["Oak National Academy"],
  });
  assert.equal(blocked.licenceResult, "needs_input");
  assert.equal(blocked.overallReady, false);

  const ok = validatePreDraft({
    structured: model,
    sourceName: "Oak National Academy",
    licenceType: "Open Government Licence v3.0",
    attribution: "Adapted from Oak National Academy content licensed under the Open Government Licence v3.0.",
    thirdPartyCount: 1,
    providerHints: ["Oak National Academy"],
  });
  assert.equal(ok.licenceResult, "pass");
});

test("cleanupExpiredLocalObjects is idempotent", async () => {
  const cleaned = await cleanupExpiredLocalObjects(0);
  assert.ok(cleaned >= 0);
  const again = await cleanupExpiredLocalObjects(0);
  assert.ok(again >= 0);
});

test("upload limits remain 100/300/40", () => {
  assert.equal(LESSON_PACK_UPLOAD_LIMITS.maxFileBytes, 100 * 1024 * 1024);
  assert.equal(LESSON_PACK_UPLOAD_LIMITS.maxTotalBytes, 300 * 1024 * 1024);
  assert.equal(LESSON_PACK_UPLOAD_LIMITS.maxFiles, 40);
});
