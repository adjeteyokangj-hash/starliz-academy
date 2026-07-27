/**
 * Canonical mapping between curriculum subjects and playable activity types.
 *
 * Daytime and Short Learning must share this contract so generated content
 * survives assignment safety (`mapSubjectToLegacyContentType` subject vs contentType).
 *
 * Curriculum subject examples: english / english-language / maths
 * Playable content types: reading, writing, grammar, vocabulary, spelling, math, lesson
 */
import {
  mapSubjectToLegacyContentType,
  normalizeSubject,
} from "@/lib/curriculum";
import {
  classifyDaytimeSubjectMode,
  contentTypeForSubjectMode,
} from "@/lib/schools/daytime-subject-mode";

function lessonPathForContentType(contentType: string): string {
  const normalized = contentType.trim().toLowerCase();
  if (normalized === "ga") return "/ga-learning-hub";
  const readingTypes = new Set(["reading", "english-language", "english-literature", "gcse-english", "vocabulary"]);
  const lessonTypes = new Set(["lesson", "ai_daily", "daily", "science", "gcse-science", "writing", "grammar", "punctuation"]);
  const mathTypes = new Set(["math", "maths", "times-tables", "gcse-maths", "11-plus-practice", "sats-practice"]);
  if (lessonTypes.has(normalized)) return "/games/lesson";
  if (mathTypes.has(normalized)) return "/games/math";
  if (readingTypes.has(normalized)) return "/games/reading";
  return "/games/spelling";
}

export type PlayableLessonTypeInput = {
  /** School / booking / timetable subject label (e.g. english, maths). */
  subject: string;
  /** Existing persisted content type, when known. */
  contentType?: string | null;
  /** Skill focus / learning focus used to pick English strands. */
  skillFocus?: string | null;
  /** Optional lesson kind hint (comprehension, vocabulary, etc.). */
  lessonKind?: string | null;
};

export type PlayableLessonTypeResolution = {
  /** Normalised curriculum subject (english-language, maths, …). */
  curriculumSubject: string;
  /** Persistable AIContentCache.contentType / game activity type. */
  playableContentType: string;
  /**
   * Subject written into content metadata for assignment safety.
   * Must map to the same legacy type as playableContentType.
   */
  metadataSubject: string;
  /** School timetable / booking subject preserved for curriculum meaning. */
  schoolSubject: string;
  /** Base game path (without query). */
  lessonPath: string;
};

const ENGLISH_CURRICULUM = new Set([
  "english",
  "english-language",
  "english-literature",
  "gcse-english",
  "gcse-english-language",
  "gcse-english-literature",
]);

const ENGLISH_PLAYABLE = new Set([
  "reading",
  "writing",
  "grammar",
  "vocabulary",
  "spelling",
  "phonics",
  "punctuation",
  "english-language",
  "english-literature",
]);

function haystack(input: PlayableLessonTypeInput): string {
  return `${input.subject} ${input.skillFocus ?? ""} ${input.lessonKind ?? ""} ${input.contentType ?? ""}`.toLowerCase();
}

function resolveEnglishPlayableType(input: PlayableLessonTypeInput): string {
  const h = haystack(input);
  const explicit = (input.contentType ?? "").trim().toLowerCase();
  if (explicit && ENGLISH_PLAYABLE.has(explicit) && explicit !== "english-language" && explicit !== "english-literature") {
    return explicit === "phonics" ? "spelling" : explicit;
  }
  if (h.includes("spell") || h.includes("phonic")) return "spelling";
  if (h.includes("punctuation")) return "punctuation";
  if (h.includes("grammar")) return "grammar";
  if (h.includes("vocabulary") || h.includes("word meaning")) return "vocabulary";
  if (h.includes("writing") || h.includes("composition") || h.includes("handwriting")) return "writing";
  // Default English Short Learning / Daytime path: reading / comprehension.
  return "reading";
}

/**
 * Resolve curriculum subject vs playable activity type for Daytime + Short Learning.
 */
