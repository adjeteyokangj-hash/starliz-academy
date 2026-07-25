import type { DaytimeActivityKind } from "@/lib/schools/daytime-activity-types";

const SUPPORTED_KINDS = new Set<DaytimeActivityKind>([
  "read-passage",
  "teacher-explanation",
  "worked-example",
  "multiple-choice",
  "short-answer",
  "reasoning",
  "word-sort",
  "dictation",
  "proofreading",
  "vocabulary",
  "reflection",
  "practical",
  "challenge",
  "fluency",
  "prediction",
  "scaffold",
  "independent",
]);

/** Free-text OpenAI labels → strict internal enum. */
const KIND_ALIASES: Array<{ pattern: RegExp; kind: DaytimeActivityKind }> = [
  { pattern: /\bvocab(ulary)?(\s+preview)?\b/i, kind: "vocabulary" },
  { pattern: /\b(guided\s+)?(teacher[- ]?)?explanation\b/i, kind: "teacher-explanation" },
  { pattern: /\bworked[- ]?example\b/i, kind: "worked-example" },
  { pattern: /\b(read[- ]?passage|reading\s+comprehension|comprehension)\b/i, kind: "read-passage" },
  { pattern: /\b(multiple[- ]?choice|mcq)\b/i, kind: "multiple-choice" },
  { pattern: /\b(practice\s+questions?|short[- ]?answer|retrieval)\b/i, kind: "short-answer" },
  { pattern: /\b(think\s+and\s+explain|explain[- ]?your[- ]?thinking|word\s+problem|reasoning|justify)\b/i, kind: "reasoning" },
  { pattern: /\bword[- ]?sort\b/i, kind: "word-sort" },
  { pattern: /\bdictation\b/i, kind: "dictation" },
  { pattern: /\bproofread/i, kind: "proofreading" },
  { pattern: /\b(movement\s+drill|group\s+game|warm[- ]?up|cool[- ]?down|skill\s+practice|game|drill|practical)\b/i, kind: "practical" },
  { pattern: /\b(reflection|discussion|talk\s+partner)\b/i, kind: "reflection" },
  { pattern: /\b(prediction|predict)\b/i, kind: "prediction" },
  { pattern: /\b(scaffold|guided\s+practice)\b/i, kind: "scaffold" },
  { pattern: /\b(independent(\s+practice)?|individual)\b/i, kind: "independent" },
  { pattern: /\b(fluency|pair|group)\b/i, kind: "fluency" },
  { pattern: /\bchallenge\b/i, kind: "challenge" },
];

export type ActivityKindNormalization =
  | { ok: true; kind: DaytimeActivityKind; originalLabel: string; aliased: boolean }
  | { ok: false; originalLabel: string; reason: string };

export function isSupportedDaytimeActivityKind(value: string): value is DaytimeActivityKind {
  return SUPPORTED_KINDS.has(value as DaytimeActivityKind);
}

export function normalizeDaytimeActivityKind(raw: unknown): ActivityKindNormalization {
  const originalLabel = String(raw ?? "").trim();
  if (!originalLabel) {
    return { ok: false, originalLabel: "", reason: "Activity kind is empty." };
  }

  const compact = originalLabel.toLowerCase().replace(/[_/]+/g, " ").replace(/\s+/g, " ").trim();
  if (isSupportedDaytimeActivityKind(compact)) {
    return { ok: true, kind: compact, originalLabel, aliased: false };
  }

  // Exact hyphen/underscore variants already covered; try slash compounds like fluency/vocabulary.
  const parts = compact.split(/\s+|\//).filter(Boolean);
  for (const part of parts) {
    if (isSupportedDaytimeActivityKind(part as DaytimeActivityKind)) {
      return { ok: true, kind: part as DaytimeActivityKind, originalLabel, aliased: true };
    }
  }

  for (const entry of KIND_ALIASES) {
    if (entry.pattern.test(originalLabel) || entry.pattern.test(compact)) {
      return { ok: true, kind: entry.kind, originalLabel, aliased: true };
    }
  }

  return {
    ok: false,
    originalLabel,
    reason: `Unsupported activity kind "${originalLabel}".`,
  };
}

/** Kinds that normally need a checkable pupil answer. */
export function activityKindRequiresFixedAnswer(kind: DaytimeActivityKind | string): boolean {
  switch (kind) {
    case "multiple-choice":
    case "short-answer":
    case "word-sort":
    case "proofreading":
    case "challenge":
    case "scaffold":
    case "independent":
    case "fluency":
    case "prediction":
    case "read-passage":
    case "worked-example":
    case "vocabulary":
      return true;
    case "reasoning":
      // Open reasoning / explain-your-thinking may be teacher-judged; model answer preferred but not mandatory.
      return false;
    case "reflection":
    case "practical":
    case "teacher-explanation":
    case "dictation":
      return false;
    default:
      return true;
  }
}

export function questionKindRequiresFixedAnswer(kind: string | undefined | null): boolean {
  if (!kind?.trim()) return true;
  const normalized = normalizeDaytimeActivityKind(kind);
  if (!normalized.ok) {
    // Unknown closed-ish labels still require answers; open labels do not.
    if (/\b(reflect|discuss|practical|movement|observation|open|dictation|creative)\b/i.test(kind)) {
      return false;
    }
    return true;
  }
  return activityKindRequiresFixedAnswer(normalized.kind);
}
