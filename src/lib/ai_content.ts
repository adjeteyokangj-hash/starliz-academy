import type { MathQuestion, ReadingPassage, SpellingWord } from "@/lib/adaptive";

type NextContentResponse = {
  item: Record<string, unknown> | null;
  source: "ai-cache" | "static";
};

type AssignedContentResponse = {
  assignment: {
    id: string;
    status: string;
    studentId: string;
    contentId: string;
    subject: string;
    difficulty: number;
    topic: string;
  };
  content: {
    id: string;
    contentType: string;
    level: number;
    topic: string;
    skillFocus?: string | null;
    yearGroup?: string | null;
    keyStage?: string | null;
    metadata?: Record<string, unknown>;
    items: unknown[];
  };
};

type AssignedKind = "spelling" | "math" | "reading";

export type AssignedContentBatch<T> = {
  assignment: AssignedContentResponse["assignment"];
  content: AssignedContentResponse["content"];
  items: T[];
};

const assignedCursorMemory = new Map<string, number>();

async function fetchNext(type: "spelling" | "math", level: number, excludeIds: string[]): Promise<NextContentResponse> {
  const params = new URLSearchParams({
    type,
    level: String(level),
    exclude: JSON.stringify(excludeIds.slice(-10)),
  });

  const res = await fetch(`/api/content/next?${params.toString()}`);
  if (!res.ok) {
    return { item: null, source: "static" };
  }
  const data = (await res.json()) as NextContentResponse;
  return data;
}

function normalizeSpelling(item: Record<string, unknown> | null): SpellingWord | null {
  if (!item) return null;
  const word = String(item.word ?? "").trim();
  if (!word) return null;
  const level = Number(item.level ?? 1);
  const safeLevel = Math.max(1, Math.min(5, Number.isFinite(level) ? level : 1)) as 1 | 2 | 3 | 4 | 5;
  const imageUrl = typeof item.imageUrl === "string" && item.imageUrl.trim().length ? item.imageUrl.trim() : undefined;
  const rawPromptType = String(item.promptType ?? (imageUrl ? "image" : "voice")).toLowerCase();
  const promptType: "voice" | "text" | "image" = rawPromptType === "image"
    ? (imageUrl ? "image" : "voice")
    : rawPromptType === "text"
      ? "text"
      : "voice";
  const patterns = Array.isArray(item.patterns)
    ? item.patterns.map((v) => String(v)).filter(Boolean)
    : [];

  return {
    id: String(item.id ?? `ai-spelling-${word.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`),
    word,
    level: safeLevel,
    promptType,
    imageUrl,
    hint: String(item.hint ?? "Think about the sounds in the word."),
    categoryHint: String(item.categoryHint ?? "word practice"),
    syllables: String(item.syllables ?? "1"),
    sentenceContext: String(item.sentenceContext ?? `Can you spell ${word}?`),
    emoji: String(item.emoji ?? "✨"),
    patterns,
  };
}

