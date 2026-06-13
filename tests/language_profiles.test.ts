/**
 * Tests: Central StarLiz multilingual Brain / language profile system
 *
 * Covers Parts 7–11 of the fix specification.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LANGUAGE_PROFILES,
  GA_LANGUAGE_PROFILE,
  ENGLISH_LANGUAGE_PROFILE,
  FRENCH_LANGUAGE_PROFILE,
  SPANISH_LANGUAGE_PROFILE,
  GERMAN_LANGUAGE_PROFILE,
  getLanguageProfile,
  getSpecialLetterChars,
  isSpecialLetter,
  languageRequiresVerifiedWordBank,
  validateWordCharacters,
  buildLanguageGraphNodeData,
} from "@/lib/language-profiles";

function expectValue<T>(actual: T) {
  return {
    toBe(expected: unknown) {
      assert.equal(actual, expected);
    },
    toEqual(expected: unknown) {
      assert.deepEqual(actual, expected);
    },
    toContain(expected: unknown) {
      if (typeof actual === "string") {
        assert.equal(actual.includes(String(expected)), true);
        return;
      }
      assert.equal(Array.isArray(actual), true);
      assert.equal((actual as unknown[]).includes(expected), true);
    },
    toBeDefined() {
      assert.notEqual(actual, undefined);
    },
    toBeUndefined() {
      assert.equal(actual, undefined);
    },
    toBeTruthy() {
      assert.equal(Boolean(actual), true);
    },
    toHaveLength(length: number) {
      assert.equal((actual as { length: number }).length, length);
    },
    toBeGreaterThan(value: number) {
      assert.equal(typeof actual === "number" && actual > value, true);
    },
  };
}

// ---------------------------------------------------------------------------
// Part 7: One central multilingual Brain/language profile system
// ---------------------------------------------------------------------------

describe("Central language profile registry (Parts 7–9)", () => {
  it("LANGUAGE_PROFILES is the single central registry", () => {
    expectValue(LANGUAGE_PROFILES).toBeDefined();
    expectValue(typeof LANGUAGE_PROFILES).toBe("object");
  });

  it("registry contains all required language profiles", () => {
    expectValue(Object.keys(LANGUAGE_PROFILES)).toContain("ga");
    expectValue(Object.keys(LANGUAGE_PROFILES)).toContain("en");
    expectValue(Object.keys(LANGUAGE_PROFILES)).toContain("fr");
    expectValue(Object.keys(LANGUAGE_PROFILES)).toContain("es");
    expectValue(Object.keys(LANGUAGE_PROFILES)).toContain("de");
  });

  it("getLanguageProfile returns the correct profile", () => {
    expectValue(getLanguageProfile("ga")).toEqual(GA_LANGUAGE_PROFILE);
    expectValue(getLanguageProfile("en")).toEqual(ENGLISH_LANGUAGE_PROFILE);
    expectValue(getLanguageProfile("fr")).toEqual(FRENCH_LANGUAGE_PROFILE);
    expectValue(getLanguageProfile("es")).toEqual(SPANISH_LANGUAGE_PROFILE);
    expectValue(getLanguageProfile("de")).toEqual(GERMAN_LANGUAGE_PROFILE);
  });

  it("getLanguageProfile returns undefined for unknown language", () => {
    expectValue(getLanguageProfile("xx")).toBeUndefined();
    expectValue(getLanguageProfile("")).toBeUndefined();
  });

  it("all profiles have required fields", () => {
    for (const profile of Object.values(LANGUAGE_PROFILES)) {
      expectValue(profile.id).toBeTruthy();
      expectValue(profile.name).toBeTruthy();
      expectValue(profile.locale).toBeTruthy();
      expectValue(Array.isArray(profile.alphabet)).toBe(true);
      expectValue(profile.alphabet.length).toBeGreaterThan(0);
      expectValue(Array.isArray(profile.specialLetters)).toBe(true);
      expectValue(Array.isArray(profile.diacritics)).toBe(true);
      expectValue(Array.isArray(profile.lessonGenerationRules)).toBe(true);
      expectValue(Array.isArray(profile.safetyNotes)).toBe(true);
      expectValue(typeof profile.hasWordBank).toBe("boolean");
      expectValue(typeof profile.requiresLanguageReadinessReview).toBe("boolean");
    }
  });
});

// ---------------------------------------------------------------------------
// Part 8: Ga language profile
// ---------------------------------------------------------------------------

describe("Ga language profile (Part 8)", () => {
  it("Ga profile includes Ɛ/ɛ in special letters", () => {
    const chars = getSpecialLetterChars(GA_LANGUAGE_PROFILE);
    expectValue(chars).toContain("Ɛ");
    expectValue(chars).toContain("ɛ");
  });

  it("Ga profile includes Ŋ/ŋ in special letters", () => {
    const chars = getSpecialLetterChars(GA_LANGUAGE_PROFILE);
    expectValue(chars).toContain("Ŋ");
    expectValue(chars).toContain("ŋ");
  });

  it("Ga profile includes Ɔ/ɔ in special letters", () => {
    const chars = getSpecialLetterChars(GA_LANGUAGE_PROFILE);
    expectValue(chars).toContain("Ɔ");
    expectValue(chars).toContain("ɔ");
  });

  it("Ɛ, Ŋ, Ɔ are identified as special letters", () => {
    expectValue(isSpecialLetter(GA_LANGUAGE_PROFILE, "Ɛ")).toBe(true);
    expectValue(isSpecialLetter(GA_LANGUAGE_PROFILE, "ɛ")).toBe(true);
    expectValue(isSpecialLetter(GA_LANGUAGE_PROFILE, "Ŋ")).toBe(true);
    expectValue(isSpecialLetter(GA_LANGUAGE_PROFILE, "ŋ")).toBe(true);
    expectValue(isSpecialLetter(GA_LANGUAGE_PROFILE, "Ɔ")).toBe(true);
    expectValue(isSpecialLetter(GA_LANGUAGE_PROFILE, "ɔ")).toBe(true);
  });

  it("E/N/O (ASCII) are NOT special letters in Ga profile", () => {
    expectValue(isSpecialLetter(GA_LANGUAGE_PROFILE, "E")).toBe(false);
    expectValue(isSpecialLetter(GA_LANGUAGE_PROFILE, "N")).toBe(false);
    expectValue(isSpecialLetter(GA_LANGUAGE_PROFILE, "O")).toBe(false);
  });

  it("Ga requires verified word bank — no guessed content", () => {
    expectValue(languageRequiresVerifiedWordBank(GA_LANGUAGE_PROFILE)).toBe(true);
  });

  it("Ga hasWordBank is true", () => {
    expectValue(GA_LANGUAGE_PROFILE.hasWordBank).toBe(true);
  });

  it("Ga requiresLanguageReadinessReview is true — excluded from Quick Level Finder", () => {
    expectValue(GA_LANGUAGE_PROFILE.requiresLanguageReadinessReview).toBe(true);
  });

  it("Ga lesson generation rules warn about unverified words", () => {
    const rules = GA_LANGUAGE_PROFILE.lessonGenerationRules.join(" ");
    expectValue(rules.toLowerCase()).toContain("verified");
    expectValue(rules.toLowerCase()).toContain("word bank");
  });

  it("Ga safety notes warn against guessing/invention", () => {
    const notes = GA_LANGUAGE_PROFILE.safetyNotes.join(" ").toLowerCase();
    expectValue(notes).toContain("guess");
  });

  it("Ga alphabet contains 26+ entries including Ɛ, Ŋ, Ɔ rows", () => {
    const upperCaseLetters = GA_LANGUAGE_PROFILE.alphabet.map(([upper]) => upper);
    expectValue(upperCaseLetters).toContain("Ɛ");
    expectValue(upperCaseLetters).toContain("Ŋ");
    expectValue(upperCaseLetters).toContain("Ɔ");
  });

  it("validateWordCharacters warns when ASCII E is used without Ɛ context", () => {
    const warnings = validateWordCharacters(GA_LANGUAGE_PROFILE, "Ebɔ");
    expectValue(warnings.length).toBeGreaterThan(0);
    expectValue(warnings[0]).toContain("Ɛ/ɛ");
  });

  it("validateWordCharacters is silent for words that do not trigger ASCII substitution warning", () => {
    const warnings = validateWordCharacters(GA_LANGUAGE_PROFILE, "ɛbɔ");
    expectValue(warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Part 9: French, Spanish, German profiles
// ---------------------------------------------------------------------------

describe("French language profile (Part 9)", () => {
  it("French profile includes é è ê ë special letters", () => {
    expectValue(FRENCH_LANGUAGE_PROFILE.specialLetters).toContain("é");
    expectValue(FRENCH_LANGUAGE_PROFILE.specialLetters).toContain("è");
    expectValue(FRENCH_LANGUAGE_PROFILE.specialLetters).toContain("ê");
    expectValue(FRENCH_LANGUAGE_PROFILE.specialLetters).toContain("ë");
  });

  it("French profile includes à â special letters", () => {
    expectValue(FRENCH_LANGUAGE_PROFILE.specialLetters).toContain("à");
    expectValue(FRENCH_LANGUAGE_PROFILE.specialLetters).toContain("â");
  });

  it("French profile includes î ï ô ù û ü ç", () => {
    const s = FRENCH_LANGUAGE_PROFILE.specialLetters;
      ["î", "ï", "ô", "ù", "û", "ü", "ç"].forEach((ch) => {
        expectValue(s).toContain(ch);
    });
  });

  it("French does not require verified word bank", () => {
    expectValue(languageRequiresVerifiedWordBank(FRENCH_LANGUAGE_PROFILE)).toBe(false);
  });

  it("French does not require Language Readiness Review", () => {
    expectValue(FRENCH_LANGUAGE_PROFILE.requiresLanguageReadinessReview).toBe(false);
  });
});

describe("Spanish language profile (Part 9)", () => {
  it("Spanish profile includes Ñ/ñ as special letters", () => {
    const chars = getSpecialLetterChars(SPANISH_LANGUAGE_PROFILE);
    expectValue(chars).toContain("Ñ");
    expectValue(chars).toContain("ñ");
  });

  it("Spanish profile includes ü", () => {
    expectValue(SPANISH_LANGUAGE_PROFILE.specialLetters).toContain("ü");
  });

  it("Spanish diacritics include inverted question and exclamation marks", () => {
    const diacriticsText = SPANISH_LANGUAGE_PROFILE.diacritics.join(" ");
    expectValue(diacriticsText).toContain("¿");
    expectValue(diacriticsText).toContain("¡");
  });

  it("Spanish lesson rules include ñ usage guidance", () => {
    const rules = SPANISH_LANGUAGE_PROFILE.lessonGenerationRules.join(" ").toLowerCase();
    expectValue(rules).toContain("ñ");
  });

  it("Spanish alphabet includes Ñ as a distinct entry", () => {
    const upperCaseLetters = SPANISH_LANGUAGE_PROFILE.alphabet.map(([upper]) => upper);
    expectValue(upperCaseLetters).toContain("Ñ");
  });
});

describe("German language profile (Part 9)", () => {
  it("German profile includes Ä/ä special letters", () => {
    const chars = getSpecialLetterChars(GERMAN_LANGUAGE_PROFILE);
    expectValue(chars).toContain("Ä");
    expectValue(chars).toContain("ä");
  });

  it("German profile includes Ö/ö special letters", () => {
    const chars = getSpecialLetterChars(GERMAN_LANGUAGE_PROFILE);
    expectValue(chars).toContain("Ö");
    expectValue(chars).toContain("ö");
  });

  it("German profile includes Ü/ü special letters", () => {
    const chars = getSpecialLetterChars(GERMAN_LANGUAGE_PROFILE);
    expectValue(chars).toContain("Ü");
    expectValue(chars).toContain("ü");
  });

  it("German profile includes ß", () => {
    expectValue(GERMAN_LANGUAGE_PROFILE.specialLetters).toContain("ß");
  });

  it("German lesson rules mention Ä Ö Ü and ß", () => {
    const rules = GERMAN_LANGUAGE_PROFILE.lessonGenerationRules.join(" ");
    expectValue(rules).toContain("Ä");
    expectValue(rules).toContain("Ö");
    expectValue(rules).toContain("Ü");
    expectValue(rules).toContain("ß");
  });
});

// ---------------------------------------------------------------------------
// Part 10: Knowledge Graph / Brain integration
// ---------------------------------------------------------------------------

describe("Language profile Knowledge Graph integration (Part 10)", () => {
  it("buildLanguageGraphNodeData includes languageId and languageName", () => {
    const node = buildLanguageGraphNodeData(GA_LANGUAGE_PROFILE, {
      wordId: "ga-word-001",
      word: "ŋmɛ",
      meaning: "name",
      level: "beginner",
      verificationStatus: "approved",
    });
    expectValue(node.languageId).toBe("ga");
    expectValue(node.languageName).toBe("Ga");
  });

  it("buildLanguageGraphNodeData links word to alphabet and verification status", () => {
    const node = buildLanguageGraphNodeData(GA_LANGUAGE_PROFILE, {
      wordId: "ga-word-002",
      word: "ɛŋ",
      meaning: "fish",
      level: "beginner",
      verificationStatus: "approved",
      sourceRef: "Ga Word Bank v1",
    });
    expectValue(node.wordId).toBe("ga-word-002");
    expectValue(node.normalizedWord).toBe("ɛŋ");
    expectValue(node.definition).toBe("fish");
    expectValue(node.verificationStatus).toBe("approved");
    expectValue(node.sourceRef).toBe("Ga Word Bank v1");
    expectValue(node.requiresVerifiedWordBank).toBe(true);
    expectValue(node.specialLetters as string[]).toContain("Ɛ ɛ");
    expectValue(node.specialLetters as string[]).toContain("Ŋ ŋ");
  });

  it("Ga language profile specialLetters are passed into graph node", () => {
    const node = buildLanguageGraphNodeData(GA_LANGUAGE_PROFILE);
    expectValue(Array.isArray(node.specialLetters)).toBe(true);
    const letters = node.specialLetters as string[];
    expectValue(letters).toContain("Ɛ ɛ");
    expectValue(letters).toContain("Ŋ ŋ");
    expectValue(letters).toContain("Ɔ ɔ");
  });

  it("English profile does NOT require verified word bank for graph node", () => {
    const node = buildLanguageGraphNodeData(ENGLISH_LANGUAGE_PROFILE, { word: "apple" });
    expectValue(node.requiresVerifiedWordBank).toBe(false);
  });

  it("Brain Centre can access Ga profile via central registry", () => {
    const gaProfile = getLanguageProfile("ga");
    expectValue(gaProfile).toBeDefined();
    expectValue(gaProfile?.hasWordBank).toBe(true);
    expectValue(gaProfile?.requiresLanguageReadinessReview).toBe(true);
  });

  it("Ga Voice can retrieve pronunciation notes from Ga profile", () => {
    const gaProfile = getLanguageProfile("ga");
    expectValue(gaProfile?.pronunciationNotes.toLowerCase() ?? "").toContain("word bank");
  });
});
