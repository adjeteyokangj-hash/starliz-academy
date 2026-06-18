import { isQuestionSlotFilled } from "@/lib/session-slot-validation";

export type SessionSlotGenerationContext = {
  subject: string;
  keyStage?: string | null;
  yearGroup?: string | null;
  ageGroup?: string | null;
  examBoard?: string | null;
  level: number;
  topic?: string | null;
  skillFocus?: string | null;
  curriculumPathway?: string | null;
  module?: string | null;
  contentType: string;
  avoidPrompts?: string[];
};

export type SessionSlotSummary = {
  totalSlots: number;
  filledSlots: number;
  missingSlots: number;
  filledSlotIndexes: number[];
  emptySlotIndexes: number[];
};

export type MissingSlotRecoveryPass = {
  id: "exact" | "alternative" | "same_level_variants";
  label: string;
  candidateCount: number;
  questionStyles: string[];
};

export type MissingSlotRecoveryPlan = {
  targetSlots: number;
  internalCandidateTarget: number;
  passes: MissingSlotRecoveryPass[];
};

export type MissingSlotRecoveryAttempt = {
  passId: MissingSlotRecoveryPass["id"];
  passLabel: string;
  requestedCandidates: number;
  generatedCandidates: number;
};

export type MissingSlotCandidateSelection = {
  selectedItems: Array<Record<string, unknown>>;
  diagnostics: {
    targetSlots: number;
    candidatesGenerated: number;
    acceptedCandidates: number;
    duplicatesRemoved: number;
    nearDuplicatesRemoved: number;
    samePatternRemoved: number;
    levelMismatchRemoved: number;
    topicMismatchRemoved: number;
    styleDiversity: Record<string, number>;
    exhausted: boolean;
  };
};

const QUESTION_STYLE_ORDER = [
  "direct_calculation",
  "missing_number",
  "inverse_multiplication",
  "word_problem",
  "multi_step",
  "reasoning",
  "error_spotting",
  "choose_factor",
  "complete_equation",
  "table_completion",
  "real_world",
  "challenge",
  "review",
] as const;

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "to", "of", "in", "on", "at", "for", "and", "or", "with", "from", "into", "by", "as", "per", "each", "there", "their", "then", "than", "that", "this", "these", "those", "it", "its",
]);

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9+\-*/÷x\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textValue(value: unknown): string {
  return String(value ?? "").trim();
}

function promptLikeText(item: Record<string, unknown>): string {
  for (const key of ["question", "prompt", "word", "title", "passage", "text", "sentenceContext"] as const) {
    const value = textValue(item[key]);
    if (value) return value;
  }
  return "";
}

function answerLikeText(item: Record<string, unknown>): string {
  for (const key of ["answer", "correctAnswer", "expectedAnswer"] as const) {
    const value = textValue(item[key]);
    if (value) return value;
  }
  return "";
}

function tokenize(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
  );
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (!left.size && !right.size) return 1;
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function operationSignal(value: string): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (/[x*]/.test(normalized) || /\btimes\b|\bmultipl(y|ied|ication)\b|\bproduct\b/.test(normalized)) return "multiply";
  if (/÷|\//.test(normalized) || /\bdivide\b|\bdivision\b|\bshared?\b|\beach\b|\bper\b|\brows of\b|\bgroups of\b|\bboxes of\b/.test(normalized)) return "divide";
  if (/\+/.test(normalized) || /\bplus\b|\badd\b|\btotal\b|\bsum\b/.test(normalized)) return "add";
  if (/-/.test(normalized) || /\bminus\b|\bsubtract\b|\bleft\b|\bremain\b/.test(normalized)) return "subtract";
  return null;
}

function patternSignature(item: Record<string, unknown>): string {
  const prompt = promptLikeText(item);
  const answer = answerLikeText(item);
  const normalizedPrompt = normalizeText(prompt).replace(/\d+(?:\.\d+)?/g, "#");
  const operation = operationSignal(prompt) ?? "none";
  const hasQuestionMark = /\?/.test(prompt) ? "q" : "noq";
  return `${operation}|${hasQuestionMark}|${normalizedPrompt}|${normalizeText(answer)}`;
}

