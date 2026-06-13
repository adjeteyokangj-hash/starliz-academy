/**
 * Central StarLiz multilingual language profile system (Parts 7–10).
 *
 * All language understanding in the StarLiz Brain — Ga, English, French, Spanish,
 * German — routes through this single registry.  Other systems (Brain Centre, Knowledge
 * Graph, Ga Word Bank, Ga Lessons, Ga Voice, Academic Intelligence) should import from
 * here rather than maintaining their own isolated language metadata.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReadingDirection = "ltr" | "rtl";

export type LanguageVerificationRequirement =
  | "none"
  | "admin_approved_word_bank"
  | "native_verified";

/**
 * A single language profile describing everything the StarLiz Brain needs to
 * understand, generate, validate, and teach content in that language.
 */
export type LanguageProfile = {
  /** Machine-readable identifier, e.g. "ga", "en", "fr" */
  id: string;
  /** Human-readable name */
  name: string;
  /** BCP-47 locale code where applicable */
  locale: string;
  /** Standard alphabet letters in upper + lower case pairs */
  alphabet: ReadonlyArray<readonly [string, string]>;
  /**
   * Letters that do not appear in the Latin ASCII range and require special
   * keyboard/font support.  Displayed as "Upper Lower" strings, e.g. "Ɛ ɛ".
   */
  specialLetters: readonly string[];
  /** Accents and diacritic marks relevant to this language */
  diacritics: readonly string[];
  /** Reading/writing direction */
  readingDirection: ReadingDirection;
  /** Notes about pronunciation support available in the platform */
  pronunciationNotes: string;
  /**
   * Whether lesson/question generation must draw exclusively from a verified
   * word bank rather than generating freely.
   */
  verificationRequirement: LanguageVerificationRequirement;
  /**
   * Rules for generating lessons in this language.
   * Empty means "use the standard StarLiz lesson generation pipeline".
   */
  lessonGenerationRules: readonly string[];
  /**
   * Whether this language should be excluded from the standard Quick Level
   * Finder and require the Language Readiness Review model instead.
   */
  requiresLanguageReadinessReview: boolean;
  /** Any safety or quality notes specific to this language */
  safetyNotes: readonly string[];
  /**
   * Whether the platform currently supports word bank entries for this
   * language (i.e. there is a corresponding GaWord or similar DB table).
   */
  hasWordBank: boolean;
};

// ---------------------------------------------------------------------------
// Individual language profiles
// ---------------------------------------------------------------------------

/** Ga language profile — verified Kpɛ language of the Ga people, Ghana */
export const GA_LANGUAGE_PROFILE: LanguageProfile = {
  id: "ga",
  name: "Ga",
  locale: "gaa",
  alphabet: [
    ["A", "a"],
    ["B", "b"],
    ["D", "d"],
    ["E", "e"],
    ["Ɛ", "ɛ"],
    ["F", "f"],
    ["G", "g"],
    ["H", "h"],
    ["I", "i"],
    ["J", "j"],
    ["K", "k"],
    ["L", "l"],
    ["M", "m"],
    ["N", "n"],
    ["Ŋ", "ŋ"],
    ["O", "o"],
    ["Ɔ", "ɔ"],
    ["P", "p"],
    ["R", "r"],
    ["S", "s"],
    ["T", "t"],
    ["U", "u"],
    ["V", "v"],
    ["W", "w"],
    ["Y", "y"],
    ["Z", "z"],
  ],
  specialLetters: ["Ɛ ɛ", "Ŋ ŋ", "Ɔ ɔ"],
  diacritics: ["nasalisation tilde: ã ẽ ɛ̃ ĩ õ ɔ̃ ũ"],
  readingDirection: "ltr",
  pronunciationNotes:
    "Pronunciation data must come from admin-approved Ga Word Bank entries. " +
    "AI-generated pronunciation or transliteration is not permitted. " +
    "Ga Voice audio scripts must use verified Word Bank pronunciation fields.",
  verificationRequirement: "admin_approved_word_bank",
  lessonGenerationRules: [
    "Only use words present in the verified Ga Word Bank (status: approved).",
    "Respect Ga special letters: Ɛ/ɛ, Ŋ/ŋ, Ɔ/ɔ — never substitute with E/N/O.",
    "Use stored meaning and pronunciation from Word Bank entries.",
    "Use stored example sentences from Word Bank entries where available.",
    "If verified entries are insufficient for the requested lesson, return an admin warning instead of generating filler content.",
    "Do not invent unknown Ga words, phrases, pronunciation, or example sentences.",
    "Nasal vowels must use the tilde diacritic as found in verified sources.",
  ],
  requiresLanguageReadinessReview: true,
  safetyNotes: [
    "Ga spellings must never be guessed — incorrect Ga can cause significant cultural harm.",
    "Do not use Twi or other Ghanaian language words as substitutes for Ga.",
    "All Ga content must be marked with source references from the Word Bank.",
  ],
  hasWordBank: true,
};

