import {
  activitiesSupportTargetMinutes,
  distinctActivityKinds,
  estimateMinutesFromActivities,
  type DaytimeActivityEstimate,
  type QuestionBreakdown,
} from "@/lib/schools/daytime-activity-types";
import {
  normalizeDaytimeActivityKind,
  questionKindRequiresFixedAnswer,
} from "@/lib/schools/daytime-activity-kind";
import type { DaytimeSubjectMode } from "@/lib/schools/daytime-subject-mode";

const INTERNAL_ID_LEAK = /(?:^|[^a-z0-9])(?:(?:warmup|core|stretch)-)?c[a-z0-9]{20,}(?:[^a-z0-9]|$)/i;
const PLACEHOLDER_MARKERS = [
  "according to the pe passage",
  "science passage on",
  "placeholder",
  "lorem ipsum",
  "todo:",
  "FIXME",
];

export type DaytimeStageValidationIssue = {
  code: string;
  message: string;
};

export type NormalizedDaytimeQuestion = {
  id?: string;
  prompt: string;
  question: string;
  answer: string | number;
  choices?: Array<string | number>;
  options?: Array<string | number>;
  explanation: string;
  hints: string[];
  breakdown?: QuestionBreakdown;
  passage?: string;
  kind?: string;
};

export type NormalizedDaytimeStagePack = {
  subjectType: DaytimeSubjectMode;
  title: string;
  estimatedMinutes: number;
  targetItems: number;
  activities: DaytimeActivityEstimate[];
  questions: NormalizedDaytimeQuestion[];
  passage?: {
    title: string;
    text: string;
    paragraphs: string[];
    wordCount: number;
  };
  vocabulary?: Array<{ word: string; childFriendlyMeaning: string; example?: string }>;
  spellingFocus?: string;
  targetWords?: string[];
  ruleExplanation?: string;
  learningObjective?: string;
  explanation?: string;
  workedExamples?: Array<{ question: string; steps: string[]; answer: string }>;
  scenarioOrObservation?: string;
  generationStatus?: "ok" | "failed";
  failureReason?: string | null;
  raw?: Record<string, unknown>;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function tokenizeOverlap(left: string, right: string): boolean {
  const tokens = left
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((part) => part.length >= 4);
  if (!tokens.length) return false;
  const haystack = right.toLowerCase();
  return tokens.some((token) => haystack.includes(token));
}

function collectText(pack: NormalizedDaytimeStagePack): string {
  const chunks: string[] = [];
  chunks.push(pack.title);
  if (pack.passage) {
    chunks.push(pack.passage.title, pack.passage.text, ...pack.passage.paragraphs);
  }
  chunks.push(pack.explanation ?? "", pack.ruleExplanation ?? "", pack.scenarioOrObservation ?? "");
  for (const word of pack.vocabulary ?? []) {
    chunks.push(word.word, word.childFriendlyMeaning, word.example ?? "");
  }
  for (const q of pack.questions) {
    chunks.push(q.prompt, q.question, String(q.answer), q.explanation, ...(q.hints ?? []));
    if (q.breakdown) {
      chunks.push(q.breakdown.simplerQuestion, q.breakdown.startingPoint, ...q.breakdown.steps);
      for (const kw of q.breakdown.keyWords) chunks.push(kw.word, kw.meaning);
    }
    for (const choice of q.choices ?? q.options ?? []) chunks.push(String(choice));
  }
  for (const activity of pack.activities) {
    chunks.push(activity.title ?? "", activity.kind);
  }
  return chunks.join("\n");
}

export function normalizeDaytimeStagePack(raw: unknown, fallbackMode: DaytimeSubjectMode): NormalizedDaytimeStagePack | null {
  if (Array.isArray(raw)) {
    return normalizeDaytimeStagePack({
      subjectType: fallbackMode,
      title: "Stage",
      estimatedMinutes: estimateMinutesFromActivities(null, raw.length),
      targetItems: raw.length,
      activities: raw.length
        ? [{ kind: "multiple-choice", estimatedMinutes: estimateMinutesFromActivities(null, raw.length) }]
        : [],
      questions: raw,
    }, fallbackMode);
  }
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const subjectType = (asString(row.subjectType) || fallbackMode) as DaytimeSubjectMode;
  const activitiesRaw = Array.isArray(row.activities) ? row.activities : [];
  const activities: DaytimeActivityEstimate[] = [];
  const unknownActivityKinds: string[] = [];
  for (const item of activitiesRaw) {
    if (!item || typeof item !== "object") continue;
    const activity = item as Record<string, unknown>;
    const normalized = normalizeDaytimeActivityKind(activity.kind);
    if (!normalized.ok) {
      unknownActivityKinds.push(normalized.originalLabel || "(empty)");
      continue;
    }
    activities.push({
      kind: normalized.kind,
      estimatedMinutes: Math.max(0.5, asNumber(activity.estimatedMinutes, 1)),
      title: asString(activity.title) || (normalized.aliased ? normalized.originalLabel : undefined),
    });
  }

  let questions: NormalizedDaytimeQuestion[] = [];
  const questionsRaw = Array.isArray(row.questions)
    ? row.questions
    : Array.isArray(row.items)
      ? row.items
      : [];
  questions = questionsRaw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item, index) => {
      const prompt = asString(item.prompt) || asString(item.question) || `Question ${index + 1}`;
      const hints = Array.isArray(item.hints)
        ? item.hints.map((h) => asString(h)).filter(Boolean)
        : asString(item.hint)
          ? [asString(item.hint)]
          : [];
      const breakdownRaw = item.breakdown && typeof item.breakdown === "object"
        ? item.breakdown as Record<string, unknown>
        : null;
      const breakdown: QuestionBreakdown | undefined = breakdownRaw
        ? {
            simplerQuestion: asString(breakdownRaw.simplerQuestion) || prompt,
            steps: Array.isArray(breakdownRaw.steps)
              ? breakdownRaw.steps.map((s) => asString(s)).filter(Boolean)
              : [],
            keyWords: Array.isArray(breakdownRaw.keyWords)
              ? breakdownRaw.keyWords
                .filter((kw): kw is Record<string, unknown> => Boolean(kw) && typeof kw === "object")
                .map((kw) => ({ word: asString(kw.word), meaning: asString(kw.meaning) }))
                .filter((kw) => kw.word && kw.meaning)
              : [],
            startingPoint: asString(breakdownRaw.startingPoint) || hints[0] || "Read the question carefully.",
          }
        : undefined;
      const choices = Array.isArray(item.choices)
        ? item.choices
        : Array.isArray(item.options)
          ? item.options
          : undefined;
      const rawAnswer = item.answer ?? item.correctAnswer ?? "";
      const answer: string | number = typeof rawAnswer === "number"
        ? rawAnswer
        : asString(rawAnswer) || String(rawAnswer ?? "");
      return {
        id: asString(item.id) || undefined,
        prompt,
        question: prompt,
        answer,
        choices: choices as Array<string | number> | undefined,
        options: choices as Array<string | number> | undefined,
        explanation: asString(item.explanation) || "Check your answer against the lesson explanation.",
        hints: hints.length ? hints : ["Re-read the question and underline the key words."],
        breakdown,
        passage: asString(item.passage) || undefined,
        kind: (() => {
          const rawKind = asString(item.kind);
          if (!rawKind) return undefined;
          const normalized = normalizeDaytimeActivityKind(rawKind);
          return normalized.ok ? normalized.kind : rawKind;
        })(),
      };
    });

  let passage: NormalizedDaytimeStagePack["passage"];
  if (row.passage && typeof row.passage === "object" && !Array.isArray(row.passage)) {
    const p = row.passage as Record<string, unknown>;
    const text = asString(p.text) || asString(p.passage);
    const paragraphs = Array.isArray(p.paragraphs)
      ? p.paragraphs.map((para) => asString(para)).filter(Boolean)
      : text
        ? text.split(/\n+/).map((para) => para.trim()).filter(Boolean)
        : [];
    const joined = paragraphs.length ? paragraphs.join("\n\n") : text;
    if (joined) {
      passage = {
        title: asString(p.title) || "Reading passage",
        text: joined,
        paragraphs: paragraphs.length ? paragraphs : [joined],
        wordCount: asNumber(p.wordCount, joined.split(/\s+/).filter(Boolean).length),
      };
    }
  } else if (typeof row.passage === "string" && row.passage.trim()) {
    const text = row.passage.trim();
    const paragraphs = text.split(/\n+/).map((para) => para.trim()).filter(Boolean);
    passage = {
      title: asString(row.title) || "Reading passage",
      text,
      paragraphs: paragraphs.length ? paragraphs : [text],
      wordCount: text.split(/\s+/).filter(Boolean).length,
    };
  }

  const vocabularySource = Array.isArray(row.vocabulary)
    ? row.vocabulary
    : Array.isArray(row.keyVocabulary)
      ? row.keyVocabulary
      : null;
  const vocabulary = vocabularySource
    ? vocabularySource
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        word: asString(item.word),
        childFriendlyMeaning: asString(item.childFriendlyMeaning) || asString(item.meaning),
        example: asString(item.example) || undefined,
      }))
      .filter((item) => item.word && item.childFriendlyMeaning)
    : undefined;

  const workedExamples = Array.isArray(row.workedExamples)
    ? row.workedExamples
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        question: asString(item.question),
        steps: Array.isArray(item.steps) ? item.steps.map((s) => asString(s)).filter(Boolean) : [],
        answer: asString(item.answer),
      }))
      .filter((item) => item.question && item.answer)
    : undefined;

  const estimatedMinutes = asNumber(row.estimatedMinutes, estimateMinutesFromActivities(activities, questions.length));
  const targetItems = asNumber(row.targetItems, Math.max(questions.length, activities.length));

  return {
    subjectType,
    title: asString(row.title) || "Stage",
    estimatedMinutes,
    targetItems,
    activities,
    questions,
    passage,
    vocabulary,
    spellingFocus: asString(row.spellingFocus) || undefined,
    targetWords: Array.isArray(row.targetWords)
      ? row.targetWords.map((w) => asString(w)).filter(Boolean)
      : undefined,
    ruleExplanation: asString(row.ruleExplanation) || undefined,
    learningObjective: asString(row.learningObjective) || asString(row.topic) || undefined,
    explanation: asString(row.explanation) || undefined,
    workedExamples,
    scenarioOrObservation: asString(row.scenarioOrObservation) || undefined,
    generationStatus: row.generationStatus === "failed" ? "failed" : "ok",
    failureReason: asString(row.failureReason) || null,
    raw: {
      ...row,
      ...(unknownActivityKinds.length ? { unknownActivityKinds } : {}),
    },
  };
}

