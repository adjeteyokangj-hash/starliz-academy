import assert from "node:assert/strict";
import test from "node:test";
import { containsDangerousDictionaryHtml, isKeyStageYearGroupCompatible, normalizeDictionaryWord } from "../src/lib/dictionary";

test("normalizeDictionaryWord trims and lowercases words", () => {
  assert.equal(normalizeDictionaryWord("  BRIGHT  "), "bright");
});

test("dangerous script input is detected", () => {
  assert.equal(containsDangerousDictionaryHtml("<script>alert('x')</script>"), true);
  assert.equal(containsDangerousDictionaryHtml("<img src=x onerror=alert(1)>"), true);
  assert.equal(containsDangerousDictionaryHtml("safe plain text"), false);
});

test("key stage and year group compatibility is enforced", () => {
  assert.equal(isKeyStageYearGroupCompatible("ks1", "Year 2"), true);
  assert.equal(isKeyStageYearGroupCompatible("ks1", "Year 5"), false);
  assert.equal(isKeyStageYearGroupCompatible("ks4", "Year 11"), true);
  assert.equal(isKeyStageYearGroupCompatible("ks4", "Year 8"), false);
});