function normalizeMath(item: Record<string, unknown> | null): MathQuestion | null {
  if (!item) return null;
  const prompt = String(item.prompt ?? item.question ?? "").trim();
  const answer = Number(item.answer);
  if (!prompt || Number.isNaN(answer)) return null;

  const roundChoice = (value: number): number => {
    if (!Number.isFinite(value)) return value;
    return Math.round(value * 100) / 100;
  };

  const parseLinearEquation = (text: string): { a: number; b: number; c: number } | null => {
    const compact = text.replace(/[−–—]/g, "-").replace(/\s+/g, " ");
    const expression = compact.match(/(\d*\s*x\s*[+\-]\s*\d+\s*=\s*-?\d+)/i)?.[1] ?? compact;
    const match = expression.match(/^(\d+)?\s*x\s*([+\-])\s*(\d+)\s*=\s*(-?\d+)$/i);
    if (!match) return null;
    const a = Number(match[1] ?? "1");
    const bRaw = Number(match[3]);
    const c = Number(match[4]);
    const b = match[2] === "-" ? -bRaw : bRaw;
    if (![a, b, c].every(Number.isFinite) || a === 0) return null;
    return { a, b, c };
  };

  const buildFallbackChoices = (correct: number): number[] => {
    const candidates = [
      correct - 1,
      correct + 1,
      correct - 2,
      correct + 2,
      correct * 2,
      correct / 2,
      -correct,
    ].map(roundChoice);
    const unique = Array.from(new Set([roundChoice(correct), ...candidates].filter((v) => Number.isFinite(v))));
    return unique.slice(0, 4);
  };

  const linear = parseLinearEquation(prompt);
  const isAlgebraPrompt = Boolean(linear) || /solve\s+for\s+x|\bx\b\s*=|linear\s+equation/i.test(prompt);

  const buildAlgebraChoices = (correct: number): number[] => {
    const { a, b, c } = linear ?? { a: 1, b: 0, c: correct };
    const distractors = [
      c / a,
      c - b,
      (c + b) / a,
      correct - 1,
      correct + 1,
      correct + b,
      correct - b,
    ].map(roundChoice);
    const merged = Array.from(new Set([roundChoice(correct), ...distractors].filter((v) => Number.isFinite(v) && v !== roundChoice(correct))));
    return [roundChoice(correct), ...merged].slice(0, 4);
  };

  const hints = Array.isArray(item.hints)
    ? item.hints.map((v) => String(v)).filter(Boolean)
    : [String(item.hint ?? "Try splitting the problem into steps.")];

  const sourceChoices = Array.isArray(item.choices)
    ? item.choices.map((v) => Number(v)).filter((v) => Number.isFinite(v))
    : undefined;
  const answerOptions = Array.isArray(item.answerOptions)
    ? item.answerOptions.map((v) => Number(v)).filter((v) => Number.isFinite(v))
    : undefined;
  const choiceMode = String(item.questionType ?? item.format ?? "").toLowerCase();
  const expectsChoices = Boolean(
    (sourceChoices?.length ?? 0) > 0
    || (answerOptions?.length ?? 0) > 0
    || item.multipleChoice === true
    || choiceMode.includes("multiple")
    || choiceMode.includes("choice"),
  );

  const choices = (() => {
    if (!expectsChoices) {
      return undefined;
    }
    const provided = [...(sourceChoices ?? []), ...(answerOptions ?? [])].map(roundChoice);
    if (isAlgebraPrompt) {
      const algebraChoices = buildAlgebraChoices(answer);
      if (provided.length) {
        return Array.from(new Set([...provided, ...algebraChoices, roundChoice(answer)])).slice(0, 4);
      }
      return algebraChoices;
    }
    if (provided.length) {
      const merged = Array.from(new Set([...provided, roundChoice(answer)]));
      return merged.slice(0, 4);
    }
    return buildFallbackChoices(answer);
  })();

  const rawTopic = String(item.topic ?? item.type ?? "mixed").trim();
  const topic = isAlgebraPrompt
    ? (rawTopic && rawTopic !== "mixed" ? rawTopic : "Algebra: Solving linear equations")
    : (rawTopic || "mixed");

  return {
    id: String(item.id ?? `ai-math-${Math.abs(answer)}-${prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`),
    prompt,
    answer,
    topic,
    hints: hints.length ? hints : ["Try splitting the problem into steps."],
    choices,
    visual: typeof item.visual === "string" ? item.visual : undefined,
  };
}

function normalizeReading(item: Record<string, unknown> | null): ReadingPassage | null {
  if (!item) return null;
  const passage = String(item.passage ?? item.text ?? "").trim();
  const question = String(item.question ?? item.prompt ?? "").trim();
  const answer = String(item.answer ?? "").trim();
  if (!passage || !question || !answer) return null;

  const choices = Array.isArray(item.choices)
    ? item.choices.map((v) => String(v)).filter(Boolean)
    : [];
  const normalizedChoices = choices.length ? Array.from(new Set([...choices, answer])) : [answer];

  return {
    id: String(item.id ?? `ai-reading-${question.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 28)}`),
    passage,
    question,
    choices: normalizedChoices,
    answer,
  };
}

