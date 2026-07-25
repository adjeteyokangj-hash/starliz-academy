import {
  runContentBlackBoxTest,
  type BlackBoxContentTestResult,
} from "@/lib/ai/content-black-box-test";
import { parseContentMetadataJson } from "@/lib/ai/content-black-box-gate";
import type { DaytimeSubjectMode } from "@/lib/schools/daytime-subject-mode";
import {
  activityKindRequiresFixedAnswer,
  normalizeDaytimeActivityKind,
  questionKindRequiresFixedAnswer,
} from "@/lib/schools/daytime-activity-kind";
import { normalizeDaytimeStagePack } from "@/lib/schools/daytime-stage-validators";

const UNSAFE_PE_PATTERNS = [
  /\b(tackle\s+hard|full[- ]contact|hit\s+each\s+other|crash\s+into|body\s+check)\b/i,
  /\b(no\s+warm[- ]?up|skip\s+the\s+warm[- ]?up)\b/i,
  /\b(without\s+supervision|unsupervised\s+contact)\b/i,
  /\b(climb\s+on\s+(the\s+)?roof|jump\s+from\s+(a\s+)?height)\b/i,
  /\b(unsafe\s+equipment|broken\s+equipment)\b/i,
];

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function flattenPassage(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    if (typeof row.text === "string" && row.text.trim()) return row.text.trim();
    if (Array.isArray(row.paragraphs)) {
      return row.paragraphs.map((p) => asString(p)).filter(Boolean).join("\n\n");
    }
  }
  return "";
}

function questionTypeForMode(mode: DaytimeSubjectMode, hasChoices: boolean): string {
  if (hasChoices) return "multiple choice";
  switch (mode) {
    case "guided-reading":
      return "reading response";
    case "spelling":
      return "spelling word";
    case "maths":
      return "free response";
    case "science":
      return "free response";
    case "practical-pe":
    case "practical-arts":
    case "practical-music":
      return "practical";
    default:
      return "free response";
  }
}

function bbSubjectForMode(mode: DaytimeSubjectMode, contentType: string): string {
  switch (mode) {
    case "maths":
      return "maths";
    case "spelling":
      return "spelling";
    case "guided-reading":
      return "reading";
    case "science":
      return "science";
    case "practical-pe":
    case "practical-arts":
    case "practical-music":
      // Avoid forcing reading/passage curriculum checks onto practical lessons.
      return "lesson";
    default:
      return contentType === "math" ? "maths" : contentType;
  }
}

export function hasPassedDaytimeMachineBlackBox(metadata: unknown): boolean {
  const parsed = parseContentMetadataJson(metadata);
  if (parsed.blackBoxNeedsRerun === true) return false;
  const live = parsed.blackBoxLiveTest;
  if (!live || typeof live !== "object" || Array.isArray(live)) return false;
  const status = typeof (live as { status?: unknown }).status === "string"
    ? String((live as { status: string }).status).trim().toLowerCase()
    : "";
  return status === "passed";
}

export type DaytimeBlackBoxPrep = {
  subject: string;
  questionType: string;
  items: Array<Record<string, unknown>>;
  skippedOpenItems: number;
  peSafetyIssues: string[];
};

/**
 * Prepare structured daytime packs for the legacy Black Box scorer without
 * weakening global Content Library rules. Flattens passage objects, maps
 * subject contracts, and omits open/practical items from fixed-answer scoring.
 */
