/**
 * tutor-runtime/utils.ts
 *
 * Pure item-level helpers shared across all tutor engines.
 * No React, no state, no side effects.
 *
 * Architecture layer: Tutor Runtime → Utils (leaf node)
 */

import { classifySpeechMatch, type SpeechMatchResult } from "@/lib/speechCheck";
import { type QuestionVisualSupport } from "@/lib/starliz-question-formula";
import { type NormalizedLessonItem } from "@/lib/lesson-runtime-normalizer";

/** Canonical item type used by all engines */
export type LessonItemInput = NormalizedLessonItem;

// ---------------------------------------------------------------------------
// Text decoding
// ---------------------------------------------------------------------------

/**
 * Decodes HTML entities that may be embedded in AI-generated lesson content.
 * Must be applied at every display boundary before rendering or speaking.
 */
export function decodeLessonText(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&");
}

// ---------------------------------------------------------------------------
// Item content accessors
// ---------------------------------------------------------------------------

/** Extracts the display prompt from a lesson item, accounting for subject. */
export function getPrompt(item: LessonItemInput, section: string): string {
  if (section === "spelling")
    return decodeLessonText(String(item.question ?? item.prompt ?? item.word ?? item.correctAnswer ?? item.answer ?? ""));
  return decodeLessonText(String(item.question ?? item.prompt ?? item.word ?? item.passage ?? ""));
}

/** Extracts and normalises the correct answer string from a lesson item. */
export function getAnswer(item: LessonItemInput): string {
  return decodeLessonText(String(item.correctAnswer ?? item.answer ?? item.word ?? "")).trim();
}

/** Extracts the list of answer options from a lesson item. */
export function getOptions(item: LessonItemInput): string[] {
  return (item.options ?? item.choices ?? [])
    .map((option) => decodeLessonText(String(option)))
    .filter(Boolean);
}

/**
 * Resolves the subject section (spelling / math / reading) for a given item,
 * falling back to the assignment-level subject when the item has no type.
 */
export function getItemSection(item: LessonItemInput, fallback: string): "spelling" | "math" | "reading" {
  const type = String(item.questionType ?? item.type ?? fallback).toLowerCase();
  if (
    type === "math" ||
    type === "maths" ||
    type === "times-tables" ||
    type === "gcse-maths" ||
    type === "science" ||
    type === "gcse-science"
  ) return "math";
  if (
    type === "reading" ||
    type === "english-language" ||
    type === "english-literature" ||
    type === "gcse-english" ||
    type === "vocabulary" ||
    !!item.passage
  ) return "reading";
  return "spelling";
}

// ---------------------------------------------------------------------------
// Alphabet / phonics helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the item targets a single letter or letter-sound skill.
 * Used to route alphabet-specific coaching messages and speech matching.
 */
export function isAlphabetLessonItem(item: LessonItemInput): boolean {
  const word = decodeLessonText(String(item.word ?? item.answer ?? "")).trim();
  const skillFocus = decodeLessonText(String(item.skillFocus ?? "")).toLowerCase();
  const alphabetWord = word.length === 1 && /^[a-zA-Z]$/.test(word);
  const alphabetSkill =
    skillFocus.includes("letter_sound") ||
    skillFocus.includes("letter sounds") ||
    skillFocus.includes("letter_recognition") ||
    skillFocus.includes("letter recognition");
  return alphabetWord || alphabetSkill;
}

/** Returns the phoneme sound string for a given letter (e.g. "a" → "/a/"). */
export function soundForLetter(letter: string): string {
  const lower = letter.toLowerCase();
  const map: Record<string, string> = {
    a: "/a/",
    e: "/e/",
    i: "/i/",
    o: "/o/",
    u: "/u/",
  };
  return map[lower] ?? `/${lower}/`;
}

/** Returns a simple example word that illustrates a letter sound. */
export function phonicsExampleForLetter(letter: string): string {
  const lower = letter.toLowerCase();
  const map: Record<string, string> = {
    a: "apple",
    m: "moon",
    c: "cat",
    d: "dog",
    t: "tap",
    s: "sun",
  };
  return map[lower] ?? "sun";
}