function extractLevel(item: Record<string, unknown>): number | null {
  const candidates = [item.difficulty, item.difficultyLevel, item.level];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

function tokenSetForTopic(input: { topic?: string | null; skillFocus?: string | null }): Set<string> {
  const source = `${input.topic ?? ""} ${input.skillFocus ?? ""}`.trim();
  return tokenize(source);
}

function isTopicAligned(item: Record<string, unknown>, target: Set<string>): boolean {
  if (!target.size) return true;
  const candidateText = `${textValue(item.topic)} ${textValue(item.skillFocus)} ${promptLikeText(item)}`.trim();
  if (!candidateText) return true;
  const overlap = jaccard(tokenize(candidateText), target);
  return overlap >= 0.08;
}

function inferQuestionStyle(item: Record<string, unknown>): string {
  const prompt = normalizeText(promptLikeText(item));
  if (!prompt) return "review";
  if (/\bspot the mistake\b|\berror\b|\bincorrect\b/.test(prompt)) return "error_spotting";
  if (/\btable\b|\bcomplete the table\b|\bpattern\b/.test(prompt)) return "table_completion";
  if (/\bwhy\b|\bjustify\b|\breason\b|\bexplain\b/.test(prompt)) return "reasoning";
  if (/\bwhich\b.*\bcorrect\b|\bchoose\b/.test(prompt)) return "choose_factor";
  if (/\bfind the missing number\b|\?\s*[x*÷\/]|[x*÷\/]\s*\?/.test(prompt)) return "missing_number";
  if (/\brows\b|\bboxes\b|\bclass\b|\bschool\b|\bshare\b|\barranged\b|\bchairs\b|\bapples\b/.test(prompt)) return "word_problem";
  if (/\bthen\b|\bafter\b|\bbefore\b|\bmulti\b|\bstep\b/.test(prompt)) return "multi_step";
  if (/\bchallenge\b|\balways\b|\bsometimes\b|\bnever\b/.test(prompt)) return "challenge";
  if (/\bdivide\b|\binverse\b/.test(prompt)) return "inverse_multiplication";
  if (/\breal world\b|\bcontext\b/.test(prompt)) return "real_world";
  if (/\?/.test(prompt) || /[x*÷\/=]/.test(prompt)) return "direct_calculation";
  return "review";
}

function candidatePoolSize(missingSlots: number): number {
  if (missingSlots <= 1) return 10;
  if (missingSlots <= 2) return 16;
  if (missingSlots <= 3) return 24;
  if (missingSlots <= 5) return 40;
  return Math.max(missingSlots * 8, 40);
}

function resolveQuestionStylesForContentType(contentType: string): {
  exact: string[];
  alternative: string[];
  variants: string[];
} {
  const ct = String(contentType ?? "").toLowerCase();

  if (ct === "spelling" || ct === "phonics") {
    return {
      exact: ["word_recall", "fill_in_the_blank", "dictation", "pattern_match"],
      alternative: ["sentence_context", "word_sort", "odd_one_out", "error_correction"],
      variants: ["apply_rule", "analogy", "choose_correct_spelling", "review"],
    };
  }

  if (ct === "grammar" || ct === "punctuation") {
    return {
      exact: ["sentence_correction", "choose_correct", "fill_in_the_blank", "identify_error"],
      alternative: ["rewrite_sentence", "multiple_choice", "word_order", "error_spotting"],
      variants: ["apply_rule", "reasoning", "challenge", "review"],
    };
  }

  if (ct === "reading" || ct === "vocabulary" || ct === "comprehension") {
    return {
      exact: ["comprehension", "vocabulary_in_context", "true_false", "match_definition"],
      alternative: ["inference", "multiple_choice", "summarise", "sequence"],
      variants: ["author_purpose", "compare_contrast", "reasoning", "review"],
    };
  }

  if (ct === "writing") {
    return {
      exact: ["sentence_construction", "expand_sentence", "rewrite", "word_choice"],
      alternative: ["descriptive", "narrative_prompt", "error_correction", "structure_task"],
      variants: ["apply_technique", "challenge", "reasoning", "review"],
    };
  }

  if (ct === "science") {
    return {
      exact: ["recall", "label_diagram", "multiple_choice", "true_false"],
      alternative: ["explain", "apply_knowledge", "compare", "reasoning"],
      variants: ["error_spotting", "challenge", "extended_answer", "review"],
    };
  }

  if (ct === "languages") {
    return {
      exact: ["vocabulary", "translation", "fill_in_the_blank", "sentence_building"],
      alternative: ["role_play", "grammar_in_context", "listening_style", "multiple_choice"],
      variants: ["writing_task", "error_correction", "challenge", "review"],
    };
  }

  // Default: maths / general
  return {
    exact: ["direct_calculation", "missing_number", "complete_equation", "inverse_multiplication"],
    alternative: ["word_problem", "multi_step", "reasoning", "table_completion", "real_world", "choose_factor"],
    variants: ["error_spotting", "challenge", "review", "mixed"],
  };
}

export function buildMissingSlotRecoveryPlan(input: { missingSlots: number; contentType?: string }): MissingSlotRecoveryPlan {
  const targetSlots = Math.max(1, input.missingSlots);
  const internalCandidateTarget = candidatePoolSize(targetSlots);
  const passOne = Math.max(targetSlots * 2, Math.round(internalCandidateTarget * 0.35));
  const passTwo = Math.max(targetSlots * 2, Math.round(internalCandidateTarget * 0.4));
  const passThree = Math.max(targetSlots, internalCandidateTarget - passOne - passTwo);

  const styles = resolveQuestionStylesForContentType(input.contentType ?? "");

  return {
    targetSlots,
    internalCandidateTarget,
    passes: [
      {
        id: "exact",
        label: "Pass 1: exact-match generation",
        candidateCount: passOne,
        questionStyles: styles.exact,
      },
      {
        id: "alternative",
        label: "Pass 2: alternative structures",
        candidateCount: passTwo,
        questionStyles: styles.alternative,
      },
      {
        id: "same_level_variants",
        label: "Pass 3: same-level complexity variants",
        candidateCount: passThree,
        questionStyles: styles.variants,
      },
    ],
  };
}

export function summarizeSessionSlots(items: Array<Record<string, unknown>>): SessionSlotSummary {
  const filledSlotIndexes: number[] = [];
  const emptySlotIndexes: number[] = [];

  items.forEach((item, index) => {
    if (isQuestionSlotFilled(item)) {
      filledSlotIndexes.push(index);
      return;
    }
    emptySlotIndexes.push(index);
  });

  return {
    totalSlots: items.length,
    filledSlots: filledSlotIndexes.length,
    missingSlots: emptySlotIndexes.length,
    filledSlotIndexes,
    emptySlotIndexes,
  };
}

export function mergeGeneratedIntoEmptySlots(input: {
  existingItems: Array<Record<string, unknown>>;
  generatedItems: Array<Record<string, unknown>>;
}): {
  mergedItems: Array<Record<string, unknown>>;
  replacedCount: number;
  summary: SessionSlotSummary;
} {
  const mergedItems = [...input.existingItems];
  const summary = summarizeSessionSlots(mergedItems);
  let generatedCursor = 0;
  let replacedCount = 0;

  for (const emptyIndex of summary.emptySlotIndexes) {
    while (generatedCursor < input.generatedItems.length) {
      const candidate = input.generatedItems[generatedCursor];
      generatedCursor += 1;
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        continue;
      }
      if (!isQuestionSlotFilled(candidate)) {
        continue;
      }
      mergedItems[emptyIndex] = candidate;
      replacedCount += 1;
      break;
    }
  }

  return {
    mergedItems,
    replacedCount,
    summary: summarizeSessionSlots(mergedItems),
  };
}

