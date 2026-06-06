import test from "node:test";
import assert from "node:assert/strict";
import {
  GA_ALPHABET,
  GA_ALPHABET_BEGINNER_SECTIONS,
  GA_CONSONANTS_AND_CLUSTERS,
  GA_NASAL_VOWELS,
  GA_SPECIAL_LETTERS,
  GA_VOWELS,
} from "../src/lib/ga-alphabet";

test("Ga alphabet contains special letters Ɛ/ɛ, Ŋ/ŋ and Ɔ/ɔ", () => {
  const flat = GA_ALPHABET.flat();
  assert.ok(flat.includes("Ɛ"));
  assert.ok(flat.includes("ɛ"));
  assert.ok(flat.includes("Ŋ"));
  assert.ok(flat.includes("ŋ"));
  assert.ok(flat.includes("Ɔ"));
  assert.ok(flat.includes("ɔ"));
  assert.equal(GA_SPECIAL_LETTERS.length, 3);
});

test("Ga vowels include ɛ and ɔ plus nasal variants", () => {
  assert.ok(GA_VOWELS.includes("ɛ"));
  assert.ok(GA_VOWELS.includes("ɔ"));
  assert.ok(GA_NASAL_VOWELS.includes("ɛ̃"));
  assert.ok(GA_NASAL_VOWELS.includes("ɔ̃"));
});

test("Ga consonant clusters include gb, kp, ŋm, sh and ts", () => {
  assert.ok(GA_CONSONANTS_AND_CLUSTERS.includes("gb"));
  assert.ok(GA_CONSONANTS_AND_CLUSTERS.includes("kp"));
  assert.ok(GA_CONSONANTS_AND_CLUSTERS.includes("ŋm"));
  assert.ok(GA_CONSONANTS_AND_CLUSTERS.includes("sh"));
  assert.ok(GA_CONSONANTS_AND_CLUSTERS.includes("ts"));
});

test("Ga beginner sections are present and non-empty", () => {
  assert.ok(GA_ALPHABET_BEGINNER_SECTIONS.length > 0);
  for (const section of GA_ALPHABET_BEGINNER_SECTIONS) {
    assert.ok(section.trim().length > 0);
  }
});
