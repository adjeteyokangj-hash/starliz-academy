type DuplicateInput = {
  contentJson: string;
  contentType?: string | null;
  metadataJson?: string | null;
  subject?: string | null;
};

type DuplicateIssueType = "exact" | "near" | "same_pattern";

type DuplicateIssue = {
  type: DuplicateIssueType;
  slotIndexes: [number, number];
  similarity?: number;
};

type MathPatternSignal = {
  operation: string | null;
  numbersKey: string;
  answerKey: string;
};

export type SessionSlotDuplicateResult = {
  exactCount: number;
  nearCount: number;
  samePatternCount: number;
  duplicateSlotsCount: number;
  hasExactDuplicates: boolean;
  hasHighSeverityWarning: boolean;
  issues: DuplicateIssue[];
  slotFlags: Record<number, DuplicateIssueType[]>;
};

const PROMPT_KEYS = [
  "question",
  "prompt",
  "word",
  "title",
  "passage",
  "text",
  "sentenceContext",
] as const;

const ANSWER_KEYS = [
  "answer",
  "correctAnswer",
  "expectedAnswer",
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

function parseItems(contentJson: string): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  } catch {
    return [];
  }
}

function slotPrompt(slot: Record<string, unknown>): string {
  for (const key of PROMPT_KEYS) {
    const value = textValue(slot[key]);
    if (value) return value;
  }
  return "";
}

function slotAnswer(slot: Record<string, unknown>): string {
  for (const key of ANSWER_KEYS) {
    const value = textValue(slot[key]);
    if (value) return value;
  }
  return "";
}

function tokenizeForSimilarity(value: string): Set<string> {
  const tokens = normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
  return new Set(tokens);
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (!left.size && !right.size) return 1;
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function extractNumbers(value: string): string[] {
  const matches = value.match(/\d+(?:\.\d+)?/g) ?? [];
  return matches.map((entry) => entry.trim()).filter(Boolean);
}

function operationSignal(value: string): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  if (/[x*]/.test(normalized) || /\btimes\b|\bmultipl(y|ied|ication)\b|\bproduct\b/.test(normalized)) return "multiply";
  if (/÷|\//.test(normalized) || /\bdivide\b|\bdivision\b|\bshared?\b|\beach\b|\bper\b|\brows of\b|\bgroups of\b|\bboxes of\b|\binto rows\b|\binto boxes\b/.test(normalized)) return "divide";
  if (/\+/.test(normalized) || /\bplus\b|\badd\b|\btotal\b|\bsum\b/.test(normalized)) return "add";
  if (/-/.test(normalized) || /\bminus\b|\bsubtract\b|\bleft\b|\bremain\b/.test(normalized)) return "subtract";
  return null;
}

function mathPatternSignal(prompt: string, answer: string): MathPatternSignal {
  const numbers = extractNumbers(prompt).sort((a, b) => Number(a) - Number(b));
  return {
    operation: operationSignal(prompt),
    numbersKey: numbers.join("|"),
    answerKey: normalizeText(answer),
  };
}

function pushFlag(slotFlags: Record<number, DuplicateIssueType[]>, index: number, flag: DuplicateIssueType) {
  const current = slotFlags[index] ?? [];
  if (!current.includes(flag)) {
    slotFlags[index] = [...current, flag];
  }
}

function comparePair(input: {
  leftIndex: number;
  rightIndex: number;
  leftPrompt: string;
  rightPrompt: string;
  leftAnswer: string;
  rightAnswer: string;
  contentType?: string | null;
}): DuplicateIssue[] {
  const issues: DuplicateIssue[] = [];

  const leftNorm = normalizeText(input.leftPrompt);
  const rightNorm = normalizeText(input.rightPrompt);

  if (leftNorm && leftNorm === rightNorm) {
    issues.push({ type: "exact", slotIndexes: [input.leftIndex, input.rightIndex] });
    return issues;
  }

  const similarity = jaccardSimilarity(
    tokenizeForSimilarity(input.leftPrompt),
    tokenizeForSimilarity(input.rightPrompt),
  );

  if (similarity >= 0.3 && leftNorm && rightNorm) {
    issues.push({ type: "near", slotIndexes: [input.leftIndex, input.rightIndex], similarity });
  }

  const contentType = String(input.contentType ?? "").toLowerCase();
  const mathLike = contentType === "math" || /\d/.test(input.leftPrompt) || /\d/.test(input.rightPrompt);
  if (mathLike) {
    const leftSignal = mathPatternSignal(input.leftPrompt, input.leftAnswer);
    const rightSignal = mathPatternSignal(input.rightPrompt, input.rightAnswer);
    const sameNumbers = Boolean(leftSignal.numbersKey) && leftSignal.numbersKey === rightSignal.numbersKey;
    const sameAnswer = Boolean(leftSignal.answerKey) && leftSignal.answerKey === rightSignal.answerKey;
    const sameOperation = Boolean(leftSignal.operation) && leftSignal.operation === rightSignal.operation;

    if (sameNumbers && sameAnswer && sameOperation) {
      issues.push({ type: "same_pattern", slotIndexes: [input.leftIndex, input.rightIndex] });
    }
  }

  return issues;
}

export function analyzeSessionSlotDuplicates(input: DuplicateInput): SessionSlotDuplicateResult {
  const items = parseItems(input.contentJson);
  const slotFlags: Record<number, DuplicateIssueType[]> = {};
  const issues: DuplicateIssue[] = [];

  for (let left = 0; left < items.length; left += 1) {
    const leftPrompt = slotPrompt(items[left]);
    if (!leftPrompt) continue;
    const leftAnswer = slotAnswer(items[left]);

    for (let right = left + 1; right < items.length; right += 1) {
      const rightPrompt = slotPrompt(items[right]);
      if (!rightPrompt) continue;
      const rightAnswer = slotAnswer(items[right]);

      const pairIssues = comparePair({
        leftIndex: left,
        rightIndex: right,
        leftPrompt,
        rightPrompt,
        leftAnswer,
        rightAnswer,
        contentType: input.contentType,
      });

      for (const issue of pairIssues) {
        issues.push(issue);
        pushFlag(slotFlags, issue.slotIndexes[0], issue.type);
        pushFlag(slotFlags, issue.slotIndexes[1], issue.type);
      }
    }
  }

  const exactCount = issues.filter((issue) => issue.type === "exact").length;
  const nearCount = issues.filter((issue) => issue.type === "near").length;
  const samePatternCount = issues.filter((issue) => issue.type === "same_pattern").length;
  const duplicateSlotsCount = Object.keys(slotFlags).length;
  const highSeveritySignal = exactCount > 0 || nearCount + samePatternCount >= 4 || duplicateSlotsCount >= 5;

  return {
    exactCount,
    nearCount,
    samePatternCount,
    duplicateSlotsCount,
    hasExactDuplicates: exactCount > 0,
    hasHighSeverityWarning: highSeveritySignal,
    issues,
    slotFlags,
  };
}

export function primaryDuplicateFlag(flags: DuplicateIssueType[] | undefined): DuplicateIssueType | null {
  if (!flags || !flags.length) return null;
  if (flags.includes("exact")) return "exact";
  if (flags.includes("near")) return "near";
  if (flags.includes("same_pattern")) return "same_pattern";
  return null;
}