export function buildMissingSlotGenerationRequest(input: {
  context: SessionSlotGenerationContext;
  missingSlots: number;
  candidatePoolSize?: number;
  questionStyles?: string[];
  passId?: string;
  passLabel?: string;
}): Record<string, unknown> {
  return {
    subject: input.context.subject,
    keyStage: input.context.keyStage ?? undefined,
    yearGroup: input.context.yearGroup ?? undefined,
    ageGroup: input.context.ageGroup ?? undefined,
    examBoard: input.context.examBoard ?? undefined,
    curriculumPathway: input.context.curriculumPathway ?? undefined,
    module: input.context.module ?? undefined,
    topic: input.context.topic ?? input.context.skillFocus ?? "General",
    skillFocus: input.context.skillFocus ?? input.context.topic ?? "General",
    difficulty: input.context.level,
    level: input.context.level,
    numberOfItems: Math.max(1, Math.min(60, Math.round(input.candidatePoolSize ?? input.missingSlots))),
    activityType: input.context.contentType,
    lessonFormat: input.context.contentType,
    questionStyle: "same_lesson_session_format",
    questionStyles: (input.questionStyles ?? []).slice(0, 12),
    generationPassId: input.passId ?? "single_pass",
    generationPassLabel: input.passLabel ?? "Single pass",
    aiMode: "live_openai_only",
    avoidPrompts: (input.context.avoidPrompts ?? []).slice(0, 12),
  };
}