/**
 * Returns a human-readable description of the target for use in tutor speech.
 * For alphabet items: "lowercase a" or "capital A". For words: the word itself.
 */
export function describeTargetForTutor(item: LessonItemInput): string {
  const target = decodeLessonText(String(item.word ?? item.answer ?? "")).trim();
  if (!target) return "that";
  if (!isAlphabetLessonItem(item)) return target;
  const lower = target === target.toLowerCase() && target !== target.toUpperCase();
  return lower ? `lowercase ${target}` : `capital ${target}`;
}

// ---------------------------------------------------------------------------
// Speech / answer normalisation
// ---------------------------------------------------------------------------

/** Lowercases and strips non-alphanumeric characters for loose comparison. */
export function normalise(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Strips punctuation and collapses whitespace for spoken-text comparison.
 * Used before `classifySpokenVsTarget` to normalise ASR transcripts.
 */
export function normalizeSpokenText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Classifies a spoken transcript against the target answer.
 * Extends the base classifySpeechMatch with alphabet-specific variants
 * (e.g. "lowercase a" and "capital A" both match "a").
 */
export function classifySpokenVsTarget(
  spoken: string,
  target: string,
  isAlphabet: boolean,
): SpeechMatchResult {
  const base = classifySpeechMatch(spoken, target);
  if (base === "exact") return "exact";

  if (isAlphabet) {
    const s = spoken.toLowerCase().trim().replace(/[.,!?'"]/g, "").trim();
    const t = target.toLowerCase().trim();
    const alphaVariants = [`lowercase ${t}`, `capital ${t}`, `uppercase ${t}`];
    if (alphaVariants.includes(s)) return "exact";
  }

  return base;
}

// ---------------------------------------------------------------------------
// Visual support helpers
// ---------------------------------------------------------------------------

/**
 * Derives a QuestionVisualSupport object from the normalised item visuals.
 * Returns null when the item has no required visual content.
 */
export function fallbackVisualFromItem(item: LessonItemInput | null): QuestionVisualSupport | null {
  if (!item || !item.visuals.required) return null;

  const body = item.visuals.body
    .map((line) => decodeLessonText(String(line)))
    .map((line) => line.trim())
    .filter(Boolean);

  if (!body.length && item.visuals.prompt) {
    body.push(decodeLessonText(String(item.visuals.prompt)));
  }
  if (!body.length) return null;

  const visualType: QuestionVisualSupport["type"] =
    item.visuals.type === "passage"
      ? "passage"
      : item.visuals.type === "formula_card"
        ? "formula_card"
        : "diagram";

  return {
    type: visualType,
    title: decodeLessonText(
      String(item.visuals.title || (visualType === "formula_card" ? "Formula help" : "Visual support")),
    ),
    altText: decodeLessonText(
      String(item.visuals.altText || item.visuals.prompt || "Question support"),
    ),
    body,
  };
}

// ---------------------------------------------------------------------------
// Subject label helpers
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable subject badge label from a raw subject string.
 * Used in lesson headers and progress strips.
 */
export function lessonSubjectBadge(subject: string | null | undefined): string {
  const normalized = String(subject ?? "").toLowerCase();
  if (normalized.includes("science")) return "Science";
  if (normalized.includes("math")) return "Maths";
  if (
    normalized.includes("english") ||
    normalized.includes("reading") ||
    normalized.includes("language") ||
    normalized.includes("literature")
  ) return "English";
  if (normalized.includes("history")) return "History";
  if (normalized.includes("geography")) return "Geography";
  if (normalized.includes("french")) return "French";
  if (normalized.includes("german")) return "German";
  if (normalized.includes("spanish")) return "Spanish";
  if (normalized.startsWith("gcse-")) {
    return normalized
      .replace("gcse-", "")
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : "Lesson";
}