async function fetchAssigned(contentId: string, assignmentId?: string): Promise<AssignedContentResponse | null> {
  const params = new URLSearchParams();
  if (contentId) params.set("contentId", contentId);
  if (assignmentId) params.set("assignmentId", assignmentId);
  const url = !contentId && assignmentId
    ? `/api/student/assignments?id=${encodeURIComponent(assignmentId)}`
    : `/api/content/assigned?${params.toString()}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return null;
  return (await res.json()) as AssignedContentResponse;
}

function parseAssignedItems<T>(
  payload: AssignedContentResponse | null,
  expectedType: AssignedKind,
  normalizer: (item: Record<string, unknown> | null) => T | null,
): AssignedContentBatch<T> | null {
  if (!payload || payload.content.contentType !== expectedType) return null;

  const items: T[] = [];
  for (const raw of payload.content.items) {
    const normalized = normalizer((raw as Record<string, unknown>) ?? null);
    if (normalized) items.push(normalized);
  }

  if (!items.length) return null;

  return {
    assignment: payload.assignment,
    content: payload.content,
    items,
  };
}

function getCursorStorageKey(kind: AssignedKind, contentId: string, assignmentId?: string): string {
  const scope = assignmentId ?? contentId;
  return `starliz:assigned-cursor:${kind}:${scope}`;
}

function readCursor(key: string): number {
  if (typeof window !== "undefined") {
    const raw = window.sessionStorage.getItem(key);
    const parsed = Number(raw ?? "0");
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }
  return assignedCursorMemory.get(key) ?? 0;
}

function writeCursor(key: string, value: number): void {
  const safeValue = Math.max(0, value);
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(key, String(safeValue));
    return;
  }
  assignedCursorMemory.set(key, safeValue);
}

function takeNextAssignedItem<T>(items: T[], kind: AssignedKind, contentId: string, assignmentId?: string): T | null {
  if (!items.length) return null;
  const key = getCursorStorageKey(kind, contentId, assignmentId);
  const cursor = readCursor(key);
  if (cursor >= items.length) return null;
  const next = items[cursor] ?? null;
  if (next) writeCursor(key, cursor + 1);
  return next;
}

export function resetAssignedContentCursor(kind: AssignedKind, contentId?: string | null, assignmentId?: string): void {
  const scopeId = contentId ?? assignmentId;
  if (!scopeId) return;
  const key = getCursorStorageKey(kind, scopeId, assignmentId);
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(key);
    return;
  }
  assignedCursorMemory.delete(key);
}

export async function fetchAiSpellingWord(level: number, excludeIds: string[]): Promise<SpellingWord | null> {
  try {
    const data = await fetchNext("spelling", level, excludeIds);
    return normalizeSpelling(data.item);
  } catch {
    return null;
  }
}

export async function fetchAiMathQuestion(level: number, excludeIds: string[]): Promise<MathQuestion | null> {
  try {
    const data = await fetchNext("math", level, excludeIds);
    return normalizeMath(data.item);
  } catch {
    return null;
  }
}

export async function fetchAssignedSpellingBatch(contentId: string, assignmentId?: string): Promise<AssignedContentBatch<SpellingWord> | null> {
  try {
    return parseAssignedItems(await fetchAssigned(contentId, assignmentId), "spelling", normalizeSpelling);
  } catch {
    return null;
  }
}

export async function fetchAssignedMathBatch(contentId: string, assignmentId?: string): Promise<AssignedContentBatch<MathQuestion> | null> {
  try {
    return parseAssignedItems(await fetchAssigned(contentId, assignmentId), "math", normalizeMath);
  } catch {
    return null;
  }
}

export async function fetchAssignedReadingBatch(contentId: string, assignmentId?: string): Promise<AssignedContentBatch<ReadingPassage> | null> {
  try {
    return parseAssignedItems(await fetchAssigned(contentId, assignmentId), "reading", normalizeReading);
  } catch {
    return null;
  }
}

export async function fetchAssignedSpellingWord(contentId: string, assignmentId?: string): Promise<SpellingWord | null> {
  try {
    const batch = await fetchAssignedSpellingBatch(contentId, assignmentId);
    if (!batch) return null;
    return takeNextAssignedItem(batch.items, "spelling", contentId, assignmentId);
  } catch {
    return null;
  }
}

export async function fetchAssignedMathQuestion(contentId: string, assignmentId?: string): Promise<MathQuestion | null> {
  try {
    const batch = await fetchAssignedMathBatch(contentId, assignmentId);
    if (!batch) return null;
    return takeNextAssignedItem(batch.items, "math", contentId, assignmentId);
  } catch {
    return null;
  }
}

export async function fetchAssignedReadingPassage(contentId: string, assignmentId?: string): Promise<ReadingPassage | null> {
  try {
    const batch = await fetchAssignedReadingBatch(contentId, assignmentId);
    if (!batch) return null;
    return takeNextAssignedItem(batch.items, "reading", contentId, assignmentId);
  } catch {
    return null;
  }
}