export function validateDaytimeStagePack(input: {
  pack: NormalizedDaytimeStagePack;
  mode: DaytimeSubjectMode;
  stage: "warmup" | "core" | "stretch";
  targetMinutes: number;
  lessonTitle: string;
}): DaytimeStageValidationIssue[] {
  const issues: DaytimeStageValidationIssue[] = [];
  const { pack, mode, stage, targetMinutes } = input;

  if (pack.generationStatus === "failed") {
    issues.push({ code: "generation_failed", message: pack.failureReason || "Stage generation failed." });
    return issues;
  }

  const text = collectText(pack);
  if (INTERNAL_ID_LEAK.test(text)) {
    issues.push({ code: "internal_id_leak", message: "Internal IDs appear in pupil-facing content." });
  }
  const lower = text.toLowerCase();
  for (const marker of PLACEHOLDER_MARKERS) {
    if (lower.includes(marker)) {
      issues.push({ code: "placeholder", message: `Placeholder phrasing detected (${marker}).` });
      break;
    }
  }

  const unknownKinds = Array.isArray(pack.raw?.unknownActivityKinds)
    ? (pack.raw?.unknownActivityKinds as string[])
    : [];
  for (const kind of unknownKinds) {
    issues.push({
      code: "unsupported_activity_kind",
      message: `Unsupported activity kind "${kind}" could not be classified.`,
    });
  }

  if (!pack.activities.length) {
    issues.push({ code: "missing_activities", message: "Stage has no timed activities." });
  } else if (!activitiesSupportTargetMinutes(pack.activities, targetMinutes)) {
    issues.push({
      code: "duration_mismatch",
      message: `Activity minutes (~${estimateMinutesFromActivities(pack.activities, pack.questions.length)}m) do not support target ${targetMinutes}m.`,
    });
  }

  const prompts = pack.questions.map((q) => q.prompt.toLowerCase());
  const uniquePrompts = new Set(prompts);
  if (prompts.length >= 3 && uniquePrompts.size < Math.ceil(prompts.length * 0.6)) {
    issues.push({ code: "duplicate_questions", message: "Too many repeated questions in this stage." });
  }

  for (const q of pack.questions) {
    const needsFixedAnswer = questionKindRequiresFixedAnswer(q.kind);
    if (needsFixedAnswer && !String(q.answer ?? "").trim() && q.answer !== 0) {
      issues.push({ code: "missing_answer", message: `Missing answer for: ${q.prompt.slice(0, 60)}` });
    }
    if (!q.explanation?.trim() && needsFixedAnswer) {
      issues.push({ code: "missing_explanation", message: `Missing explanation for: ${q.prompt.slice(0, 60)}` });
    }
    if (!q.hints?.length && needsFixedAnswer) {
      issues.push({ code: "missing_hints", message: `Missing hints for: ${q.prompt.slice(0, 60)}` });
    }
  }

  if (mode === "guided-reading") {
    if (!pack.passage?.text || pack.passage.wordCount < 40) {
      issues.push({ code: "missing_passage", message: "Guided Reading requires a real pupil-facing passage." });
    }
    if (!pack.vocabulary?.length) {
      issues.push({ code: "missing_vocabulary", message: "Guided Reading needs vocabulary support." });
    }
    const refsPassage = pack.questions.filter((q) =>
      /passage|text|paragraph|evidence|author|forest|story|character|lily|village|according to/i.test(q.prompt)
      || (pack.passage?.text
        ? tokenizeOverlap(q.prompt, pack.passage.text)
        : false),
    );
    if (pack.questions.length && refsPassage.length === 0) {
      issues.push({ code: "questions_not_about_passage", message: "Questions do not meaningfully refer to the passage." });
    }
    if (!pack.passage && pack.questions.some((q) => /according to the passage|from the text/i.test(q.prompt))) {
      issues.push({ code: "passage_reference_without_passage", message: "Questions reference a passage that is missing." });
    }
  }

  if (mode === "spelling") {
    if (!pack.spellingFocus && !pack.ruleExplanation) {
      issues.push({ code: "missing_spelling_focus", message: "Spelling focus / rule explanation missing." });
    }
    if (!pack.targetWords || pack.targetWords.length < 4) {
      issues.push({ code: "missing_target_words", message: "Need at least 4 target spelling words." });
    }
    if (stage === "core" && distinctActivityKinds(pack.activities) < 4) {
      issues.push({ code: "spelling_variety", message: "Core spelling needs varied activity types (not only identical prompts)." });
    }
  }

  if (mode === "maths") {
    if (stage === "core") {
      if (!pack.explanation?.trim()) {
        issues.push({ code: "missing_maths_explanation", message: "Maths stage needs a teaching explanation." });
      }
      if (!pack.workedExamples || pack.workedExamples.length < 1) {
        issues.push({ code: "missing_worked_example", message: "Core Maths needs at least one worked example." });
      }
    } else if (stage === "warmup" && !pack.explanation?.trim() && !pack.workedExamples?.length) {
      // Warm-up should still teach briefly, but accept worked example as the teaching hook.
      issues.push({ code: "missing_maths_explanation", message: "Maths warm-up needs a short teaching explanation or worked example." });
    }
    const hasReasoningActivity = pack.activities.some((a) => a.kind === "reasoning");
    const hasReasoningQuestion = pack.questions.some((q) =>
      q.kind === "reasoning"
      || /why|explain|reason|mistake|word problem|how do you know|justify|compare strategies/i.test(q.prompt),
    );
    if (stage === "core" && !hasReasoningActivity && !hasReasoningQuestion) {
      issues.push({ code: "missing_reasoning", message: "Core Maths needs reasoning or word-problem work." });
    }
    if (stage === "core") {
      const hasScaffold = pack.activities.some((a) => a.kind === "scaffold" || a.kind === "worked-example");
      const hasIndependent = pack.activities.some((a) =>
        a.kind === "independent" || a.kind === "short-answer" || a.kind === "multiple-choice" || a.kind === "challenge",
      );
      if (!hasScaffold) {
        issues.push({ code: "missing_scaffold", message: "Core Maths needs scaffolded practice." });
      }
      if (!hasIndependent) {
        issues.push({ code: "missing_independent", message: "Core Maths needs independent practice." });
      }
    }
  }

  if (mode === "science") {
    if (!pack.explanation?.trim()) {
      issues.push({ code: "missing_science_explanation", message: "Science needs a topic explanation." });
    }
    const minVocab = stage === "core" ? 3 : 2;
    if (!pack.vocabulary?.length) {
      issues.push({ code: "missing_science_vocab", message: "Science needs key vocabulary." });
    } else if (pack.vocabulary.length < minVocab) {
      issues.push({
        code: "missing_science_vocab",
        message: `Science needs at least ${minVocab} topic-specific vocabulary terms.`,
      });
    }
    if (stage === "core") {
      const scienceTask = pack.activities.some((a) =>
        ["practical", "prediction", "reasoning", "short-answer", "multiple-choice", "challenge"].includes(a.kind),
      ) || pack.questions.some((q) =>
        /observe|predict|classify|compare|evidence|scenario|practical|explain why/i.test(q.prompt),
      );
      if (!scienceTask) {
        issues.push({
          code: "missing_science_task",
          message: "Science core needs observation, scenario, practical, classification, comparison, prediction, or evidence work.",
        });
      }
    }
    const genericCount = pack.questions.filter((q) =>
      /according to the passage|which skill focus does this lesson/i.test(q.prompt),
    ).length;
    if (genericCount >= 2) {
      issues.push({ code: "generic_science_questions", message: "Science questions look like generic placeholders." });
    }
  }

  if (mode === "practical-pe" || mode === "practical-arts" || mode === "practical-music") {
    const practicalKinds = pack.activities.filter((a) =>
      a.kind === "practical" || a.kind === "reflection" || a.kind === "teacher-explanation",
    ).length;
    if (practicalKinds < 2) {
      issues.push({ code: "not_practical", message: "Practical subjects need movement/practice activities, not a reading quiz." });
    }
    if (pack.questions.some((q) => /according to the.*passage/i.test(q.prompt))) {
      issues.push({ code: "pe_as_reading", message: "Practical lesson must not be framed as passage comprehension." });
    }
    if (mode === "practical-pe") {
      const blob = collectText(pack).toLowerCase();
      const explanation = (pack.explanation ?? "").toLowerCase();
      const safetyBlob = `${explanation}\n${blob}`;
      if (!explanation.trim()) {
        // Prefer a dedicated explanation, but accept safety language embedded in activities/questions.
        if (!/\b(safe|space|stop|freeze|whistle|teacher|supervision|injury|warm[- ]?up|cool[- ]?down)\b/i.test(blob)) {
          issues.push({ code: "pe_missing_safety", message: "PE needs a safety explanation covering space, stop signals, and supervision." });
        }
      } else if (!/\b(safe|space|stop|freeze|whistle|teacher|supervision|injury|warm[- ]?up|cool[- ]?down)\b/i.test(safetyBlob)) {
        issues.push({ code: "pe_missing_safety", message: "PE safety explanation must mention safe space, stop signal, or teacher supervision." });
      }
      if (/\b(tackle\s+hard|full[- ]contact|crash\s+into|body\s+check|without\s+supervision)\b/i.test(blob)) {
        issues.push({ code: "pe_unsafe_content", message: "PE instructions include unsafe contact or unsupervised risk." });
      }
      if (stage === "warmup" && !pack.activities.some((a) => a.kind === "practical")) {
        issues.push({ code: "pe_missing_warmup", message: "PE warm-up needs a practical movement activity." });
      }
      if (stage === "core") {
        const hasGameOrSkill = pack.activities.filter((a) => a.kind === "practical").length >= 2;
        if (!hasGameOrSkill) {
          issues.push({ code: "pe_missing_practice", message: "PE core needs skill practice and a teamwork/game activity." });
        }
        if (!/\b(cool[- ]?down|stretch)\b/i.test(blob)) {
          issues.push({ code: "pe_missing_cooldown", message: "PE core should include cool-down guidance." });
        }
      }
    }
  }

  return issues;
}

