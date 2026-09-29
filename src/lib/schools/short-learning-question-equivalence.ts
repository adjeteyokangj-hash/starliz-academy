import { normalizeQuestionText, questionFingerprint } from "@/lib/question-duplicate-detection";

/**
 * Educational equivalence for Short Learning question rotation.
 *
 * Exact fingerprints miss wording tricks. This module treats a question as
 * the same fact when only the frame, operand order, or a cosmetic suffix
 * changed. Different numbers on the same skill stay different problems.
 */

export type QuestionRepetitionPurpose = "ordinary" | "retry" | "mastery" | "retrieval" | "support";

export type QuestionEquivalence = "exact" | "near";

export type ComparableQuestion = {
  prompt: string;
  answer?: string | number | null;
  fingerprint?: string | null;
};

const COSMETIC_PADDING = /\s*[([]?\s*check the subject carefully\.?\s*[)\]]?\s*$/i;

const PURPOSE_BY_LABEL: Record<string, QuestionRepetitionPurpose> = {
  retry: "retry",
  "intentional-retry": "retry",
  intentional_retry: "retry",
  hint: "retry",
  mastery: "mastery",
  "mastery-check": "mastery",
  mastery_check: "mastery",
  "mastery check": "mastery",
  retrieval: "retrieval",
  "retrieval-practice": "retrieval",
  retrieval_practice: "retrieval",
  "retrieval practice": "retrieval",
  support: "support",
  misconception: "support",
};

const CONTENT_STOP_WORDS = new Set([
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
  "what",
  "which",
  "who",
  "where",
  "when",
  "why",
  "how",
  "do",
  "does",
  "did",
  "name",
  "called",
  "mean",
  "means",
  "there",
  "this",
  "that",
  "it",
  "be",
]);

export function stripCosmeticQuestionPadding(prompt: string): string {
  let text = String(prompt ?? "");
  let previous = "";
  while (text !== previous) {
    previous = text;
    text = text.replace(COSMETIC_PADDING, "").trim();
  }
  return text.replace(/\s+/g, " ").trim();
}

export function repetitionPurposeOf(raw: Record<string, unknown> | null | undefined): QuestionRepetitionPurpose {
  if (!raw) return "ordinary";
  const labels = [raw.repetitionPurpose, raw.selectionPurpose, raw.pedagogicalPurpose, raw.purpose, raw.kind];
  for (const label of labels) {
    const key = String(label ?? "").trim().toLowerCase();
    const purpose = PURPOSE_BY_LABEL[key];
    if (purpose) return purpose;
  }
  if (raw.masteryCheck === true) return "mastery";
  if (raw.retrievalPractice === true) return "retrieval";
  if (raw.intentionalRetry === true) return "retry";
  return "ordinary";
}

export function isIntentionalRepetitionQuestion(raw: Record<string, unknown> | null | undefined): boolean {
  return repetitionPurposeOf(raw) !== "ordinary";
}

/** Recap and review blocks are retrieval. Lesson blocks stay ordinary unless a question is marked. */
export function repetitionPurposeForBlock(input: {
  title?: string | null;
  blockType?: string | null;
}): QuestionRepetitionPurpose | null {
  const type = String(input.blockType ?? "").trim().toLowerCase();
  if (type === "recap" || type === "review") return "retrieval";
  const label = String(input.title ?? "").toLowerCase();
  if (label.includes("recap")) return "retrieval";
  if (label.includes("final review") || label.includes("final-review") || /\breview\b/.test(label)) return "retrieval";
  if (/\bmastery\b/.test(label)) return "mastery";
  if (/\bretry\b/.test(label)) return "retry";
  return null;
}

function answersCompatible(left: string, right: string): boolean {
  if (!left || !right) return true;
  return left === right;
}

function canonicalPrompt(prompt: string): string {
  let text = stripCosmeticQuestionPadding(prompt).toLowerCase();
  text = text
    .replace(/×/g, "x")
    .replace(/÷/g, "/")
    .replace(/\bmultiplied by\b/g, "x")
    .replace(/\btimes\b/g, "x")
    .replace(/\bplus\b/g, "+")
    .replace(/\badded to\b/g, "+");
  text = text.replace(/^(what|which)\s+(city|town|place|country|person)\s+(is|are|was|were)\b/, "what is");
  text = text.replace(/^(name|identify|state)\s+the\b/, "what is the");
  text = text.replace(/^(which|what)\s+(is|are|was|were)\b/, "what is");
  return normalizeQuestionText(text);
}

function numberMultiset(prompt: string): string {
  return (prompt.match(/\d+(?:\.\d+)?/g) ?? []).sort().join(",");
}

function singleArithmeticKey(prompt: string): string | null {
  const text = canonicalPrompt(prompt);
  const matches = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*([x*+])\s*(\d+(?:\.\d+)?)/g));
  if (matches.length !== 1) return null;
  const match = matches[0]!;
  const operator = match[2] === "+" ? "+" : "x";
  const left = Number(match[1]);
  const right = Number(match[3]);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  const [low, high] = left <= right ? [left, right] : [right, left];
  return `${operator}:${low}:${high}`;
}

function contentTokenKey(prompt: string): string | null {
  const tokens = canonicalPrompt(prompt)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !CONTENT_STOP_WORDS.has(token) && !/^\d+(?:\.\d+)?$/.test(token));
  if (tokens.length < 2) return null;
  return Array.from(new Set(tokens)).sort().join(" ");
}

export function partsFromQuestionFingerprint(fingerprint: string): { prompt: string; answer: string } {
  const parts = String(fingerprint ?? "").split("||");
  return { prompt: parts[0] ?? "", answer: parts[1] ?? "" };
}

export function compareQuestionEquivalence(left: ComparableQuestion, right: ComparableQuestion): QuestionEquivalence | null {
  const leftPrompt = String(left.prompt ?? "").trim();
  const rightPrompt = String(right.prompt ?? "").trim();
  if (!leftPrompt || !rightPrompt) return null;

  const leftAnswer = normalizeQuestionText(left.answer);
  const rightAnswer = normalizeQuestionText(right.answer);
  if (!answersCompatible(leftAnswer, rightAnswer)) return null;

  const leftFingerprint = left.fingerprint || questionFingerprint({ prompt: leftPrompt, answer: left.answer, choices: [] });
  const rightFingerprint = right.fingerprint || questionFingerprint({ prompt: rightPrompt, answer: right.answer, choices: [] });
  if (left.fingerprint && right.fingerprint && left.fingerprint === right.fingerprint) return "exact";

  const leftCanonical = canonicalPrompt(leftPrompt);
  const rightCanonical = canonicalPrompt(rightPrompt);
  if (leftCanonical && leftCanonical === rightCanonical) {
    const leftBare = normalizeQuestionText(leftPrompt);
    const rightBare = normalizeQuestionText(rightPrompt);
    return leftBare === rightBare ? "exact" : "near";
  }

  const leftArithmetic = singleArithmeticKey(leftPrompt);
  const rightArithmetic = singleArithmeticKey(rightPrompt);
  if (leftArithmetic && rightArithmetic) {
    return leftArithmetic === rightArithmetic ? "near" : null;
  }

  if (numberMultiset(leftCanonical) !== numberMultiset(rightCanonical)) return null;

  const leftTokens = contentTokenKey(leftPrompt);
  const rightTokens = contentTokenKey(rightPrompt);
  if (leftTokens && rightTokens && leftTokens === rightTokens) return "near";
  return null;
}

export function questionsAreEducationallyEquivalent(left: ComparableQuestion, right: ComparableQuestion): boolean {
  return compareQuestionEquivalence(left, right) != null;
}