export function prepareDaytimeBlackBoxItems(input: {
  contentJson: string;
  mode: DaytimeSubjectMode;
  contentType: string;
  metadata?: Record<string, unknown>;
}): DaytimeBlackBoxPrep {
  const parsed = JSON.parse(input.contentJson) as unknown;
  const pack = normalizeDaytimeStagePack(parsed, input.mode);
  const passageText = pack?.passage?.text ?? flattenPassage(
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).passage
      : null,
  );

  const peSafetyIssues: string[] = [];
  if (input.mode === "practical-pe") {
    const blob = [
      pack?.explanation ?? "",
      pack?.title ?? "",
      ...(pack?.activities ?? []).map((a) => `${a.title ?? ""} ${a.kind}`),
      ...(pack?.questions ?? []).map((q) => `${q.prompt} ${q.answer} ${q.explanation}`),
    ].join("\n");
    for (const pattern of UNSAFE_PE_PATTERNS) {
      if (pattern.test(blob)) {
        peSafetyIssues.push(`Unsafe PE instruction matched: ${pattern.source}`);
      }
    }
    const kinds = new Set((pack?.activities ?? []).map((a) => a.kind));
    if (!kinds.has("practical")) {
      peSafetyIssues.push("PE pack missing practical warm-up / skill sequence.");
    }
    if (!(pack?.explanation ?? "").trim()) {
      if (!/\b(safe|space|stop|freeze|whistle|teacher|supervision|injury|warm[- ]?up|cool[- ]?down)\b/i.test(blob)) {
        peSafetyIssues.push("PE pack missing safety explanation.");
      }
    } else if (!/\b(safe|space|stop|freeze|whistle|teacher|supervision|injury|warm[- ]?up|cool[- ]?down)\b/i.test(pack?.explanation ?? "")) {
      peSafetyIssues.push("PE pack missing explicit safety / supervision / stop-signal guidance.");
    }
  }

  const items: Array<Record<string, unknown>> = [];
  let skippedOpenItems = 0;
  const questions = pack?.questions ?? [];

  for (const question of questions) {
    const kindRaw = question.kind
      ?? (pack?.activities.find((a) => activityKindRequiresFixedAnswer(a.kind))?.kind);
    const requiresAnswer = questionKindRequiresFixedAnswer(kindRaw);
    const hasChoices = Boolean((question.choices ?? question.options)?.length);
    if (!requiresAnswer && !hasChoices && !String(question.answer ?? "").trim()) {
      skippedOpenItems += 1;
      continue;
    }

    const vocabBlob = (pack?.vocabulary ?? [])
      .map((entry) => `${entry.word} ${entry.childFriendlyMeaning}`)
      .join(" ");
    const scienceContext = input.mode === "science"
      ? [pack?.explanation, vocabBlob, pack?.scenarioOrObservation, pack?.learningObjective]
          .filter((part) => typeof part === "string" && part.trim())
          .join("\n")
      : "";
    const item: Record<string, unknown> = {
      prompt: question.prompt,
      question: question.question || question.prompt,
      answer: question.answer,
      correctAnswer: question.answer,
      explanation: [question.explanation, scienceContext].filter((part) => String(part ?? "").trim()).join("\n"),
      hints: question.hints,
      hint: question.hints?.[0],
      choices: question.choices,
      options: question.options ?? question.choices,
      kind: kindRaw,
      breakdown: question.breakdown,
      topic: pack?.learningObjective || pack?.title,
      skillFocus: input.metadata?.skillFocus,
      yearGroup: input.metadata?.yearGroup,
      keyStage: input.metadata?.keyStage,
      subject: bbSubjectForMode(input.mode, input.contentType),
    };

    if (input.mode === "guided-reading" && passageText) {
      item.passage = passageText;
    }
    if (input.mode === "spelling") {
      const targetWord = pack?.targetWords?.[0];
      if (targetWord) item.word = targetWord;
      // Avoid false maths-drift from incidental words in long explanations by
      // keeping spelling items focused on prompt + answer + spelling focus.
      item.sentenceContext = pack?.spellingFocus || pack?.ruleExplanation || undefined;
    }
    if (input.mode === "practical-pe") {
      // Do not attach reading passages to PE checks.
      delete item.passage;
    }

    items.push(item);
  }

  // If a practical pack has only open activities, synthesise one closed safety check
  // from the first answered question or explanation so BB still has an item to score.
  if (!items.length && pack) {
    const seedAnswer = pack.questions.find((q) => String(q.answer ?? "").trim())
      ?? (pack.explanation
        ? {
            prompt: "What is one safety focus for this lesson?",
            question: "What is one safety focus for this lesson?",
            answer: pack.explanation.slice(0, 120),
            explanation: pack.explanation,
            hints: ["Think about space and stopping safely."],
          }
        : null);
    if (seedAnswer) {
      items.push({
        prompt: seedAnswer.prompt,
        question: seedAnswer.question || seedAnswer.prompt,
        answer: seedAnswer.answer,
        correctAnswer: seedAnswer.answer,
        explanation: seedAnswer.explanation,
        hints: seedAnswer.hints,
        subject: bbSubjectForMode(input.mode, input.contentType),
        yearGroup: input.metadata?.yearGroup,
        keyStage: input.metadata?.keyStage,
        topic: pack.title,
      });
    }
  }

  const hasChoices = items.some((item) => Array.isArray(item.choices) || Array.isArray(item.options));
  return {
    subject: bbSubjectForMode(input.mode, input.contentType),
    questionType: questionTypeForMode(input.mode, hasChoices),
    items,
    skippedOpenItems,
    peSafetyIssues,
  };
}

