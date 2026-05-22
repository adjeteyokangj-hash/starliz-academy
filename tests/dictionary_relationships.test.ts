import assert from "node:assert/strict";
import test from "node:test";
import {
  countDictionaryWordRelationshipLinks,
  decodeDictionaryWordRelationships,
  encodeDictionaryWordRelationships,
} from "../src/lib/dictionary_relationships";

test("encode and decode typed dictionary relationships", () => {
  const encoded = encodeDictionaryWordRelationships({
    relatedWords: ["fraction", "decimal"],
    easierWords: ["half"],
    harderWords: ["equivalent fraction"],
    prerequisiteWords: ["numerator", "denominator"],
    relatedMathConcepts: ["percentage"],
    phonicsFamilies: ["tion"],
    spellingFamilies: ["fract"],
    curriculumTopics: ["fractions"],
    interventionPaths: ["fraction-recovery"],
  });

  const decoded = decodeDictionaryWordRelationships(encoded);

  assert.deepEqual(decoded.relatedWords, ["fraction", "decimal"]);
  assert.deepEqual(decoded.easierWords, ["half"]);
  assert.deepEqual(decoded.harderWords, ["equivalent fraction"]);
  assert.deepEqual(decoded.prerequisiteWords, ["numerator", "denominator"]);
  assert.deepEqual(decoded.relatedMathConcepts, ["percentage"]);
  assert.deepEqual(decoded.phonicsFamilies, ["tion"]);
  assert.deepEqual(decoded.spellingFamilies, ["fract"]);
  assert.deepEqual(decoded.curriculumTopics, ["fractions"]);
  assert.deepEqual(decoded.interventionPaths, ["fraction-recovery"]);
  assert.equal(countDictionaryWordRelationshipLinks(encoded), 11);
});

test("decode keeps legacy untyped related words", () => {
  const decoded = decodeDictionaryWordRelationships(["shape", "polygon", "rel:easier:triangle"]);
  assert.deepEqual(decoded.relatedWords, ["shape", "polygon"]);
  assert.deepEqual(decoded.easierWords, ["triangle"]);
});
