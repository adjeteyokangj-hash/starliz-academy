export type QuestionSourceStatus = "current draft" | "published" | "archived" | "previous content";

export type QuestionDuplicateType =
  | "exact duplicate"
  | "near duplicate"
  | "same answer + very similar prompt"
  | "same prompt + different choices";

export type QuestionDuplicateMatch = {
  currentSlotId: string;
  currentContentId: string | null;
  matchedContentId: string;
  matchedQuestionId: string;
  matchedSlotIndex: number;
  similarity: number;
  duplicateType: QuestionDuplicateType;
  sourceStatus: QuestionSourceStatus;
};

export type QuestionDuplicateEntry = {
  contentId: string;
  contentStatus?: string | null;
  contentSubject?: string | null;
  contentYearGroup?: string | null;
  contentKeyStage?: string | null;
  slotId: string;
  slotIndex: number;
  prompt: string;
  answer: string;
  choices: string[];
};

export type QuestionDuplicateSummary = {
  duplicateCount: number;
  exactCount: number;
  nearCount: number;
  sameAnswerCount: number;
  samePromptDifferentChoicesCount: number;
  hasDuplicates: boolean;
  matches: QuestionDuplicateMatch[];
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "and",
  "or",
  "with",
  "from",
  "into",
  "by",
  "as",
  "per",
  "each",
  "there",
  "their",
  "then",
  "than",
  "that",
  "this",
  "these",
  "those",
  "it",
  "its",
  "how",
  "many",
  "much",
]);

const NUMBER_WORDS = new Map<string, string>([
  ["zero", "0"],
  ["one", "1"],
  ["two", "2"],
  ["three", "3"],
  ["four", "4"],
  ["five", "5"],
  ["six", "6"],
  ["seven", "7"],
  ["eight", "8"],
  ["nine", "9"],
  ["ten", "10"],
  ["eleven", "11"],
  ["twelve", "12"],
  ["thirteen", "13"],
  ["fourteen", "14"],
  ["fifteen", "15"],
  ["sixteen", "16"],
  ["seventeen", "17"],
  ["eighteen", "18"],
  ["nineteen", "19"],
  ["twenty", "20"],
  ["first", "1"],
  ["second", "2"],
  ["third", "3"],
  ["fourth", "4"],
  ["fifth", "5"],
  ["sixth", "6"],
  ["seventh", "7"],
  ["eighth", "8"],
  ["ninth", "9"],
  ["tenth", "10"],
]);

function textValue(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeQuestionText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    // Normalise number words to their digit equivalents BEFORE cleaning punctuation
    .replace(/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/g, (match) => NUMBER_WORDS.get(match) ?? match)
    .replace(/[^a-z0-9+\-*/÷x\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeQuestionText(value: unknown): Set<string> {
  const tokens = normalizeQuestionText(value)
    .split(" ")
    .map((token) => token.trim())
    // Allow single-character tokens that are digits or maths operators
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token) && (token.length > 1 || /^[0-9+\-*/÷x]$/.test(token)));
  return new Set(tokens);
}

export function questionSimilarity(left: unknown, right: unknown): number {
  const leftTokens = tokenizeQuestionText(left);
  const rightTokens = tokenizeQuestionText(right);
  if (!leftTokens.size && !rightTokens.size) return 1;
  if (!leftTokens.size || !rightTokens.size) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }

  const union = leftTokens.size + rightTokens.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export function questionFingerprint(input: {
  prompt?: unknown;
  answer?: unknown;
  choices?: unknown;
}): string {
  const prompt = normalizeQuestionText(input.prompt);
  const answer = normalizeQuestionText(input.answer);
  const rawChoices = Array.isArray(input.choices)
    ? input.choices
    : Array.isArray((input.choices as { choices?: unknown })?.choices)
      ? ((input.choices as { choices?: unknown }).choices as unknown[])
      : [];
  const choices = rawChoices
    .map((choice) => normalizeQuestionText(choice))
    .filter(Boolean)
    .sort()
    .join("|");
  return [prompt, answer, choices].filter(Boolean).join("||");
}

function sourceStatusFor(recordStatus: string | null | undefined, isCurrentContent: boolean): QuestionSourceStatus {
  if (isCurrentContent) return "current draft";
  const normalized = String(recordStatus ?? "").trim().toLowerCase();
  if (normalized === "published") return "published";
  if (normalized === "archived") return "archived";
  return "previous content";
}

function normalizeScopeText(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function scopesAreCompatible(current: QuestionDuplicateEntry, matched: QuestionDuplicateEntry): boolean {
  const currentSubject = normalizeScopeText(current.contentSubject);
  const matchedSubject = normalizeScopeText(matched.contentSubject);
  if (currentSubject && matchedSubject && currentSubject !== matchedSubject) {
    return false;
  }

  const currentYearGroup = normalizeScopeText(current.contentYearGroup);
  const matchedYearGroup = normalizeScopeText(matched.contentYearGroup);
  if (currentYearGroup && matchedYearGroup && currentYearGroup !== matchedYearGroup) {
    return false;
  }

  // If year group is missing, key stage still narrows duplicate matching to a learner cohort.
  if (!currentYearGroup || !matchedYearGroup) {
    const currentKeyStage = normalizeScopeText(current.contentKeyStage);
    const matchedKeyStage = normalizeScopeText(matched.contentKeyStage);
    if (currentKeyStage && matchedKeyStage && currentKeyStage !== matchedKeyStage) {
      return false;
    }
  }

  return true;
}

function extractQuestionText(row: Record<string, unknown>): string {
  for (const key of ["question", "prompt", "word", "title", "passage", "text", "sentenceContext"] as const) {
    const value = textValue(row[key]);
    if (value) return value;
  }
  return "";
}

function extractAnswerText(row: Record<string, unknown>): string {
  for (const key of ["answer", "correctAnswer", "expectedAnswer"] as const) {
    const value = textValue(row[key]);
    if (value) return value;
  }
  return "";
}

function extractChoices(row: Record<string, unknown>): string[] {
  const candidate = row.choices ?? row.options ?? row.answerOptions;
  if (!Array.isArray(candidate)) return [];
  return candidate.map((entry) => textValue(entry)).filter(Boolean);
}

function extractRows(contentJson: string): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  } catch {
    return [];
  }
}

