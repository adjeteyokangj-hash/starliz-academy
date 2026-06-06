import test from "node:test";
import assert from "node:assert/strict";
import { normalizeExtractionCandidate, suggestGaCategory, suggestGaWordType } from "../src/lib/ga-pdf-extraction";
import { isGaPdfStorageConfigured, validateGaPdfUpload } from "../src/lib/ga-pdf-sources";

test("PDF upload validator rejects non-PDF types", () => {
  const result = validateGaPdfUpload("notes.txt", "text/plain", 1024);
  assert.equal(result.ok, false);
});

test("PDF upload validator rejects oversized files", () => {
  const result = validateGaPdfUpload("scan.pdf", "application/pdf", 26 * 1024 * 1024);
  assert.equal(result.ok, false);
});

test("category and word-type suggestions are deterministic", () => {
  assert.equal(suggestGaCategory("dog"), "Animals");
  assert.equal(suggestGaCategory("who"), "Grammar");
  assert.equal(suggestGaWordType("read"), "verb");
});

test("extraction candidates default to reviewed-safe values", () => {
  const candidate = normalizeExtractionCandidate({ englishWord: "lion", gaWord: "jata" });
  assert.equal(candidate.suggestedReviewStatus, "Reviewed");
  assert.equal(candidate.status, "Ready For Review");
  assert.equal(candidate.suggestedCategory, "Animals");
});

test("PDF storage clarity check returns false when storage dir is absent", () => {
  const original = process.env.GA_PDF_STORAGE_DIR;
  delete process.env.GA_PDF_STORAGE_DIR;
  try {
    assert.equal(isGaPdfStorageConfigured(), false);
  } finally {
    if (original) process.env.GA_PDF_STORAGE_DIR = original;
  }
});
