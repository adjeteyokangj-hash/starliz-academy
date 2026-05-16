import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveAgeRangeFromCurriculumTags,
  mapSubjectToLegacyContentType,
  normalizeKeyStage,
  normalizeSubject,
  parseYearGroupRange,
} from "@/lib/curriculum";

test("subject normalization avoids science/math collisions", () => {
  assert.equal(normalizeSubject("GCSE Science"), "gcse-science");
  assert.equal(normalizeSubject("GCSE Science Biology"), "gcse-science");
  assert.equal(mapSubjectToLegacyContentType("GCSE Science Biology"), "science");

  assert.equal(normalizeSubject("Math Algebra"), "maths");
  assert.equal(mapSubjectToLegacyContentType("Math Algebra"), "math");
});

test("key stage parsing supports verbose KS4 and GCSE forms", () => {
  assert.equal(normalizeKeyStage("KS4"), "KS4");
  assert.equal(normalizeKeyStage("Key Stage 4"), "KS4");
  assert.equal(normalizeKeyStage("GCSE"), "KS4");
  assert.equal(normalizeKeyStage("Year 10/11"), "KS4");
});

test("year range parsing supports year10/year11 metadata formats", () => {
  const rangeA = parseYearGroupRange("Year 10/11");
  assert.ok(rangeA);
  assert.equal(rangeA?.min, "Year 10");
  assert.equal(rangeA?.max, "Year 11");

  const rangeB = parseYearGroupRange("Y10-Y11");
  assert.ok(rangeB);
  assert.equal(rangeB?.minOrdinal, 10);
  assert.equal(rangeB?.maxOrdinal, 11);

  const rangeC = parseYearGroupRange("KS4");
  assert.ok(rangeC);
  assert.equal(rangeC?.min, "Year 10");
  assert.equal(rangeC?.max, "Year 11");
});

test("age-range derivation works for KS4/GCSE/year metadata", () => {
  const ks4 = deriveAgeRangeFromCurriculumTags("KS4");
  assert.deepEqual(ks4, { min: 14, max: 16 });

  const gcse = deriveAgeRangeFromCurriculumTags("GCSE");
  assert.deepEqual(gcse, { min: 14, max: 16 });

  const year = deriveAgeRangeFromCurriculumTags("Year 10/11");
  assert.deepEqual(year, { min: 14, max: 16 });

  const explicit = deriveAgeRangeFromCurriculumTags("Ages 15-16 years");
  assert.deepEqual(explicit, { min: 15, max: 16 });
});
