import assert from "node:assert/strict";
import test from "node:test";
import {
  LESSON_PACK_R2_CORS_POLICY,
  UPLOAD_PUT_CONCURRENCY,
  mapUploadFailure,
  normalizeLessonPackMimeType,
} from "../src/lib/lesson-pack-import/upload-errors";
import {
  assertLessonPackStorageForRuntime,
  createSignedUpload,
  getLessonPackStorageProvider,
  isDeployedLessonPackRuntime,
  isR2Configured,
} from "../src/lib/lesson-pack-import/object-storage";

test("ZIP mime types normalise to application/zip for signed Content-Type consistency", () => {
  assert.equal(normalizeLessonPackMimeType("pack.zip", ""), "application/zip");
  assert.equal(normalizeLessonPackMimeType("pack.zip", "application/octet-stream"), "application/zip");
  assert.equal(normalizeLessonPackMimeType("pack.zip", "application/x-zip-compressed"), "application/zip");
  assert.equal(normalizeLessonPackMimeType("notes.pdf", "application/pdf"), "application/pdf");
});

test("generic network error maps to stage-specific R2 preflight message", () => {
  const mapped = mapUploadFailure({
    stage: "r2_preflight",
    error: new Error("Network error during upload"),
    fileName: "compose-and-calculate-with-decimals-including-column-addition-and-subtraction-389.zip",
    httpStatus: 0,
  });
  assert.equal(mapped.stage, "r2_preflight");
  assert.equal(mapped.code, "r2_cors_or_network");
  assert.match(mapped.message, /compose-and-calculate/);
  assert.match(mapped.message, /CORS|preflight/i);
  assert.doesNotMatch(mapped.message, /token=|Secret|ACCESS_KEY/i);
});

test("expired signed target maps to safe expiry message", () => {
  const mapped = mapUploadFailure({
    stage: "r2_put",
    error: new Error("Upload failed (401)"),
    fileName: "a.zip",
    httpStatus: 401,
  });
  assert.equal(mapped.code, "r2_url_expired");
  assert.match(mapped.message, /expired/i);
});

test("deployed runtime without R2 does not fall back to local", () => {
  const previous = {
    vercel: process.env.VERCEL,
    require: process.env.LESSON_PACK_REQUIRE_R2,
    account: process.env.CLOUDFLARE_R2_ACCOUNT_ID,
    bucket: process.env.CLOUDFLARE_R2_BUCKET,
    bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME,
    endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
    access: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secret: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  };
  process.env.VERCEL = "1";
  delete process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_R2_BUCKET;
  delete process.env.CLOUDFLARE_R2_BUCKET_NAME;
  delete process.env.CLOUDFLARE_R2_ENDPOINT;
  delete process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  delete process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

  try {
    assert.equal(isDeployedLessonPackRuntime(), true);
    assert.equal(isR2Configured(), false);
    assert.equal(getLessonPackStorageProvider(), "local");
    assert.throws(
      () => assertLessonPackStorageForRuntime(),
      /Cloudflare R2 is not configured for deployed lesson-pack uploads/i,
    );
  } finally {
    if (previous.vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous.vercel;
    if (previous.require === undefined) delete process.env.LESSON_PACK_REQUIRE_R2; else process.env.LESSON_PACK_REQUIRE_R2 = previous.require;
    if (previous.account === undefined) delete process.env.CLOUDFLARE_R2_ACCOUNT_ID; else process.env.CLOUDFLARE_R2_ACCOUNT_ID = previous.account;
    if (previous.bucket === undefined) delete process.env.CLOUDFLARE_R2_BUCKET; else process.env.CLOUDFLARE_R2_BUCKET = previous.bucket;
    if (previous.bucketName === undefined) delete process.env.CLOUDFLARE_R2_BUCKET_NAME; else process.env.CLOUDFLARE_R2_BUCKET_NAME = previous.bucketName;
    if (previous.endpoint === undefined) delete process.env.CLOUDFLARE_R2_ENDPOINT; else process.env.CLOUDFLARE_R2_ENDPOINT = previous.endpoint;
    if (previous.access === undefined) delete process.env.CLOUDFLARE_R2_ACCESS_KEY_ID; else process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = previous.access;
    if (previous.secret === undefined) delete process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY; else process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = previous.secret;
  }
});

test("local signed upload Content-Type matches normalised ZIP mime", async () => {
  const previousVercel = process.env.VERCEL;
  delete process.env.VERCEL;
  process.env.LESSON_PACK_UPLOAD_SIGNING_SECRET = "test-secret-lesson-pack-r2-defect";
  // Ensure we are on local provider for this unit test
  const previous = {
    account: process.env.CLOUDFLARE_R2_ACCOUNT_ID,
    bucket: process.env.CLOUDFLARE_R2_BUCKET,
    endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  };
  delete process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_R2_BUCKET;
  delete process.env.CLOUDFLARE_R2_ENDPOINT;

  try {
    const signed = await createSignedUpload({
      userId: "admin",
      sessionId: "sess-zip",
      fileId: "f1",
      fileName: "understand-hundredths-as-parts-of-a-whole-and-represent-390.zip",
      mimeType: "",
      expectedSizeBytes: 1024,
    });
    assert.equal(signed.headers["Content-Type"], "application/zip");
    if (signed.provider === "local") {
      assert.match(signed.uploadUrl, /direct-put\?token=/);
    }
  } finally {
    if (previousVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previousVercel;
    if (previous.account === undefined) delete process.env.CLOUDFLARE_R2_ACCOUNT_ID; else process.env.CLOUDFLARE_R2_ACCOUNT_ID = previous.account;
    if (previous.bucket === undefined) delete process.env.CLOUDFLARE_R2_BUCKET; else process.env.CLOUDFLARE_R2_BUCKET = previous.bucket;
    if (previous.endpoint === undefined) delete process.env.CLOUDFLARE_R2_ENDPOINT; else process.env.CLOUDFLARE_R2_ENDPOINT = previous.endpoint;
  }
});

test("upload concurrency is bounded for multi-file sessions", () => {
  assert.equal(UPLOAD_PUT_CONCURRENCY, 2);
  assert.ok(LESSON_PACK_R2_CORS_POLICY[0].AllowedMethods.includes("PUT"));
  assert.ok(LESSON_PACK_R2_CORS_POLICY[0].AllowedHeaders.includes("Content-Type"));
  assert.ok(LESSON_PACK_R2_CORS_POLICY[0].ExposeHeaders.includes("ETag"));
});

test("one-target-per-file Content-Type consistency across three ZIP names", () => {
  const names = [
    "understand-hundredths-as-parts-of-a-whole-and-represent-390.zip",
    "understand-tenths-as-part-of-a-whole-represent-and-calculate-mentally-388.zip",
    "compose-and-calculate-with-decimals-including-column-addition-and-subtraction-389.zip",
  ];
  for (const name of names) {
    assert.equal(normalizeLessonPackMimeType(name, "application/x-zip-compressed"), "application/zip");
  }
});
