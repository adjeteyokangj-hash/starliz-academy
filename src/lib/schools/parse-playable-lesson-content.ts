import {
  normalizeDaytimeStagePack,
  type NormalizedDaytimeQuestion,
  type NormalizedDaytimeStagePack,
} from "@/lib/schools/daytime-stage-validators";
import {
  classifyDaytimeSubjectMode,
  type DaytimeSubjectMode,
} from "@/lib/schools/daytime-subject-mode";

export type PlayableLessonQuestion = {
  prompt: string;
  answer: string;
  explanation: string;
  hints: string[];
  choices: string[];
  breakdown: {
    simplerQuestion: string;
    steps: string[];
    startingPoint: string;
    keyWords: Array<{ word: string; meaning: string }>;
  } | null;
  feedback: string;
};

export type PlayableLessonReviewModel = {
  ok: true;
  title: string;
  subjectType: DaytimeSubjectMode;
  estimatedMinutes: number;
  learningObjective: string | null;
  explanation: string | null;
  workedExamples: Array<{ question: string; steps: string[]; answer: string }>;
  activities: Array<{ kind: string; estimatedMinutes: number; title: string | null }>;
  questions: PlayableLessonQuestion[];
  passage: { title: string; text: string; paragraphs: string[]; wordCount: number } | null;
  vocabulary: Array<{ word: string; meaning: string; example: string | null }>;
  spellingFocus: string | null;
  targetWords: string[];
  ruleExplanation: string | null;
  scenarioOrObservation: string | null;
  priorLearningWarmup: string | null;
  misconceptions: string[];
  reflectionCheck: string | null;
  transitionNote: string | null;
  instructions: string | null;
  generationStatus: "ok" | "failed" | null;
  failureReason: string | null;
  /** True when there is enough pupil-facing body for Admin to review. */
  hasReviewableBody: boolean;
  approvalDenialReasons: string[];
};

export type PlayableLessonParseFailure = {
  ok: false;
  error: string;
  approvalDenialReasons: string[];
};

export type PlayableLessonParseResult = PlayableLessonReviewModel | PlayableLessonParseFailure;

export type ParsePlayableLessonContentOptions = {
  contentType?: string | null;
  subject?: string | null;
  skillFocus?: string | null;
  topic?: string | null;
};

function modeFromHints(options?: ParsePlayableLessonContentOptions): DaytimeSubjectMode {
  const contentType = (options?.contentType ?? "").toLowerCase();
  if (contentType === "math" || contentType === "maths") return "maths";
  if (contentType === "spelling") return "spelling";
  if (contentType === "reading") return "guided-reading";
  if (contentType === "science") return "science";
  return classifyDaytimeSubjectMode(
    options?.subject ?? options?.topic ?? (contentType || "lesson"),
    options?.skillFocus ?? options?.topic,
  );
}

function questionFingerprint(prompt: string, answer: string): string {
  return `${prompt.trim().toLowerCase()}::${answer.trim().toLowerCase()}`;
}