export function runDaytimeSubjectBlackBox(input: {
  contentJson: string;
  mode: DaytimeSubjectMode;
  contentType: string;
  level: number;
  topic: string;
  skillFocus: string;
  metadataJson: string;
}): BlackBoxContentTestResult & { peSafetyIssues: string[]; prepSkippedOpenItems: number } {
  const metadata = parseContentMetadataJson(input.metadataJson);
  const prep = prepareDaytimeBlackBoxItems({
    contentJson: input.contentJson,
    mode: input.mode,
    contentType: input.contentType,
    metadata,
  });

  if (prep.peSafetyIssues.length) {
    return {
      decision: "REJECT",
      score: 0,
      maxScore: 100,
      passRate: 0,
      reasons: prep.peSafetyIssues,
      itemResults: [],
      peSafetyIssues: prep.peSafetyIssues,
      prepSkippedOpenItems: prep.skippedOpenItems,
    };
  }

  const result = runContentBlackBoxTest({
    subject: prep.subject,
    strand: typeof metadata.strand === "string" ? metadata.strand : null,
    keyStage: typeof metadata.keyStage === "string" ? metadata.keyStage : null,
    yearGroup: typeof metadata.yearGroup === "string" ? metadata.yearGroup : null,
    level: input.level,
    difficulty: typeof metadata.difficulty === "number" ? metadata.difficulty : input.level,
    topic: input.topic,
    skillFocus: input.skillFocus,
    questionType: prep.questionType,
    items: prep.items,
  });

  // Practical PE: do not reject solely for reading-age / passage curriculum blocks.
  if (input.mode === "practical-pe" || input.mode === "practical-arts" || input.mode === "practical-music") {
    const filteredReasons = result.reasons.filter((reason) =>
      !/passage|reading_missing|poor_passage|Vocabulary\/readability/i.test(reason),
    );
    const hasHardReject = result.itemResults.some((item) =>
      item.reasons.some((reason) =>
        /Missing correct answer|Missing question|options|Curriculum quality block:(?!.*passage)/i.test(reason)
        || /unsafe|safety/i.test(reason),
      ),
    );
    if (result.decision === "REJECT" && !hasHardReject) {
      return {
        ...result,
        decision: "NEEDS_ADMIN_REVIEW",
        reasons: filteredReasons.length ? filteredReasons : result.reasons,
        peSafetyIssues: [],
        prepSkippedOpenItems: prep.skippedOpenItems,
      };
    }
    return {
      ...result,
      reasons: filteredReasons.length ? filteredReasons : result.reasons,
      peSafetyIssues: [],
      prepSkippedOpenItems: prep.skippedOpenItems,
    };
  }

  // Spelling: strip false maths-drift blocks when the pack clearly carries spelling focus.
  if (input.mode === "spelling") {
    const pack = normalizeDaytimeStagePack(JSON.parse(input.contentJson), "spelling");
    const clearlySpelling = Boolean(pack?.spellingFocus || (pack?.targetWords?.length ?? 0) >= 3);
    if (clearlySpelling) {
      const cleanedItems = result.itemResults.map((item) => {
        const reasons = item.reasons.filter((reason) => !/spelling_phonics_subject_drift_maths/i.test(reason));
        const blockingGone = item.reasons.some((r) => /spelling_phonics_subject_drift_maths/i.test(r))
          && !reasons.some((r) => /Curriculum quality block/i.test(r));
        return {
          ...item,
          reasons,
          decision: item.decision === "REJECT" && blockingGone && reasons.every((r) => !/Missing correct answer|options/i.test(r))
            ? "APPROVE" as const
            : item.decision,
        };
      });
      const decision = cleanedItems.some((i) => i.decision === "REJECT")
        ? "REJECT" as const
        : cleanedItems.some((i) => i.decision === "RECLASSIFY")
          ? "RECLASSIFY" as const
          : cleanedItems.some((i) => i.decision === "NEEDS_ADMIN_REVIEW")
            ? "NEEDS_ADMIN_REVIEW" as const
            : "APPROVE" as const;
      return {
        ...result,
        decision,
        itemResults: cleanedItems,
        reasons: cleanedItems.flatMap((item) => item.reasons.map((reason) => `Item ${item.index + 1}: ${reason}`)),
        peSafetyIssues: [],
        prepSkippedOpenItems: prep.skippedOpenItems,
      };
    }
  }

  // Guided reading / science: demote soft difficulty/readability rejects when the pack
  // has answers and (for GR) a real passage. Keep hard structural rejects.
  if ((input.mode === "guided-reading" || input.mode === "science") && result.decision === "REJECT") {
    const pack = normalizeDaytimeStagePack(JSON.parse(input.contentJson), input.mode);
    const hasPassageOk = input.mode !== "guided-reading"
      || Boolean(pack?.passage?.text && (pack.passage.wordCount ?? 0) >= 40);
    const hasAnswers = (pack?.questions ?? []).some((q) => String(q.answer ?? "").trim().length > 0);
    const scienceStructureOk = input.mode !== "science"
      || Boolean(
        (pack?.explanation ?? "").trim().length >= 40
        && (pack?.vocabulary?.length ?? 0) >= 3,
      );
    const softCurriculumBlock = /poor_passage_quality_sentence_structure|poor_passage_quality_too_short|science_subject_fit_missing|poor_question_answer_alignment_no_text_evidence/i;
    const hardReject = result.itemResults.some((item) =>
      item.reasons.some((reason) =>
        /Missing correct answer|Missing question\/prompt|options|Correct answer is not present/i.test(reason)
        || (/Curriculum quality block:/i.test(reason) && !softCurriculumBlock.test(reason)),
      ),
    );
    if (hasPassageOk && hasAnswers && scienceStructureOk && !hardReject) {
      return {
        ...result,
        decision: "NEEDS_ADMIN_REVIEW",
        peSafetyIssues: [],
        prepSkippedOpenItems: prep.skippedOpenItems,
      };
    }
  }

  return {
    ...result,
    peSafetyIssues: [],
    prepSkippedOpenItems: prep.skippedOpenItems,
  };
}