/** English language profile */
export const ENGLISH_LANGUAGE_PROFILE: LanguageProfile = {
  id: "en",
  name: "English",
  locale: "en-GB",
  alphabet: [
    ["A", "a"], ["B", "b"], ["C", "c"], ["D", "d"], ["E", "e"],
    ["F", "f"], ["G", "g"], ["H", "h"], ["I", "i"], ["J", "j"],
    ["K", "k"], ["L", "l"], ["M", "m"], ["N", "n"], ["O", "o"],
    ["P", "p"], ["Q", "q"], ["R", "r"], ["S", "s"], ["T", "t"],
    ["U", "u"], ["V", "v"], ["W", "w"], ["X", "x"], ["Y", "y"],
    ["Z", "z"],
  ],
  specialLetters: [],
  diacritics: [],
  readingDirection: "ltr",
  pronunciationNotes: "Standard British English pronunciation. IPA support optional.",
  verificationRequirement: "none",
  lessonGenerationRules: [],
  requiresLanguageReadinessReview: false,
  safetyNotes: [],
  hasWordBank: false,
};

/** French language profile */
export const FRENCH_LANGUAGE_PROFILE: LanguageProfile = {
  id: "fr",
  name: "French",
  locale: "fr-FR",
  alphabet: [
    ["A", "a"], ["B", "b"], ["C", "c"], ["D", "d"], ["E", "e"],
    ["F", "f"], ["G", "g"], ["H", "h"], ["I", "i"], ["J", "j"],
    ["K", "k"], ["L", "l"], ["M", "m"], ["N", "n"], ["O", "o"],
    ["P", "p"], ["Q", "q"], ["R", "r"], ["S", "s"], ["T", "t"],
    ["U", "u"], ["V", "v"], ["W", "w"], ["X", "x"], ["Y", "y"],
    ["Z", "z"],
  ],
  specialLetters: ["é", "è", "ê", "ë", "à", "â", "î", "ï", "ô", "ù", "û", "ü", "ç", "œ", "æ"],
  diacritics: [
    "acute accent: é",
    "grave accent: à è ù",
    "circumflex: â ê î ô û",
    "diaeresis: ë ï ü",
    "cedilla: ç",
    "ligatures: œ æ",
  ],
  readingDirection: "ltr",
  pronunciationNotes: "Standard French (metropolitan) pronunciation. Liaison rules apply.",
  verificationRequirement: "none",
  lessonGenerationRules: [
    "Respect all French diacritics — accent marks are part of correct spelling.",
    "Do not omit accents when generating French content.",
  ],
  requiresLanguageReadinessReview: false,
  safetyNotes: [],
  hasWordBank: false,
};

/** Spanish language profile */
export const SPANISH_LANGUAGE_PROFILE: LanguageProfile = {
  id: "es",
  name: "Spanish",
  locale: "es-ES",
  alphabet: [
    ["A", "a"], ["B", "b"], ["C", "c"], ["D", "d"], ["E", "e"],
    ["F", "f"], ["G", "g"], ["H", "h"], ["I", "i"], ["J", "j"],
    ["K", "k"], ["L", "l"], ["M", "m"], ["N", "n"], ["Ñ", "ñ"],
    ["O", "o"], ["P", "p"], ["Q", "q"], ["R", "r"], ["S", "s"],
    ["T", "t"], ["U", "u"], ["V", "v"], ["W", "w"], ["X", "x"],
    ["Y", "y"], ["Z", "z"],
  ],
  specialLetters: ["Ñ ñ", "ü"],
  diacritics: [
    "tilde: ñ",
    "acute accent on vowels: á é í ó ú",
    "diaeresis: ü (in güe, güi contexts)",
    "inverted question mark: ¿",
    "inverted exclamation mark: ¡",
  ],
  readingDirection: "ltr",
  pronunciationNotes: "Standard Castilian Spanish pronunciation.",
  verificationRequirement: "none",
  lessonGenerationRules: [
    "Include ñ as a distinct letter — it is not interchangeable with n.",
    "Use inverted question and exclamation marks at sentence beginnings: ¿ ¡",
    "Preserve acute accent on stressed vowels.",
  ],
  requiresLanguageReadinessReview: false,
  safetyNotes: [],
  hasWordBank: false,
};

