/**
 * Weekly Curriculum Memory v1 — prevent materially repeated daytime packs
 * within the same school week for the same school / classroom / subject / year.
 *
 * No schema migration: uses SchoolDayLesson → Lesson.contentRefs → AIContentCache
 * plus additive metadataJson stamps.
 */

import { prisma } from "@/lib/db";
import {
  normalizeQuestionText,
  questionFingerprint,
  questionSimilarity,
  tokenizeQuestionText,
} from "@/lib/question-duplicate-detection";
import { weekWindowInTimezone } from "@/lib/homework-phase1a/eligibility";
import type { NormalizedDaytimeStagePack } from "@/lib/schools/daytime-stage-validators";
import type { DaytimeSubjectMode } from "@/lib/schools/daytime-subject-mode";
import { classifyDaytimeSubjectMode } from "@/lib/schools/daytime-subject-mode";

export const WEEKLY_MEMORY_VERSION = 1;
export const DEFAULT_SCHOOL_TIMEZONE = "Europe/London";

const BOUNDS = {
  passageTitles: 12,
  passageFingerprints: 12,
  vocabulary: 40,
  spellingWords: 40,
  questionFingerprints: 48,
  workedExampleFingerprints: 24,
  scenarioFingerprints: 16,
  activityKinds: 24,
  topicLabels: 16,
  promptLines: 14,
} as const;

const THRESHOLDS = {
  passageSimilarity: 0.72,
  scenarioSimilarity: 0.75,
  questionSimilarity: 0.85,
  workedExampleSimilarity: 0.8,
  vocabularyOverlap: 0.5,
  spellingOverlap: 0.6,
  explanationSimilarity: 0.78,
} as const;

export type WeeklyMemoryUsed = {
  passageTitles: string[];
  passageFingerprints: string[];
  vocabulary: string[];
  spellingWords: string[];
  questionFingerprints: string[];
  workedExampleFingerprints: string[];
  scenarioFingerprints: string[];
  activityKinds: string[];
  topicLabels: string[];
  /** Human labels for Lesson Review (no raw fingerprints). */
  sourceLabels: string[];
};

export type WeeklyCurriculumMemory = {
  weekStart: string;
  schoolId: string;
  classroomId: string;
  subject: string;
  yearGroup?: string;
  used: WeeklyMemoryUsed;
};

export type WeeklyDuplicateCode =
  | "weekly_duplicate_passage"
  | "weekly_duplicate_vocabulary"
  | "weekly_duplicate_question"
  | "weekly_duplicate_worked_example"
  | "weekly_duplicate_scenario"
  | "weekly_duplicate_activity_pattern";

export type WeeklyValidationIssue = {
  code: WeeklyDuplicateCode;
  message: string;
};

export type WeekDiversityBand = "New" | "Low" | "Medium" | "High" | "Blocked";

export type WeekDiversitySummary = {
  weekStart: string;
  passage: WeekDiversityBand;
  vocabularyOverlap: WeekDiversityBand;
  questionOverlap: WeekDiversityBand;
  workedExamples: WeekDiversityBand;
  scenarios: WeekDiversityBand;
  blocked: boolean;
  blockedReason: string | null;
  comparedAgainst: string[];
};

export type WeeklyReviewPolicy = {
  allowWeeklyReview: boolean;
  reviewReason?: string | null;
};