function compareQuestionEntries(input: {
  current: QuestionDuplicateEntry;
  matched: QuestionDuplicateEntry;
  currentContentId: string | null;
  sourceStatus: QuestionSourceStatus;
}): QuestionDuplicateMatch | null {
  const currentPrompt = input.current.prompt;
  const matchedPrompt = input.matched.prompt;
  const currentAnswer = normalizeQuestionText(input.current.answer);
  const matchedAnswer = normalizeQuestionText(input.matched.answer);
  const currentChoices = input.current.choices.map((choice) => normalizeQuestionText(choice)).filter(Boolean).sort();
  const matchedChoices = input.matched.choices.map((choice) => normalizeQuestionText(choice)).filter(Boolean).sort();
  const promptSimilarity = questionSimilarity(currentPrompt, matchedPrompt);
  const promptFingerprint = normalizeQuestionText(currentPrompt);
  const matchedPromptFingerprint = normalizeQuestionText(matchedPrompt);
  const choicesDifferent = currentChoices.join("|") !== matchedChoices.join("|");
  const answersSame = Boolean(currentAnswer) && currentAnswer === matchedAnswer;
  const promptsSame = Boolean(promptFingerprint) && promptFingerprint === matchedPromptFingerprint;

  if (!promptFingerprint || !matchedPromptFingerprint) return null;

  if (promptsSame && answersSame && !choicesDifferent) {
    return {
      currentSlotId: input.current.slotId,
      currentContentId: input.currentContentId,
      matchedContentId: input.matched.contentId,
      matchedQuestionId: input.matched.slotId,
      matchedSlotIndex: input.matched.slotIndex,
      similarity: 1,
      duplicateType: "exact duplicate",
      sourceStatus: input.sourceStatus,
    };
  }

  if (promptsSame && choicesDifferent) {
    return {
      currentSlotId: input.current.slotId,
      currentContentId: input.currentContentId,
      matchedContentId: input.matched.contentId,
      matchedQuestionId: input.matched.slotId,
      matchedSlotIndex: input.matched.slotIndex,
      similarity: 1,
      duplicateType: "same prompt + different choices",
      sourceStatus: input.sourceStatus,
    };
  }

  if (answersSame && promptSimilarity >= 0.45) {
    return {
      currentSlotId: input.current.slotId,
      currentContentId: input.currentContentId,
      matchedContentId: input.matched.contentId,
      matchedQuestionId: input.matched.slotId,
      matchedSlotIndex: input.matched.slotIndex,
      similarity: promptSimilarity,
      duplicateType: "same answer + very similar prompt",
      sourceStatus: input.sourceStatus,
    };
  }

  if (promptSimilarity >= 0.52) {
    return {
      currentSlotId: input.current.slotId,
      currentContentId: input.currentContentId,
      matchedContentId: input.matched.contentId,
      matchedQuestionId: input.matched.slotId,
      matchedSlotIndex: input.matched.slotIndex,
      similarity: promptSimilarity,
      duplicateType: "near duplicate",
      sourceStatus: input.sourceStatus,
    };
  }

  return null;
}