export function resolvePlayableLessonType(input: PlayableLessonTypeInput): PlayableLessonTypeResolution {
  const schoolSubject = input.subject.trim() || "lesson";
  const normalized = normalizeSubject(schoolSubject);
  const curriculumSubject = normalized ?? schoolSubject.toLowerCase().replace(/\s+/g, "-");
  const mode = classifyDaytimeSubjectMode(schoolSubject, input.skillFocus);
  const modeDefault = contentTypeForSubjectMode(mode);

  let playableContentType: string;
  if (ENGLISH_CURRICULUM.has(curriculumSubject) || /\benglish\b/i.test(schoolSubject) || mode === "guided-reading") {
    playableContentType = resolveEnglishPlayableType(input);
  } else if (input.contentType?.trim()) {
    const existing = input.contentType.trim().toLowerCase();
    // Prefer an explicit compatible type when already persisted.
    playableContentType = existing === "maths" ? "math" : existing === "english-language" ? resolveEnglishPlayableType(input) : existing;
  } else if (mode === "maths") {
    playableContentType = "math";
  } else if (mode === "spelling") {
    playableContentType = "spelling";
  } else {
    playableContentType = modeDefault === "maths" ? "math" : modeDefault;
  }

  // Metadata subject must share the legacy pathway with contentType.
  // Daytime reading packs use subject:"reading" + schoolSubject:<timetable label>.
  const metadataSubject =
    playableContentType === "math" || playableContentType === "maths"
      ? "maths"
      : playableContentType === "lesson"
        ? curriculumSubject.startsWith("science") || mode === "science"
          ? "science"
          : playableContentType
        : playableContentType;

  return {
    curriculumSubject,
    playableContentType,
    metadataSubject,
    schoolSubject,
    lessonPath: lessonPathForContentType(playableContentType),
  };
}

/**
 * True when metadata subject and persisted contentType are assignment-safe together.
 */
export function isPlayableSubjectContentTypeCompatible(
  subject: string | null | undefined,
  contentType: string | null | undefined,
): boolean {
  if (!subject?.trim() || !contentType?.trim()) return false;
  if (!isRecognisedPlayableContentType(contentType)) return false;

  const subjectLegacy = mapSubjectToLegacyContentType(subject);
  const typeLegacy = mapSubjectToLegacyContentType(contentType);
  if (subjectLegacy && typeLegacy && subjectLegacy === typeLegacy) return true;

  const normalizedType = contentType.trim().toLowerCase();
  const resolved = resolvePlayableLessonType({ subject, contentType });

  // Compatible when the persisted type is the resolved playable type (or lesson for practical packs).
  if (resolved.playableContentType === normalizedType || normalizedType === "lesson") {
    const resolvedLegacy = mapSubjectToLegacyContentType(
      normalizedType === "lesson" ? resolved.metadataSubject : resolved.playableContentType,
    );
    if (normalizedType === "lesson") return true;
    return Boolean(resolvedLegacy && typeLegacy && resolvedLegacy === typeLegacy);
  }

  // Curriculum English parent may legitimately pair with English playable strands.
  const normSubject = normalizeSubject(subject);
  if ((normSubject && ENGLISH_CURRICULUM.has(normSubject)) || /\benglish\b/i.test(subject)) {
    if (ENGLISH_PLAYABLE.has(normalizedType)) {
      const playableLegacy = mapSubjectToLegacyContentType(
        normalizedType === "english-language" || normalizedType === "english-literature"
          ? "reading"
          : normalizedType,
      );
      return Boolean(playableLegacy);
    }
  }

  return false;
}

const RECOGNISED_PLAYABLE_CONTENT_TYPES = new Set([
  ...ENGLISH_PLAYABLE,
  "math",
  "maths",
  "lesson",
  "science",
  "times-tables",
  "gcse-maths",
  "gcse-science",
  "11-plus-practice",
  "sats-practice",
  "ai_daily",
  "daily",
]);

export function isRecognisedPlayableContentType(contentType: string | null | undefined): boolean {
  if (!contentType?.trim()) return false;
  // Exact playable types only - do not use fuzzy curriculum normalizeSubject
  // (e.g. "not-a-real-english-type" must stay unrecognised).
  return RECOGNISED_PLAYABLE_CONTENT_TYPES.has(contentType.trim().toLowerCase());
}

export function isEnglishCurriculumSubject(subject: string | null | undefined): boolean {
  const normalized = normalizeSubject(subject);
  if (normalized && ENGLISH_CURRICULUM.has(normalized)) return true;
  return /\benglish\b/i.test(subject ?? "");
}
