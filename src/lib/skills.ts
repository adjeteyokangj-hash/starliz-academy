/**
 * Canonical skill taxonomy for StarLiz Academy.
 * Skills are grouped by subject and ordered from foundation to advanced.
 * Each skill has a code (stable ID), label, subject, and optional prerequisite.
 */

export type SkillCode = string;

export type SkillDef = {
  code: SkillCode;
  label: string;
  subject: "spelling" | "maths" | "reading" | "foundation";
  /** Skill that should be ≥60% before this skill is introduced */
  prerequisite?: SkillCode;
  /** KS1 or KS2 */
  keyStage?: "KS1" | "KS2";
};

export const SKILLS: SkillDef[] = [
  // ── Foundation (cross-subject) ─────────────────────────────────────────────
  { code: "letter_recognition", label: "Letter recognition", subject: "foundation", keyStage: "KS1" },
  { code: "letter_sound", label: "Letter sounds (phonics)", subject: "foundation", keyStage: "KS1", prerequisite: "letter_recognition" },
  { code: "alphabet_order", label: "Alphabet order", subject: "foundation", keyStage: "KS1", prerequisite: "letter_recognition" },

  // ── Spelling ───────────────────────────────────────────────────────────────
  { code: "cvc", label: "CVC words (cat, dog)", subject: "spelling", keyStage: "KS1", prerequisite: "letter_sound" },
  { code: "short_vowels", label: "Short vowels", subject: "spelling", keyStage: "KS1", prerequisite: "cvc" },
  { code: "long_vowels", label: "Long vowels", subject: "spelling", keyStage: "KS1", prerequisite: "short_vowels" },
  { code: "silent_e", label: "Silent e pattern", subject: "spelling", keyStage: "KS1", prerequisite: "short_vowels" },
  { code: "digraphs", label: "Digraphs (ch, sh, th)", subject: "spelling", keyStage: "KS1", prerequisite: "letter_sound" },
  { code: "blends", label: "Consonant blends", subject: "spelling", keyStage: "KS1", prerequisite: "cvc" },
  { code: "double_letters", label: "Double letters", subject: "spelling", keyStage: "KS1", prerequisite: "cvc" },
  { code: "syllable_2", label: "2-syllable words", subject: "spelling", keyStage: "KS2", prerequisite: "cvc" },
  { code: "syllable_3plus", label: "3+ syllable words", subject: "spelling", keyStage: "KS2", prerequisite: "syllable_2" },
  { code: "prefixes", label: "Prefixes (un-, re-, pre-)", subject: "spelling", keyStage: "KS2", prerequisite: "syllable_2" },
  { code: "suffixes", label: "Suffixes (-ing, -ed, -tion)", subject: "spelling", keyStage: "KS2", prerequisite: "syllable_2" },
  { code: "homophones", label: "Homophones (their/there)", subject: "spelling", keyStage: "KS2", prerequisite: "long_vowels" },
  { code: "silent_letters", label: "Silent letters (knife, wrap)", subject: "spelling", keyStage: "KS2", prerequisite: "syllable_2" },
  { code: "common_exception", label: "Common exception words", subject: "spelling", keyStage: "KS1", prerequisite: "letter_sound" },

  // ── Maths ─────────────────────────────────────────────────────────────────
  { code: "counting_to_20", label: "Counting to 20", subject: "maths", keyStage: "KS1" },
  { code: "number_bonds_10", label: "Number bonds to 10", subject: "maths", keyStage: "KS1", prerequisite: "counting_to_20" },
  { code: "number_bonds_20", label: "Number bonds to 20", subject: "maths", keyStage: "KS1", prerequisite: "number_bonds_10" },
  { code: "addition_basic", label: "Addition (within 20)", subject: "maths", keyStage: "KS1", prerequisite: "number_bonds_10" },
  { code: "subtraction_basic", label: "Subtraction (within 20)", subject: "maths", keyStage: "KS1", prerequisite: "addition_basic" },
  { code: "multiplication_tables", label: "Multiplication tables", subject: "maths", keyStage: "KS2", prerequisite: "addition_basic" },
  { code: "division_basic", label: "Division basics", subject: "maths", keyStage: "KS2", prerequisite: "multiplication_tables" },
  { code: "fractions_basic", label: "Basic fractions", subject: "maths", keyStage: "KS2", prerequisite: "division_basic" },
  { code: "place_value", label: "Place value", subject: "maths", keyStage: "KS2", prerequisite: "number_bonds_20" },
  { code: "word_problems", label: "Word problems", subject: "maths", keyStage: "KS2", prerequisite: "addition_basic" },

  // ── Reading ───────────────────────────────────────────────────────────────
  { code: "decoding", label: "Decoding words", subject: "reading", keyStage: "KS1", prerequisite: "letter_sound" },
  { code: "reading_fluency", label: "Reading fluency", subject: "reading", keyStage: "KS1", prerequisite: "decoding" },
  { code: "retrieval", label: "Retrieval (find the answer)", subject: "reading", keyStage: "KS1", prerequisite: "decoding" },
  { code: "inference", label: "Inference (read between lines)", subject: "reading", keyStage: "KS2", prerequisite: "retrieval" },
  { code: "vocabulary_context", label: "Vocabulary in context", subject: "reading", keyStage: "KS2", prerequisite: "reading_fluency" },
  { code: "main_idea", label: "Main idea / summary", subject: "reading", keyStage: "KS2", prerequisite: "retrieval" },
  { code: "author_purpose", label: "Author's purpose", subject: "reading", keyStage: "KS2", prerequisite: "inference" },
  { code: "text_structure", label: "Text structure", subject: "reading", keyStage: "KS2", prerequisite: "main_idea" },
  { code: "compare_contrast", label: "Compare & contrast", subject: "reading", keyStage: "KS2", prerequisite: "main_idea" },
];

/** Map code → definition */
export const SKILL_MAP: Record<SkillCode, SkillDef> = Object.fromEntries(
  SKILLS.map((s) => [s.code, s]),
);

/** All skill codes for a given subject (+ foundation) */
export function skillsForSubject(subject: "spelling" | "maths" | "reading"): SkillDef[] {
  return SKILLS.filter((s) => s.subject === subject || s.subject === "foundation");
}

/** Convert a skillFocus string from the AI (e.g. "Silent e") to the closest skill code */
export function skillFocusToCode(skillFocus: string): SkillCode | null {
  if (!skillFocus) return null;
  const lower = skillFocus.toLowerCase().replace(/[\s-]/g, "_");
  // Exact code match
  if (SKILL_MAP[lower]) return lower;
  // Partial label match
  const found = SKILLS.find((s) => s.label.toLowerCase().includes(skillFocus.toLowerCase().slice(0, 6)));
  return found?.code ?? null;
}

/** Parse comma-separated skills string to array */
export function parseSkills(raw: string | null | undefined): SkillCode[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Serialise skill array to comma-separated string */
export function serializeSkills(skills: SkillCode[]): string {
  return [...new Set(skills)].join(",");
}