export function buildQuestionCorpusEntries(input: {
  contentId: string;
  contentStatus?: string | null;
  contentSubject?: string | null;
  contentYearGroup?: string | null;
  contentKeyStage?: string | null;
  contentJson: string;
}): QuestionDuplicateEntry[] {
  return extractRows(input.contentJson).map((row, index) => ({
    contentId: input.contentId,
    contentStatus: input.contentStatus ?? null,
    contentSubject: input.contentSubject ?? null,
    contentYearGroup: input.contentYearGroup ?? null,
    contentKeyStage: input.contentKeyStage ?? null,
    slotId: textValue(row.id) || `${input.contentId}:slot-${index}`,
    slotIndex: index,
    prompt: extractQuestionText(row),
    answer: extractAnswerText(row),
    choices: extractChoices(row),
  }));
}

export function analyzeQuestionDuplicateMatches(input: {
  currentContentId: string;
  currentContentStatus?: string | null;
  currentEntries: QuestionDuplicateEntry[];
  historicalEntries: QuestionDuplicateEntry[];
}): QuestionDuplicateSummary {
  const matches: QuestionDuplicateMatch[] = [];
  const seenPairs = new Set<string>();

  const compareAgainst = (current: QuestionDuplicateEntry, matched: QuestionDuplicateEntry, sourceStatus: QuestionSourceStatus) => {
    if (!current.prompt || !matched.prompt) return;
    if (!scopesAreCompatible(current, matched)) return;
    const pairKey = [current.contentId, current.slotId, matched.contentId, matched.slotId, sourceStatus].join("|");
    if (seenPairs.has(pairKey)) return;
    seenPairs.add(pairKey);

    const comparison = compareQuestionEntries({
      current,
      matched,
      currentContentId: input.currentContentId,
      sourceStatus,
    });
    if (comparison) {
      matches.push(comparison);
    }
  };

  // Only compare current entries against HISTORICAL entries.
  // Intra-session duplicate detection is handled by analyzeSessionSlotDuplicates.
  for (const current of input.currentEntries) {
    for (const matched of input.historicalEntries) {
      const status = sourceStatusFor(matched.contentStatus, false);
      compareAgainst(current, matched, status);
    }
  }

  const exactCount = matches.filter((match) => match.duplicateType === "exact duplicate").length;
  const nearCount = matches.filter((match) => match.duplicateType === "near duplicate").length;
  const sameAnswerCount = matches.filter((match) => match.duplicateType === "same answer + very similar prompt").length;
  const samePromptDifferentChoicesCount = matches.filter((match) => match.duplicateType === "same prompt + different choices").length;

  return {
    duplicateCount: matches.length,
    exactCount,
    nearCount,
    sameAnswerCount,
    samePromptDifferentChoicesCount,
    hasDuplicates: matches.length > 0,
    matches,
  };
}

export function summarizeQuestionDuplicatesForContent(input: {
  contentId: string;
  contentStatus?: string | null;
  contentSubject?: string | null;
  contentYearGroup?: string | null;
  contentKeyStage?: string | null;
  contentJson: string;
  historicalRecords: Array<{
    contentId: string;
    contentStatus?: string | null;
    contentSubject?: string | null;
    contentYearGroup?: string | null;
    contentKeyStage?: string | null;
    contentJson: string;
  }>;
}): QuestionDuplicateSummary {
  const currentEntries = buildQuestionCorpusEntries({
    contentId: input.contentId,
    contentStatus: input.contentStatus,
    contentSubject: input.contentSubject,
    contentYearGroup: input.contentYearGroup,
    contentKeyStage: input.contentKeyStage,
    contentJson: input.contentJson,
  });
  const historicalEntries = input.historicalRecords.flatMap((record) =>
    buildQuestionCorpusEntries({
      contentId: record.contentId,
      contentStatus: record.contentStatus,
      contentSubject: record.contentSubject,
      contentYearGroup: record.contentYearGroup,
      contentKeyStage: record.contentKeyStage,
      contentJson: record.contentJson,
    }),
  );

  return analyzeQuestionDuplicateMatches({
    currentContentId: input.contentId,
    currentContentStatus: input.contentStatus,
    currentEntries,
    historicalEntries,
  });
}

export function normalizeQuestionChoices(choices: unknown): string[] {
  if (!Array.isArray(choices)) return [];
  return choices.map((entry) => textValue(entry)).filter(Boolean);
}