function dedupeQuestions(questions: NormalizedDaytimeQuestion[]): NormalizedDaytimeQuestion[] {
  const seen = new Set<string>();
  const out: NormalizedDaytimeQuestion[] = [];
  for (const q of questions) {
    const prompt = (q.prompt || q.question || "").trim();
    if (!prompt) continue;
    const answer = String(q.answer ?? "").trim();
    const key = questionFingerprint(prompt, answer);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

function mapQuestion(q: NormalizedDaytimeQuestion): PlayableLessonQuestion {
  const prompt = (q.prompt || q.question || "").trim();
  const answer = String(q.answer ?? "").trim();
  const choices = [...(q.choices ?? []), ...(q.options ?? [])]
    .map((c) => String(c).trim())
    .filter(Boolean);
  const uniqueChoices = [...new Set(choices)];
  return {
    prompt,
    answer,
    explanation: (q.explanation ?? "").trim(),
    hints: (q.hints ?? []).map((h) => String(h).trim()).filter(Boolean),
    choices: uniqueChoices,
    breakdown: q.breakdown
      ? {
          simplerQuestion: q.breakdown.simplerQuestion ?? "",
          steps: q.breakdown.steps ?? [],
          startingPoint: q.breakdown.startingPoint ?? "",
          keyWords: (q.breakdown.keyWords ?? []).map((kw) => ({
            word: kw.word,
            meaning: kw.meaning,
          })),
        }
      : null,
    feedback: (q.explanation ?? "").trim(),
  };
}

function hasReviewableBody(pack: NormalizedDaytimeStagePack, questions: PlayableLessonQuestion[]): boolean {
  if ((pack.explanation ?? "").trim()) return true;
  if ((pack.ruleExplanation ?? "").trim()) return true;
  if ((pack.scenarioOrObservation ?? "").trim()) return true;
  if ((pack.priorLearningWarmup ?? "").trim()) return true;
  if ((pack.reflectionCheck ?? "").trim()) return true;
  if ((pack.transitionNote ?? "").trim()) return true;
  if ((pack.misconceptions?.length ?? 0) > 0) return true;
  if ((pack.passage?.text ?? "").trim()) return true;
  if ((pack.vocabulary?.length ?? 0) > 0) return true;
  if ((pack.targetWords?.length ?? 0) > 0) return true;
  if ((pack.workedExamples?.length ?? 0) > 0) return true;
  if (questions.some((q) => q.prompt.length > 0)) return true;
  if ((pack.activities ?? []).some((a) => Boolean(a.kind))) return true;
  return false;
}

function approvalReasons(
  pack: NormalizedDaytimeStagePack,
  questions: PlayableLessonQuestion[],
  reviewable: boolean,
): string[] {
  const reasons: string[] = [];
  if (pack.generationStatus === "failed") {
    reasons.push(pack.failureReason?.trim() || "Generation marked failed.");
  }
  if (!reviewable) {
    reasons.push("Lesson body is empty — nothing for Admin to review.");
  }
  const mode = pack.subjectType;
  if (mode === "maths") {
    if (!(pack.explanation ?? "").trim() && questions.length === 0) {
      reasons.push("Maths lesson is missing explanation and questions.");
    }
  }
  if (mode === "guided-reading") {
    if (!(pack.passage?.text ?? "").trim() && questions.length === 0) {
      reasons.push("Reading lesson is missing passage and questions.");
    }
  }
  if (mode === "spelling") {
    if (!(pack.ruleExplanation ?? pack.spellingFocus ?? "").trim() && (pack.targetWords?.length ?? 0) === 0 && questions.length === 0) {
      reasons.push("Spelling lesson is missing rule, target words, and questions.");
    }
  }
  return reasons;
}

/**
 * Shared parser for Admin review of playable Daytime / Short Learning content.
 * Does not change persisted contentJson. Tolerates object packs and legacy arrays.
 * Deduplicates questions when both questions[] and items[] carry the same prompts.
 */
export function parsePlayableLessonContent(
  contentJson: string | null | undefined,
  options?: ParsePlayableLessonContentOptions,
): PlayableLessonParseResult {
  if (contentJson == null || !String(contentJson).trim()) {
    return {
      ok: false,
      error: "Content JSON is missing.",
      approvalDenialReasons: ["Content reference has no lesson body."],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(contentJson));
  } catch {
    return {
      ok: false,
      error: "Content JSON is malformed.",
      approvalDenialReasons: ["Lesson content cannot be parsed."],
    };
  }

  // Review surface: merge questions[] + items[] then dedupe so neither source is dropped.
  // Persisted contentJson is left unchanged.
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const row = parsed as Record<string, unknown>;
    const fromQuestions = Array.isArray(row.questions) ? row.questions : [];
    const fromItems = Array.isArray(row.items) ? row.items : [];
    if (fromQuestions.length || fromItems.length) {
      const merged: unknown[] = [];
      const seen = new Set<string>();
      for (const entry of [...fromQuestions, ...fromItems]) {
        if (!entry || typeof entry !== "object") continue;
        const item = entry as Record<string, unknown>;
        const prompt = String(item.prompt ?? item.question ?? "").trim().toLowerCase();
        const answer = String(item.answer ?? item.correctAnswer ?? "").trim().toLowerCase();
        const key = `${prompt}::${answer}`;
        if (!prompt || seen.has(key)) continue;
        seen.add(key);
        merged.push(entry);
      }
      parsed = { ...row, questions: merged, items: merged };
    }
  }

  const fallbackMode = modeFromHints(options);
  const pack = normalizeDaytimeStagePack(parsed, fallbackMode);
  if (!pack) {
    return {
      ok: false,
      error: "Content JSON is not a recognised lesson pack.",
      approvalDenialReasons: ["Lesson content cannot be parsed."],
    };
  }

  // normalizeDaytimeStagePack already prefers questions[] then items[].
  // Deduplicate in case both arrays were merged upstream with identical rows.
  const questions = dedupeQuestions(pack.questions).map(mapQuestion);
  const reviewable = hasReviewableBody(pack, questions);
  const approvalDenialReasons = approvalReasons(pack, questions, reviewable);

  return {
    ok: true,
    title: pack.title,
    subjectType: pack.subjectType,
    estimatedMinutes: pack.estimatedMinutes,
    learningObjective: pack.learningObjective?.trim() || null,
    explanation: pack.explanation?.trim() || null,
    workedExamples: (pack.workedExamples ?? []).map((ex) => ({
      question: ex.question,
      steps: ex.steps ?? [],
      answer: ex.answer,
    })),
    activities: (pack.activities ?? []).map((a) => ({
      kind: a.kind,
      estimatedMinutes: a.estimatedMinutes,
      title: a.title ?? null,
    })),
    questions,
    passage: pack.passage
      ? {
          title: pack.passage.title,
          text: pack.passage.text,
          paragraphs: pack.passage.paragraphs ?? [],
          wordCount: pack.passage.wordCount,
        }
      : null,
    vocabulary: (pack.vocabulary ?? []).map((v) => ({
      word: v.word,
      meaning: v.childFriendlyMeaning,
      example: v.example ?? null,
    })),
    spellingFocus: pack.spellingFocus?.trim() || null,
    targetWords: pack.targetWords ?? [],
    ruleExplanation: pack.ruleExplanation?.trim() || null,
    scenarioOrObservation: pack.scenarioOrObservation?.trim() || null,
    priorLearningWarmup: pack.priorLearningWarmup?.trim() || null,
    misconceptions: pack.misconceptions ?? [],
    reflectionCheck: pack.reflectionCheck?.trim() || null,
    transitionNote: pack.transitionNote?.trim() || null,
    instructions: null,
    generationStatus: pack.generationStatus ?? null,
    failureReason: pack.failureReason ?? null,
    hasReviewableBody: reviewable,
    approvalDenialReasons,
  };
}

export function canApprovePlayableLesson(result: PlayableLessonParseResult): boolean {
  return result.ok && result.hasReviewableBody && result.approvalDenialReasons.length === 0;
}