function uniqueBounded(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

function emptyUsed(): WeeklyMemoryUsed {
  return {
    passageTitles: [],
    passageFingerprints: [],
    vocabulary: [],
    spellingWords: [],
    questionFingerprints: [],
    workedExampleFingerprints: [],
    scenarioFingerprints: [],
    activityKinds: [],
    topicLabels: [],
    sourceLabels: [],
  };
}

/** Strip digits/names for structure comparison (reuses normalizeQuestionText + digit mask). */
export function structureFingerprint(value: unknown): string {
  return normalizeQuestionText(value)
    .replace(/\d+(?:\.\d+)?/g, "#")
    .replace(/\b[a-z]{2,12}\b/g, (token) => {
      // Keep common instructional words; mask likely proper names (capital-less after normalize).
      const keep = new Set([
        "what", "how", "why", "which", "when", "where", "who", "find", "calculate",
        "explain", "compare", "show", "work", "out", "value", "place", "digit",
        "fraction", "add", "subtract", "multiply", "divide", "total", "difference",
        "according", "passage", "evidence", "text", "paragraph", "character",
      ]);
      if (keep.has(token) || token.length <= 2) return token;
      if (/^[a-z]+$/.test(token) && token.length >= 5 && !keep.has(token)) {
        // Soft mask longer content words that often encode story-specific nouns.
        return token;
      }
      return token;
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function passageFingerprint(title: string, text: string): string {
  const body = normalizeQuestionText(`${title} ${text}`).slice(0, 480);
  return structureFingerprint(body);
}

export function resolveWeekStartIso(input: {
  now?: Date;
  timezone?: string | null;
}): string {
  const timezone = input.timezone?.trim() || DEFAULT_SCHOOL_TIMEZONE;
  return weekWindowInTimezone(input.now ?? new Date(), timezone).weekStartIso;
}

export function resolveWeeklyReviewPolicy(input: {
  lessonType?: string | null;
  skillFocus?: string | null;
  lessonTitle?: string | null;
  regenerateReason?: string | null;
  allowWeeklyReview?: boolean | null;
  reviewReason?: string | null;
}): WeeklyReviewPolicy {
  if (input.allowWeeklyReview === true) {
    return {
      allowWeeklyReview: true,
      reviewReason: input.reviewReason ?? input.regenerateReason ?? "explicit_review",
    };
  }
  const blob = `${input.lessonType ?? ""} ${input.skillFocus ?? ""} ${input.lessonTitle ?? ""} ${input.regenerateReason ?? ""}`.toLowerCase();
  const intentional =
    /\b(review|revision|recap|consolidat|retrieval|mixed\s+(?:review|fluency|practice)|weekly\s+challenge|intervention|catch[- ]?up)\b/.test(blob)
    || String(input.lessonType ?? "").toLowerCase() === "revision"
    || String(input.lessonType ?? "").toLowerCase() === "intervention";
  return {
    allowWeeklyReview: intentional,
    reviewReason: intentional
      ? (input.reviewReason ?? input.regenerateReason ?? "timetable_review_pattern")
      : null,
  };
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isFailedPack(meta: Record<string, unknown> | null, contentJson: string): boolean {
  if (!meta) return false;
  if (meta.generationSource === "failed" || meta.openAiSucceeded === false) return true;
  if (meta.generationStatus === "failed") return true;
  const bb = meta.blackBoxLiveTest;
  if (bb && typeof bb === "object" && (bb as { status?: string }).status === "failed") {
    // Still usable for memory if OpenAI succeeded — only exclude hard generation failures.
  }
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const row = parsed as { generationStatus?: string };
      if (row.generationStatus === "failed") return true;
    }
  } catch {
    return true;
  }
  return false;
}

function asPackFromContentJson(contentJson: string, modeHint?: DaytimeSubjectMode | null): {
  pack: Partial<NormalizedDaytimeStagePack>;
  mode: DaytimeSubjectMode;
} | null {
  const parsed = parseJsonObject(contentJson)
    ?? (() => {
      try {
        const value = JSON.parse(contentJson) as unknown;
        if (Array.isArray(value) && value[0] && typeof value[0] === "object") {
          return value[0] as Record<string, unknown>;
        }
      } catch {
        return null;
      }
      return null;
    })();
  if (!parsed) return null;
  const mode = (typeof parsed.subjectType === "string"
    ? parsed.subjectType
    : modeHint ?? "generic-lesson") as DaytimeSubjectMode;
  return { pack: parsed as Partial<NormalizedDaytimeStagePack>, mode };
}

export function extractUsedFromStagePack(input: {
  pack: Partial<NormalizedDaytimeStagePack> | NormalizedDaytimeStagePack;
  mode?: DaytimeSubjectMode | null;
  sourceLabel?: string | null;
}): WeeklyMemoryUsed {
  const pack = input.pack;
  const mode = input.mode ?? (pack.subjectType as DaytimeSubjectMode | undefined) ?? "generic-lesson";
  const used = emptyUsed();
  const sourceLabels = input.sourceLabel ? [input.sourceLabel] : [];

  if (pack.passage?.title) used.passageTitles.push(pack.passage.title);
  if (pack.passage?.text) {
    used.passageFingerprints.push(passageFingerprint(pack.passage.title ?? "", pack.passage.text));
  }

  for (const vocab of pack.vocabulary ?? []) {
    if (vocab?.word) used.vocabulary.push(String(vocab.word).toLowerCase());
  }

  if (Array.isArray(pack.targetWords)) {
    for (const word of pack.targetWords) {
      if (word) used.spellingWords.push(String(word).toLowerCase());
    }
  }
  if (pack.spellingFocus) used.topicLabels.push(String(pack.spellingFocus));
  if (pack.ruleExplanation) {
    used.topicLabels.push(structureFingerprint(pack.ruleExplanation).slice(0, 80));
  }

  for (const q of pack.questions ?? []) {
    const fp = questionFingerprint({
      prompt: q.prompt || q.question,
      answer: q.answer,
      choices: q.choices ?? q.options,
    });
    if (fp) used.questionFingerprints.push(fp);
    const struct = structureFingerprint(q.prompt || q.question);
    if (struct) used.questionFingerprints.push(`struct:${struct}`);
  }

  for (const example of pack.workedExamples ?? []) {
    const stem = structureFingerprint(example.question);
    if (stem) used.workedExampleFingerprints.push(stem);
  }

  if (pack.scenarioOrObservation) {
    used.scenarioFingerprints.push(structureFingerprint(pack.scenarioOrObservation));
  }
  if (pack.explanation && (mode === "science" || mode === "maths")) {
    used.scenarioFingerprints.push(`expl:${structureFingerprint(pack.explanation).slice(0, 200)}`);
  }
  if (typeof (pack as { topic?: unknown }).topic === "string") {
    used.topicLabels.push(String((pack as { topic: string }).topic));
  }
  if (pack.learningObjective) used.topicLabels.push(String(pack.learningObjective));

  for (const activity of pack.activities ?? []) {
    const kind = String(activity.kind ?? "").trim();
    if (kind) used.activityKinds.push(kind);
    const title = typeof (activity as { title?: unknown }).title === "string"
      ? String((activity as { title: string }).title)
      : "";
    if (title && (mode.startsWith("practical") || mode === "practical-pe")) {
      used.topicLabels.push(structureFingerprint(title).slice(0, 60));
    }
  }

  // Activity sequence signature (kinds joined) for pattern detection.
  const kinds = (pack.activities ?? []).map((a) => String(a.kind ?? "").trim()).filter(Boolean);
  if (kinds.length >= 3) {
    used.activityKinds.push(`seq:${kinds.join(">")}`);
  }

  return {
    passageTitles: uniqueBounded(used.passageTitles, BOUNDS.passageTitles),
    passageFingerprints: uniqueBounded(used.passageFingerprints, BOUNDS.passageFingerprints),
    vocabulary: uniqueBounded(used.vocabulary, BOUNDS.vocabulary),
    spellingWords: uniqueBounded(used.spellingWords, BOUNDS.spellingWords),
    questionFingerprints: uniqueBounded(used.questionFingerprints, BOUNDS.questionFingerprints),
    workedExampleFingerprints: uniqueBounded(used.workedExampleFingerprints, BOUNDS.workedExampleFingerprints),
    scenarioFingerprints: uniqueBounded(used.scenarioFingerprints, BOUNDS.scenarioFingerprints),
    activityKinds: uniqueBounded(used.activityKinds, BOUNDS.activityKinds),
    topicLabels: uniqueBounded(used.topicLabels, BOUNDS.topicLabels),
    sourceLabels: uniqueBounded(sourceLabels, 12),
  };
}

export function mergeWeeklyUsed(parts: WeeklyMemoryUsed[]): WeeklyMemoryUsed {
  const merged = emptyUsed();
  for (const part of parts) {
    merged.passageTitles.push(...part.passageTitles);
    merged.passageFingerprints.push(...part.passageFingerprints);
    merged.vocabulary.push(...part.vocabulary);
    merged.spellingWords.push(...part.spellingWords);
    merged.questionFingerprints.push(...part.questionFingerprints);
    merged.workedExampleFingerprints.push(...part.workedExampleFingerprints);
    merged.scenarioFingerprints.push(...part.scenarioFingerprints);
    merged.activityKinds.push(...part.activityKinds);
    merged.topicLabels.push(...part.topicLabels);
    merged.sourceLabels.push(...part.sourceLabels);
  }
  return {
    passageTitles: uniqueBounded(merged.passageTitles, BOUNDS.passageTitles),
    passageFingerprints: uniqueBounded(merged.passageFingerprints, BOUNDS.passageFingerprints),
    vocabulary: uniqueBounded(merged.vocabulary, BOUNDS.vocabulary),
    spellingWords: uniqueBounded(merged.spellingWords, BOUNDS.spellingWords),
    questionFingerprints: uniqueBounded(merged.questionFingerprints, BOUNDS.questionFingerprints),
    workedExampleFingerprints: uniqueBounded(merged.workedExampleFingerprints, BOUNDS.workedExampleFingerprints),
    scenarioFingerprints: uniqueBounded(merged.scenarioFingerprints, BOUNDS.scenarioFingerprints),
    activityKinds: uniqueBounded(merged.activityKinds, BOUNDS.activityKinds),
    topicLabels: uniqueBounded(merged.topicLabels, BOUNDS.topicLabels),
    sourceLabels: uniqueBounded(merged.sourceLabels, 12),
  };
}

function overlapRatio(next: string[], prior: string[]): number {
  if (!next.length) return 0;
  const priorSet = new Set(prior.map((v) => v.toLowerCase()));
  let hits = 0;
  for (const item of next) {
    if (priorSet.has(item.toLowerCase())) hits += 1;
  }
  return hits / next.length;
}

function bestSimilarity(candidate: string, corpus: string[]): number {
  let best = 0;
  for (const entry of corpus) {
    const score = questionSimilarity(candidate, entry);
    if (score > best) best = score;
  }
  return best;
}

function hasExactOrNearFingerprint(candidate: string, corpus: string[], nearThreshold: number): boolean {
  const normalized = candidate.toLowerCase();
  for (const entry of corpus) {
    if (entry.toLowerCase() === normalized) return true;
    if (questionSimilarity(candidate, entry) >= nearThreshold) return true;
  }
  return false;
}

export function validateAgainstWeeklyMemory(input: {
  pack: Partial<NormalizedDaytimeStagePack> | NormalizedDaytimeStagePack;
  memory: WeeklyCurriculumMemory | null | undefined;
  mode?: DaytimeSubjectMode | null;
  policy?: WeeklyReviewPolicy | null;
}): WeeklyValidationIssue[] {
  if (!input.memory || !input.memory.used) return [];
  const used = input.memory.used;
  const hasAny =
    used.passageFingerprints.length
    || used.vocabulary.length
    || used.spellingWords.length
    || used.questionFingerprints.length
    || used.workedExampleFingerprints.length
    || used.scenarioFingerprints.length;
  if (!hasAny) return [];

  const extracted = extractUsedFromStagePack({
    pack: input.pack,
    mode: input.mode,
  });
  const review = input.policy?.allowWeeklyReview === true;
  const issues: WeeklyValidationIssue[] = [];
  const against = used.sourceLabels[0] ? ` (similar to ${used.sourceLabels[0]})` : "";

  for (const title of extracted.passageTitles) {
    if (used.passageTitles.some((prior) => prior.toLowerCase() === title.toLowerCase())) {
      issues.push({
        code: "weekly_duplicate_passage",
        message: `Passage title already used this week${against}. Create a materially different story.`,
      });
    }
  }
  for (const fp of extracted.passageFingerprints) {
    if (hasExactOrNearFingerprint(fp, used.passageFingerprints, THRESHOLDS.passageSimilarity)) {
      issues.push({
        code: "weekly_duplicate_passage",
        message: `Passage text is too similar to earlier this week${against}. Do not paraphrase or rename the same story.`,
      });
      break;
    }
  }

  const vocabOverlap = overlapRatio(extracted.vocabulary, used.vocabulary);
  if (extracted.vocabulary.length >= 3 && vocabOverlap >= THRESHOLDS.vocabularyOverlap) {
    if (!review) {
      issues.push({
        code: "weekly_duplicate_vocabulary",
        message: `Vocabulary overlaps ${Math.round(vocabOverlap * 100)}% with words already used this week. Choose a different word set.`,
      });
    }
  }

  const spellingOverlap = overlapRatio(extracted.spellingWords, used.spellingWords);
  if (extracted.spellingWords.length >= 4 && spellingOverlap >= THRESHOLDS.spellingOverlap) {
    if (!review) {
      issues.push({
        code: "weekly_duplicate_vocabulary",
        message: `Spelling target words overlap ${Math.round(spellingOverlap * 100)}% with earlier this week. Use a different target set.`,
      });
    } else if (spellingOverlap >= 0.95) {
      issues.push({
        code: "weekly_duplicate_vocabulary",
        message: "Even in review mode, target words must not be an exact copy of earlier this week.",
      });
    }
  }

  for (const q of extracted.questionFingerprints) {
    if (hasExactOrNearFingerprint(q, used.questionFingerprints, THRESHOLDS.questionSimilarity)) {
      issues.push({
        code: "weekly_duplicate_question",
        message: `Question stem matches earlier this week${against}. Rewrite with a different structure (not just new names/numbers).`,
      });
      break;
    }
  }

  for (const example of extracted.workedExampleFingerprints) {
    if (hasExactOrNearFingerprint(example, used.workedExampleFingerprints, THRESHOLDS.workedExampleSimilarity)) {
      issues.push({
        code: "weekly_duplicate_worked_example",
        message: `Worked example structure matches earlier this week${against}. Do not reuse the same structure with different numbers.`,
      });
      break;
    }
  }

  for (const scenario of extracted.scenarioFingerprints) {
    if (hasExactOrNearFingerprint(scenario, used.scenarioFingerprints, THRESHOLDS.scenarioSimilarity)) {
      issues.push({
        code: "weekly_duplicate_scenario",
        message: `Scenario/explanation is too similar to earlier this week${against}. Create a new scenario.`,
      });
      break;
    }
  }

  const seq = extracted.activityKinds.find((k) => k.startsWith("seq:"));
  if (seq && used.activityKinds.includes(seq) && !review) {
    issues.push({
      code: "weekly_duplicate_activity_pattern",
      message: "Activity sequence matches an earlier lesson this week. Vary activity kinds and order.",
    });
  }

  // Deduplicate by code (keep first message).
  const seen = new Set<string>();
  return issues.filter((issue) => {
    if (seen.has(issue.code)) return false;
    seen.add(issue.code);
    return true;
  });
}

export function formatWeeklyMemoryForPrompt(memory: WeeklyCurriculumMemory | null | undefined): string {
  if (!memory) return "";
  const used = memory.used;
  const lines: string[] = [];
  if (used.passageTitles.length) {
    lines.push(`- Passage titles: ${used.passageTitles.slice(0, 8).join("; ")}`);
  }
  if (used.vocabulary.length) {
    lines.push(`- Vocabulary: ${used.vocabulary.slice(0, 16).join(", ")}`);
  }
  if (used.spellingWords.length) {
    lines.push(`- Spelling target words: ${used.spellingWords.slice(0, 16).join(", ")}`);
  }
  if (used.topicLabels.length) {
    lines.push(`- Topics / objectives already covered: ${used.topicLabels.slice(0, 8).join("; ")}`);
  }
  // Show compact structure samples, not raw hashes.
  const questionSamples = used.questionFingerprints
    .filter((fp) => fp.startsWith("struct:"))
    .map((fp) => fp.replace(/^struct:/, "").slice(0, 70))
    .slice(0, 6);
  if (questionSamples.length) {
    lines.push(`- Question patterns: ${questionSamples.join(" | ")}`);
  }
  const worked = used.workedExampleFingerprints.map((fp) => fp.slice(0, 70)).slice(0, 5);
  if (worked.length) {
    lines.push(`- Worked examples: ${worked.join(" | ")}`);
  }
  const scenarios = used.scenarioFingerprints
    .map((fp) => fp.replace(/^expl:/, "").slice(0, 70))
    .slice(0, 4);
  if (scenarios.length) {
    lines.push(`- Scenarios / explanations: ${scenarios.join(" | ")}`);
  }

  if (!lines.length) return "";
  const clipped = lines.slice(0, BOUNDS.promptLines);
  return `Content already used this week for this class and subject (week starting ${memory.weekStart}):
${clipped.join("\n")}

Generate materially different content.
Do not paraphrase or rename the same material.
Do not reuse the same worked-example structure with different numbers.
Do not reuse the same passage, vocabulary set, or question stems.`;
}

function bandFromOverlap(ratio: number, blocked: boolean): WeekDiversityBand {
  if (blocked) return "Blocked";
  if (ratio <= 0.05) return "New";
  if (ratio < 0.35) return "Low";
  if (ratio < 0.6) return "Medium";
  return "High";
}

export function computeWeekDiversitySummary(input: {
  memory: WeeklyCurriculumMemory | null | undefined;
  packs: Array<Partial<NormalizedDaytimeStagePack> | NormalizedDaytimeStagePack>;
  issues?: WeeklyValidationIssue[];
}): WeekDiversitySummary {
  const memory = input.memory;
  const used = memory?.used ?? emptyUsed();
  const extracted = mergeWeeklyUsed(
    input.packs.map((pack) => extractUsedFromStagePack({ pack })),
  );
  const blockedIssue = input.issues?.[0] ?? null;
  const passageScore = extracted.passageFingerprints.length
    ? Math.max(
      ...extracted.passageFingerprints.map((fp) => bestSimilarity(fp, used.passageFingerprints)),
      extracted.passageTitles.some((t) => used.passageTitles.some((p) => p.toLowerCase() === t.toLowerCase())) ? 1 : 0,
    )
    : 0;
  const vocabRatio = overlapRatio(extracted.vocabulary.length ? extracted.vocabulary : extracted.spellingWords, [
    ...used.vocabulary,
    ...used.spellingWords,
  ]);
  const questionHits = extracted.questionFingerprints.filter((q) =>
    hasExactOrNearFingerprint(q, used.questionFingerprints, THRESHOLDS.questionSimilarity),
  ).length;
  const questionRatio = extracted.questionFingerprints.length
    ? questionHits / extracted.questionFingerprints.length
    : 0;
  const workedHits = extracted.workedExampleFingerprints.filter((w) =>
    hasExactOrNearFingerprint(w, used.workedExampleFingerprints, THRESHOLDS.workedExampleSimilarity),
  ).length;
  const workedRatio = extracted.workedExampleFingerprints.length
    ? workedHits / extracted.workedExampleFingerprints.length
    : 0;
  const scenarioHits = extracted.scenarioFingerprints.filter((s) =>
    hasExactOrNearFingerprint(s, used.scenarioFingerprints, THRESHOLDS.scenarioSimilarity),
  ).length;
  const scenarioRatio = extracted.scenarioFingerprints.length
    ? scenarioHits / extracted.scenarioFingerprints.length
    : 0;

  const blocked = Boolean(blockedIssue);
  return {
    weekStart: memory?.weekStart ?? "",
    passage: bandFromOverlap(passageScore, blocked && blockedIssue?.code === "weekly_duplicate_passage"),
    vocabularyOverlap: bandFromOverlap(vocabRatio, blocked && blockedIssue?.code === "weekly_duplicate_vocabulary"),
    questionOverlap: bandFromOverlap(questionRatio, blocked && blockedIssue?.code === "weekly_duplicate_question"),
    workedExamples: extracted.workedExampleFingerprints.length
      ? bandFromOverlap(workedRatio, blocked && blockedIssue?.code === "weekly_duplicate_worked_example")
      : "New",
    scenarios: extracted.scenarioFingerprints.length
      ? bandFromOverlap(scenarioRatio, blocked && blockedIssue?.code === "weekly_duplicate_scenario")
      : "New",
    blocked,
    blockedReason: blockedIssue
      ? `Weekly repetition detected — ${blockedIssue.message}`
      : null,
    comparedAgainst: used.sourceLabels.slice(0, 6),
  };
}

export function stampWeeklyMetadata(
  metadata: Record<string, unknown>,
  stamp: {
    weekStart: string;
    schoolId: string;
    classroomId: string | null;
    dayOfWeek: number;
    weeklySequenceIndex: number;
    allowWeeklyReview?: boolean;
    reviewReason?: string | null;
    weekDiversity?: WeekDiversitySummary | null;
  },
): Record<string, unknown> {
  return {
    ...metadata,
    weekStart: stamp.weekStart,
    schoolId: stamp.schoolId,
    classroomId: stamp.classroomId,
    dayOfWeek: stamp.dayOfWeek,
    weeklySequenceIndex: stamp.weeklySequenceIndex,
    weeklyMemoryVersion: WEEKLY_MEMORY_VERSION,
    allowWeeklyReview: stamp.allowWeeklyReview ?? false,
    reviewReason: stamp.reviewReason ?? null,
    weekDiversity: stamp.weekDiversity
      ? {
          passage: stamp.weekDiversity.passage,
          vocabularyOverlap: stamp.weekDiversity.vocabularyOverlap,
          questionOverlap: stamp.weekDiversity.questionOverlap,
          workedExamples: stamp.weekDiversity.workedExamples,
          scenarios: stamp.weekDiversity.scenarios,
          blocked: stamp.weekDiversity.blocked,
          blockedReason: stamp.weekDiversity.blockedReason,
          comparedAgainst: stamp.weekDiversity.comparedAgainst,
          weekStart: stamp.weekDiversity.weekStart,
        }
      : undefined,
  };
}

function subjectsCompatible(left: string, right: string): boolean {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const modeA = classifyDaytimeSubjectMode(left);
  const modeB = classifyDaytimeSubjectMode(right);
  return modeA === modeB;
}

function yearGroupsCompatible(left?: string | null, right?: string | null): boolean {
  const a = String(left ?? "").trim().toLowerCase();
  const b = String(right ?? "").trim().toLowerCase();
  if (!a || !b) return true;
  return a === b;
}

function weekdayLabel(dayOfWeek: number): string {
  return ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"][dayOfWeek] ?? `Day ${dayOfWeek}`;
}

export function packBelongsToWeek(input: {
  meta: Record<string, unknown> | null;
  createdAt: Date;
  weekStart: string;
  timezone: string;
}): boolean {
  const stamped = typeof input.meta?.weekStart === "string" ? input.meta.weekStart : null;
  if (stamped) return stamped === input.weekStart;
  const createdWeek = resolveWeekStartIso({ now: input.createdAt, timezone: input.timezone });
  return createdWeek === input.weekStart;
}

export function shouldIncludePeriodInWeeklyMemory(input: {
  periodSubject: string;
  targetSubject: string;
  periodYearGroup?: string | null;
  targetYearGroup?: string | null;
  periodClassroomId?: string | null;
  targetClassroomId: string;
  periodLessonId?: string | null;
  excludeLessonId?: string | null;
}): boolean {
  if (!input.targetClassroomId) return false;
  if (input.periodClassroomId && input.periodClassroomId !== input.targetClassroomId) return false;
  if (input.excludeLessonId && input.periodLessonId === input.excludeLessonId) return false;
  if (!subjectsCompatible(input.periodSubject, input.targetSubject)) return false;
  if (!yearGroupsCompatible(input.periodYearGroup, input.targetYearGroup)) return false;
  return true;
}

function packInWeek(input: {
  meta: Record<string, unknown> | null;
  createdAt: Date;
  weekStart: string;
  timezone: string;
}): boolean {
  return packBelongsToWeek(input);
}

export async function loadWeeklyCurriculumMemory(input: {
  schoolId: string;
  classroomId: string | null;
  subject: string;
  yearGroup?: string | null;
  weekStart: string;
  timezone?: string | null;
  excludeLessonId?: string | null;
  excludeContentIds?: string[] | null;
}): Promise<WeeklyCurriculumMemory> {
  const classroomId = input.classroomId?.trim() || "";
  const empty: WeeklyCurriculumMemory = {
    weekStart: input.weekStart,
    schoolId: input.schoolId,
    classroomId,
    subject: input.subject,
    yearGroup: input.yearGroup ?? undefined,
    used: emptyUsed(),
  };
  if (!classroomId) return empty;

  const timezone = input.timezone?.trim() || DEFAULT_SCHOOL_TIMEZONE;
  const excludeContent = new Set((input.excludeContentIds ?? []).filter(Boolean));

  const periods = await prisma.schoolDayLesson.findMany({
    where: {
      schoolId: input.schoolId,
      classroomId,
      dayOfWeek: { gte: 1, lte: 5 },
      ...(input.excludeLessonId ? { lessonId: { not: input.excludeLessonId } } : {}),
    },
    select: {
      id: true,
      title: true,
      subject: true,
      dayOfWeek: true,
      yearGroup: true,
      skillFocus: true,
      lesson: {
        select: {
          id: true,
          contentRefs: true,
          yearGroup: true,
          subject: true,
        },
      },
    },
    orderBy: [{ dayOfWeek: "asc" }, { periodIndex: "asc" }],
  });

  const contentIds: string[] = [];
  const labelByContentId = new Map<string, string>();

  for (const period of periods) {
    if (!shouldIncludePeriodInWeeklyMemory({
      periodSubject: period.subject,
      targetSubject: input.subject,
      periodYearGroup: period.yearGroup ?? period.lesson?.yearGroup ?? null,
      targetYearGroup: input.yearGroup,
      periodClassroomId: classroomId,
      targetClassroomId: classroomId,
      periodLessonId: period.lesson?.id ?? null,
      excludeLessonId: input.excludeLessonId,
    })) {
      continue;
    }
    const refs = (period.lesson?.contentRefs ?? "")
      .split(/[,;\s]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    for (const id of refs) {
      if (excludeContent.has(id)) continue;
      contentIds.push(id);
      if (!labelByContentId.has(id)) {
        labelByContentId.set(
          id,
          `${weekdayLabel(period.dayOfWeek)} ${period.subject}${period.skillFocus ? ` · ${period.skillFocus}` : ""}`,
        );
      }
    }
  }

  if (!contentIds.length) return empty;

  const uniqueIds = [...new Set(contentIds)];
  const rows = await prisma.aIContentCache.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      contentJson: true,
      metadataJson: true,
      createdAt: true,
      skillFocus: true,
      yearGroup: true,
    },
  });

  const parts: WeeklyMemoryUsed[] = [];
  for (const row of rows) {
    const meta = parseJsonObject(row.metadataJson);
    if (isFailedPack(meta, row.contentJson)) continue;
    if (!packInWeek({
      meta,
      createdAt: row.createdAt,
      weekStart: input.weekStart,
      timezone,
    })) {
      continue;
    }
    // Prefer stamped classroom match when present.
    if (meta?.classroomId && String(meta.classroomId) !== classroomId) continue;
    if (meta?.schoolId && String(meta.schoolId) !== input.schoolId) continue;

    const parsed = asPackFromContentJson(row.contentJson);
    if (!parsed) continue;
    parts.push(
      extractUsedFromStagePack({
        pack: parsed.pack,
        mode: parsed.mode,
        sourceLabel: labelByContentId.get(row.id) ?? undefined,
      }),
    );
  }

  return {
    ...empty,
    used: mergeWeeklyUsed(parts),
  };
}

export function weeklySequenceIndexForDay(dayOfWeek: number): number {
  if (dayOfWeek >= 1 && dayOfWeek <= 5) return dayOfWeek;
  return 1;
}

/** Token overlap helper exported for tests. */
export function weeklyTokenOverlap(left: string, right: string): number {
  const a = tokenizeQuestionText(left);
  const b = tokenizeQuestionText(right);
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const token of a) if (b.has(token)) hit += 1;
  return hit / Math.max(a.size, b.size);
}