export function selectBestMissingSlotCandidates(input: {
  existingItems: Array<Record<string, unknown>>;
  generatedItems: Array<Record<string, unknown>>;
  missingSlots: number;
  targetLevel: number;
  topic?: string | null;
  skillFocus?: string | null;
  nearDuplicateThreshold?: number;
}): MissingSlotCandidateSelection {
  const targetSlots = Math.max(1, input.missingSlots);
  const nearThreshold = input.nearDuplicateThreshold ?? 0.78;
  const topicTokens = tokenSetForTopic({ topic: input.topic, skillFocus: input.skillFocus });

  const existingPrompts = input.existingItems
    .filter((item) => isQuestionSlotFilled(item))
    .map((item) => normalizeText(promptLikeText(item)))
    .filter(Boolean);
  const existingPromptTokens = input.existingItems
    .filter((item) => isQuestionSlotFilled(item))
    .map((item) => tokenize(promptLikeText(item)));
  const existingPatterns = new Set(
    input.existingItems
      .filter((item) => isQuestionSlotFilled(item))
      .map((item) => patternSignature(item)),
  );
  const existingStyles = new Set(
    input.existingItems
      .filter((item) => isQuestionSlotFilled(item))
      .map((item) => inferQuestionStyle(item)),
  );

  const candidates = input.generatedItems
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)))
    .filter((entry) => isQuestionSlotFilled(entry));

  const filtered: Array<Record<string, unknown>> = [];
  let duplicatesRemoved = 0;
  let nearDuplicatesRemoved = 0;
  let samePatternRemoved = 0;
  let levelMismatchRemoved = 0;
  let topicMismatchRemoved = 0;

  const selectedPrompts: string[] = [];
  const selectedPromptTokens: Set<string>[] = [];
  const selectedPatterns = new Set<string>();

  for (const candidate of candidates) {
    const level = extractLevel(candidate);
    if (level !== null && level !== input.targetLevel) {
      levelMismatchRemoved += 1;
      continue;
    }

    if (!isTopicAligned(candidate, topicTokens)) {
      topicMismatchRemoved += 1;
      continue;
    }

    const normalizedPrompt = normalizeText(promptLikeText(candidate));
    const promptTokens = tokenize(promptLikeText(candidate));
    const signature = patternSignature(candidate);

    if (normalizedPrompt && (existingPrompts.includes(normalizedPrompt) || selectedPrompts.includes(normalizedPrompt))) {
      duplicatesRemoved += 1;
      continue;
    }

    const nearSimilarityWithExisting = existingPromptTokens.some((tokens) => jaccard(tokens, promptTokens) >= nearThreshold);
    const nearSimilarityWithSelected = selectedPromptTokens.some((tokens) => jaccard(tokens, promptTokens) >= nearThreshold);
    if (nearSimilarityWithExisting || nearSimilarityWithSelected) {
      nearDuplicatesRemoved += 1;
      continue;
    }

    if (existingPatterns.has(signature) || selectedPatterns.has(signature)) {
      samePatternRemoved += 1;
      continue;
    }

    filtered.push(candidate);
    selectedPrompts.push(normalizedPrompt);
    selectedPromptTokens.push(promptTokens);
    selectedPatterns.add(signature);
  }

  // If strict tuple/topic-level filtering is too aggressive, allow a relaxed pass
  // so we can still recover empty slots with valid, non-duplicate items.
  if (filtered.length < targetSlots && candidates.length > 0) {
    for (const candidate of candidates) {
      if (filtered.includes(candidate)) continue;

      const normalizedPrompt = normalizeText(promptLikeText(candidate));
      const promptTokens = tokenize(promptLikeText(candidate));
      const signature = patternSignature(candidate);

      if (normalizedPrompt && (existingPrompts.includes(normalizedPrompt) || selectedPrompts.includes(normalizedPrompt))) {
        continue;
      }

      const nearSimilarityWithExisting = existingPromptTokens.some((tokens) => jaccard(tokens, promptTokens) >= 0.92);
      const nearSimilarityWithSelected = selectedPromptTokens.some((tokens) => jaccard(tokens, promptTokens) >= 0.92);
      if (nearSimilarityWithExisting || nearSimilarityWithSelected) {
        continue;
      }

      if (existingPatterns.has(signature) || selectedPatterns.has(signature)) {
        continue;
      }

      filtered.push(candidate);
      selectedPrompts.push(normalizedPrompt);
      selectedPromptTokens.push(promptTokens);
      selectedPatterns.add(signature);

      if (filtered.length >= targetSlots * 2) {
        break;
      }
    }
  }

  const selectedItems: Array<Record<string, unknown>> = [];
  const styleDiversity: Record<string, number> = {};
  const pool = [...filtered];

  while (selectedItems.length < targetSlots && pool.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[index];
      const style = inferQuestionStyle(candidate);
      const styleCount = styleDiversity[style] ?? 0;
      const styleOrder = QUESTION_STYLE_ORDER.indexOf(style as typeof QUESTION_STYLE_ORDER[number]);
      const styleNovelty = styleCount === 0 ? 3 : styleCount === 1 ? 1 : 0;
      const notInExisting = existingStyles.has(style) ? 0 : 1;
      const tieBreaker = styleOrder >= 0 ? (QUESTION_STYLE_ORDER.length - styleOrder) / 100 : 0;
      const score = styleNovelty + notInExisting + tieBreaker;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    const [chosen] = pool.splice(bestIndex, 1);
    if (!chosen) break;
    const style = inferQuestionStyle(chosen);
    styleDiversity[style] = (styleDiversity[style] ?? 0) + 1;
    selectedItems.push(chosen);
  }

  return {
    selectedItems,
    diagnostics: {
      targetSlots,
      candidatesGenerated: candidates.length,
      acceptedCandidates: selectedItems.length,
      duplicatesRemoved,
      nearDuplicatesRemoved,
      samePatternRemoved,
      levelMismatchRemoved,
      topicMismatchRemoved,
      styleDiversity,
      exhausted: selectedItems.length < targetSlots,
    },
  };
}