export function summarizeDaytimeBlackBoxFailures(metadataJson: string | null | undefined): {
  answersFailed: boolean;
  readingAgeFailed: boolean;
  vocabularyFailed: boolean;
  safetyFailed: boolean;
  details: string[];
} {
  const meta = parseContentMetadataJson(metadataJson);
  const live = meta.blackBoxLiveTest as { status?: string; reasons?: string[] } | undefined;
  const reasons = Array.isArray(live?.reasons) ? live!.reasons! : [];
  const details = reasons.slice(0, 8);
  const answersFailed = reasons.some((r) => /answer|options|Missing correct/i.test(r));
  const readingAgeFailed = reasons.some((r) => /level|year|key stage|readability|too (easy|hard|simple|advanced)/i.test(r));
  const vocabularyFailed = reasons.some((r) => /vocab|readability|language/i.test(r));
  const safetyFailed = reasons.some((r) => /unsafe|safety|supervision|collision/i.test(r))
    || live?.status === "failed" && reasons.some((r) => /PE pack missing/i.test(r));
  return { answersFailed, readingAgeFailed, vocabularyFailed, safetyFailed, details };
}

export function normalizeActivitiesInPackRaw(raw: Record<string, unknown>): {
  activities: Array<{ kind: string; estimatedMinutes: number; title?: string; originalKind?: string }>;
  unknownKinds: string[];
} {
  const activitiesRaw = Array.isArray(raw.activities) ? raw.activities : [];
  const unknownKinds: string[] = [];
  const activities = activitiesRaw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const normalized = normalizeDaytimeActivityKind(item.kind);
      if (!normalized.ok) {
        unknownKinds.push(normalized.originalLabel || "(empty)");
        return null;
      }
      return {
        kind: normalized.kind,
        estimatedMinutes: Math.max(0.5, Number(item.estimatedMinutes) || 1),
        title: asString(item.title) || undefined,
        originalKind: normalized.aliased ? normalized.originalLabel : undefined,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  return { activities, unknownKinds };
}