/** Serialize a validated pack into game-compatible contentJson + review fields. */
export function serializeDaytimeStageContentJson(pack: NormalizedDaytimeStagePack): string {
  const sharedPassage = pack.passage?.text ?? "";
  const targetWords = pack.targetWords ?? [];
  const isSpelling = pack.subjectType === "spelling";
  const questions = pack.questions.map((q, index) => {
    const answerWord = String(q.answer ?? "").trim();
    const wordFromTargets = targetWords[index] || targetWords[index % Math.max(targetWords.length, 1)] || "";
    // Assignment safety requires a top-level `word` on every spelling item.
    const spellingWord = isSpelling
      ? (answerWord && !/\s/.test(answerWord) && answerWord.length <= 32 ? answerWord : wordFromTargets)
      : "";
    return {
      id: q.id || `daytime-q-${index + 1}`,
      prompt: q.prompt,
      question: q.question,
      answer: q.answer,
      correctAnswer: q.answer,
      choices: q.choices ?? q.options,
      options: q.options ?? q.choices,
      explanation: q.explanation,
      hints: q.hints,
      hint: q.hints[0],
      breakdown: q.breakdown,
      passage: q.passage || sharedPassage || undefined,
      kind: q.kind,
      ...(isSpelling
        ? {
            word: spellingWord || targetWords[0] || "practice",
            questionType: "spelling",
            sentenceContext: pack.spellingFocus || pack.ruleExplanation || undefined,
          }
        : {}),
    };
  });

  return JSON.stringify({
    subjectType: pack.subjectType,
    title: pack.title,
    estimatedMinutes: pack.estimatedMinutes,
    targetItems: pack.targetItems,
    activities: pack.activities,
    passage: pack.passage ?? undefined,
    vocabulary: pack.vocabulary,
    spellingFocus: pack.spellingFocus,
    targetWords: pack.targetWords,
    ruleExplanation: pack.ruleExplanation,
    learningObjective: pack.learningObjective,
    explanation: pack.explanation,
    workedExamples: pack.workedExamples,
    scenarioOrObservation: pack.scenarioOrObservation,
    generationStatus: pack.generationStatus ?? "ok",
    failureReason: pack.failureReason ?? null,
    questions,
    // Flat array compatibility for older game loaders that expect top-level arrays.
    items: questions,
  });
}

export function failedStagePack(input: {
  mode: DaytimeSubjectMode;
  title: string;
  targetMinutes: number;
  targetItems: number;
  reason: string;
}): NormalizedDaytimeStagePack {
  return {
    subjectType: input.mode,
    title: input.title,
    estimatedMinutes: input.targetMinutes,
    targetItems: input.targetItems,
    activities: [],
    questions: [],
    generationStatus: "failed",
    failureReason: input.reason,
  };
}