export function formatMissingSlotRecoveryDiagnostics(input: {
  attempts: MissingSlotRecoveryAttempt[];
  selection: MissingSlotCandidateSelection["diagnostics"];
  mergedSummary: SessionSlotSummary;
}): string {
  const lines = [
    "Missing Slot Recovery",
    `Target Slots: ${input.selection.targetSlots}`,
  ];

  for (const attempt of input.attempts) {
    lines.push(`${attempt.passLabel}: requested ${attempt.requestedCandidates}, generated ${attempt.generatedCandidates}`);
  }

  lines.push(`Candidates generated: ${input.selection.candidatesGenerated}`);
  lines.push(`Duplicates removed: ${input.selection.duplicatesRemoved}`);
  lines.push(`Near duplicates removed: ${input.selection.nearDuplicatesRemoved}`);
  lines.push(`Same-pattern removed: ${input.selection.samePatternRemoved}`);
  lines.push(`Level mismatch removed: ${input.selection.levelMismatchRemoved}`);
  lines.push(`Topic mismatch removed: ${input.selection.topicMismatchRemoved}`);
  lines.push(`Final candidates: ${input.selection.acceptedCandidates}`);
  lines.push(`Final slots filled: ${input.mergedSummary.filledSlots}/${input.mergedSummary.totalSlots}`);

  if (input.selection.exhausted) {
    lines.push("Generation exhausted.");
    lines.push("Suggestions: Generate More Variants | Relax Duplicate Threshold | Choose Question Type");
  }

  return lines.join("\n");
}
