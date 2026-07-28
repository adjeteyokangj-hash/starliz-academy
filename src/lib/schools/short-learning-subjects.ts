/**
 * Canonical Short Learning parent booking subjects.
 * Keys align with curriculum / parent subject conventions (lowercase identifiers).
 */

export const SHORT_LEARNING_STARLIZ_CHOOSE = "starliz_choose" as const;

export type ShortLearningSubjectKey =
  | "english"
  | "maths"
  | "science"
  | "computing"
  | "history"
  | "geography"
  | "religious-education"
  | "modern-foreign-languages"
  | "art-and-design"
  | "design-and-technology"
  | "music"
  | "physical-education"
  | "citizenship";

export type ShortLearningSubjectOption = {
  key: ShortLearningSubjectKey | typeof SHORT_LEARNING_STARLIZ_CHOOSE;
  label: string;
};

export const SHORT_LEARNING_SUBJECT_OPTIONS: ShortLearningSubjectOption[] = [
  { key: SHORT_LEARNING_STARLIZ_CHOOSE, label: "Let StarLiz choose" },
  { key: "english", label: "English" },
  { key: "maths", label: "Maths" },
  { key: "science", label: "Science" },
  { key: "computing", label: "Computing" },
  { key: "history", label: "History" },
  { key: "geography", label: "Geography" },
  { key: "religious-education", label: "Religious Education" },
  { key: "modern-foreign-languages", label: "Modern Foreign Languages" },
  { key: "art-and-design", label: "Art and Design" },
  { key: "design-and-technology", label: "Design and Technology" },
  { key: "music", label: "Music" },
  { key: "physical-education", label: "Physical Education" },
  { key: "citizenship", label: "Citizenship" },
];

export const SHORT_LEARNING_MANUAL_SUBJECT_KEYS: ShortLearningSubjectKey[] =
  SHORT_LEARNING_SUBJECT_OPTIONS
    .map((o) => o.key)
    .filter((k): k is ShortLearningSubjectKey => k !== SHORT_LEARNING_STARLIZ_CHOOSE);

const LABEL_BY_KEY = new Map(SHORT_LEARNING_SUBJECT_OPTIONS.map((o) => [o.key, o.label]));

const ALIASES: Record<string, ShortLearningSubjectKey | typeof SHORT_LEARNING_STARLIZ_CHOOSE> = {
  "": SHORT_LEARNING_STARLIZ_CHOOSE,
  starliz_choose: SHORT_LEARNING_STARLIZ_CHOOSE,
  "let starliz choose": SHORT_LEARNING_STARLIZ_CHOOSE,
  auto: SHORT_LEARNING_STARLIZ_CHOOSE,
  english: "english",
  maths: "maths",
  math: "maths",
  mathematics: "maths",
  science: "science",
  computing: "computing",
  "computer science": "computing",
  ict: "computing",
  history: "history",
  geography: "geography",
  re: "religious-education",
  "religious education": "religious-education",
  "religious-education": "religious-education",
  mfl: "modern-foreign-languages",
  "modern foreign languages": "modern-foreign-languages",
  "modern-foreign-languages": "modern-foreign-languages",
  languages: "modern-foreign-languages",
  french: "modern-foreign-languages",
  spanish: "modern-foreign-languages",
  german: "modern-foreign-languages",
  "art and design": "art-and-design",
  "art-and-design": "art-and-design",
  art: "art-and-design",
  "design and technology": "design-and-technology",
  "design-and-technology": "design-and-technology",
  dt: "design-and-technology",
  music: "music",
  pe: "physical-education",
  "physical education": "physical-education",
  "physical-education": "physical-education",
  "pe-health": "physical-education",
  citizenship: "citizenship",
  "citizenship-pshe": "citizenship",
  pshe: "citizenship",
};

export function shortLearningSubjectLabel(key: string): string {
  return LABEL_BY_KEY.get(key as ShortLearningSubjectKey) ?? key;
}

export function normalizeShortLearningSubjectInput(
  raw: string | null | undefined,
): ShortLearningSubjectKey | typeof SHORT_LEARNING_STARLIZ_CHOOSE | null {
  if (raw == null) return SHORT_LEARNING_STARLIZ_CHOOSE;
  const trimmed = raw.trim();
  if (!trimmed) return SHORT_LEARNING_STARLIZ_CHOOSE;
  const lower = trimmed.toLowerCase();
  if (ALIASES[lower]) return ALIASES[lower];
  if ((SHORT_LEARNING_MANUAL_SUBJECT_KEYS as string[]).includes(lower)) {
    return lower as ShortLearningSubjectKey;
  }
  return null;
}

export function isManualShortLearningSubject(
  key: string,
): key is ShortLearningSubjectKey {
  return (SHORT_LEARNING_MANUAL_SUBJECT_KEYS as string[]).includes(key);
}

/** Age-safe fallback rotation order (core first). */
export const SHORT_LEARNING_FALLBACK_ROTATION: ShortLearningSubjectKey[] = [
  "english",
  "maths",
  "science",
  "computing",
  "history",
  "geography",
  "citizenship",
  "art-and-design",
  "music",
  "design-and-technology",
  "religious-education",
  "modern-foreign-languages",
  "physical-education",
];