/** German language profile */
export const GERMAN_LANGUAGE_PROFILE: LanguageProfile = {
  id: "de",
  name: "German",
  locale: "de-DE",
  alphabet: [
    ["A", "a"], ["Ä", "ä"], ["B", "b"], ["C", "c"], ["D", "d"],
    ["E", "e"], ["F", "f"], ["G", "g"], ["H", "h"], ["I", "i"],
    ["J", "j"], ["K", "k"], ["L", "l"], ["M", "m"], ["N", "n"],
    ["O", "o"], ["Ö", "ö"], ["P", "p"], ["Q", "q"], ["R", "r"],
    ["S", "s"], ["T", "t"], ["U", "u"], ["Ü", "ü"], ["V", "v"],
    ["W", "w"], ["X", "x"], ["Y", "y"], ["Z", "z"],
  ],
  specialLetters: ["Ä ä", "Ö ö", "Ü ü", "ß"],
  diacritics: [
    "umlaut: ä ö ü",
    "eszett/sharp s: ß (equivalent to ss in some contexts)",
  ],
  readingDirection: "ltr",
  pronunciationNotes: "Standard High German (Hochdeutsch) pronunciation.",
  verificationRequirement: "none",
  lessonGenerationRules: [
    "Treat Ä/ä, Ö/ö, Ü/ü, ß as distinct characters — do not substitute Ae/Oe/Ue/ss.",
    "Capitalise all German nouns.",
  ],
  requiresLanguageReadinessReview: false,
  safetyNotes: [],
  hasWordBank: false,
};

// ---------------------------------------------------------------------------
// Central registry
// ---------------------------------------------------------------------------

/**
 * The one central StarLiz multilingual language registry.
 * All platform subsystems (Brain Centre, Knowledge Graph, Ga Word Bank,
 * Ga Lessons, Ga Voice, Academic Intelligence) must use this as the
 * single source of truth for language metadata.
 */
export const LANGUAGE_PROFILES: Record<string, LanguageProfile> = {
  ga: GA_LANGUAGE_PROFILE,
  en: ENGLISH_LANGUAGE_PROFILE,
  fr: FRENCH_LANGUAGE_PROFILE,
  es: SPANISH_LANGUAGE_PROFILE,
  de: GERMAN_LANGUAGE_PROFILE,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Look up a language profile by its id. Returns undefined if not registered. */
export function getLanguageProfile(languageId: string): LanguageProfile | undefined {
  return LANGUAGE_PROFILES[languageId.toLowerCase()];
}

/**
 * Return all special letters (upper + lower) for a language as an array.
 * E.g. for Ga: ["Ɛ", "ɛ", "Ŋ", "ŋ", "Ɔ", "ɔ"]
 */
export function getSpecialLetterChars(profile: LanguageProfile): string[] {
  return profile.specialLetters.flatMap((pair) => pair.split(/\s+/).filter(Boolean));
}

/**
 * Return true if the given character is a special/non-ASCII letter in the
 * specified language profile.
 */
export function isSpecialLetter(profile: LanguageProfile, char: string): boolean {
  return getSpecialLetterChars(profile).includes(char);
}

/**
 * Return true when the given language requires generating from a verified
 * word bank and prohibits AI-guessed vocabulary.
 */
export function languageRequiresVerifiedWordBank(profile: LanguageProfile): boolean {
  return profile.verificationRequirement === "admin_approved_word_bank"
    || profile.verificationRequirement === "native_verified";
}

/**
 * Validate a single word/token against a language profile's special letters.
 * Returns a list of warning strings (empty = passes).
 *
 * Specifically checks that the word does not use ASCII substitutes for special
 * letters (e.g. "E" instead of "Ɛ" in Ga).
 */
export function validateWordCharacters(
  profile: LanguageProfile,
  word: string,
): string[] {
  if (profile.id !== "ga") return [];
  const warnings: string[] = [];
  // Check for bare E/N/O that should be Ɛ/Ŋ/Ɔ — heuristic only, not grammar.
  if (/[eE]/.test(word) && !word.includes("ɛ") && !word.includes("Ɛ")) {
    // Only warn if there is no verified profile to consult — flag for admin review.
    warnings.push(`Word "${word}" contains 'e/E'. Verify it does not require Ɛ/ɛ instead.`);
  }
  return warnings;
}

/**
 * Build a Knowledge Graph node data payload for a language-alphabet entry.
 * Used by the Knowledge Graph to link Ga (or other language) words to their
 * alphabet, meaning, level, and lesson usage.
 */
export function buildLanguageGraphNodeData(
  profile: LanguageProfile,
  options: {
    wordId?: string;
    word?: string;
    meaning?: string;
    level?: string;
    lessonUsage?: string[];
    verificationStatus?: string;
    sourceRef?: string;
  } = {},
): Record<string, unknown> {
  return {
    origin: "language_profile",
    languageId: profile.id,
    languageName: profile.name,
    locale: profile.locale,
    wordId: options.wordId,
    normalizedWord: options.word,
    definition: options.meaning,
    difficulty: options.level,
    curriculumTags: options.lessonUsage ?? [],
    verificationStatus: options.verificationStatus ?? "unverified",
    sourceRef: options.sourceRef ?? null,
    specialLetters: profile.specialLetters,
    requiresVerifiedWordBank: languageRequiresVerifiedWordBank(profile),
  };
}
