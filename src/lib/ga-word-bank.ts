import { prisma } from "@/lib/db";

export const GA_WORD_TYPES = ["noun", "verb", "adjective", "pronoun", "expression", "conjunction", "determiner"] as const;
export const GA_CATEGORIES = ["Greetings", "Time", "Days", "Numbers", "Family", "Body", "Food", "Animals", "Home", "School", "Actions", "Places", "Objects", "Nature", "Feelings", "Grammar"] as const;
export const GA_LEVELS = ["Foundation", "Beginner 1", "Beginner 2", "Intermediate"] as const;
export const GA_REVIEW_STATUSES = ["Pending", "Reviewed", "Approved", "Rejected"] as const;
export const GA_AUDIO_STATUSES = ["Not Started", "Draft", "Needs Review", "Approved"] as const;

export type GaReviewStatus = typeof GA_REVIEW_STATUSES[number];
export type GaWordInput = {
  englishWord: string;
  gaWord: string;
  wordType: string;
  category: string;
  level: string;
  sourceId?: string | null;
  sourcePage?: number | null;
  reviewStatus?: string | null;
  audioStatus?: string | null;
  quizReady?: boolean;
  storyReady?: boolean;
  notes?: string | null;
};

export type GaSourceInput = {
  sourceName: string;
  sourceYear?: number | null;
  fileName?: string | null;
  fileReference?: string | null;
  pageNumber?: number | null;
  section?: string | null;
  notes?: string | null;
};

export type GaWordFilters = {
  q?: string | null;
  reviewStatus?: string | null;
  category?: string | null;
  level?: string | null;
  wordType?: string | null;
  sourcePage?: number | null;
  audioStatus?: string | null;
  quizReady?: boolean | null;
  storyReady?: boolean | null;
  approvedOnly?: boolean;
  limit?: number | null;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function optionalText(value: unknown): string | null {
  const text = cleanText(value);
  return text ? text : null;
}

function assertAllowed(value: string, allowed: readonly string[], label: string): string {
  if (!allowed.includes(value)) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
  }
  return value;
}

function numberOrNull(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

export function buildGaWordData(input: GaWordInput) {
  const englishWord = cleanText(input.englishWord);
  const gaWord = cleanText(input.gaWord);
  if (!englishWord) throw new Error("English word is required.");
  if (!gaWord) throw new Error("Ga word is required.");

  return {
    englishWord,
    gaWord,
    wordType: assertAllowed(cleanText(input.wordType), GA_WORD_TYPES, "Word type"),
    category: assertAllowed(cleanText(input.category), GA_CATEGORIES, "Category"),
    level: assertAllowed(cleanText(input.level), GA_LEVELS, "Level"),
    sourceId: optionalText(input.sourceId),
    sourcePage: numberOrNull(input.sourcePage),
    reviewStatus: assertAllowed(cleanText(input.reviewStatus) || "Pending", GA_REVIEW_STATUSES, "Review status"),
    audioStatus: assertAllowed(cleanText(input.audioStatus) || "Not Started", GA_AUDIO_STATUSES, "Audio status"),
    quizReady: input.quizReady === true,
    storyReady: input.storyReady === true,
    notes: optionalText(input.notes),
  };
}

export function isGaWordStudentSafe(word: { reviewStatus: string }): boolean {
  return word.reviewStatus === "Approved";
}

export function toStudentSafeGaWord(word: {
  id: string;
  englishWord: string;
  gaWord: string;
  wordType: string;
  category: string;
  level: string;
  quizReady: boolean;
  storyReady: boolean;
  reviewStatus: string;
}) {
  if (!isGaWordStudentSafe(word)) return null;
  return {
    id: word.id,
    englishWord: word.englishWord,
    gaWord: word.gaWord,
    wordType: word.wordType,
    category: word.category,
    level: word.level,
    quizReady: word.quizReady,
    storyReady: word.storyReady,
  };
}

export async function createGaSource(input: GaSourceInput) {
  const sourceName = cleanText(input.sourceName);
  if (!sourceName) throw new Error("Source name is required.");

  return prisma.gaSource.create({
    data: {
      sourceName,
      sourceYear: numberOrNull(input.sourceYear),
      fileName: optionalText(input.fileName),
      fileReference: optionalText(input.fileReference),
      pageNumber: numberOrNull(input.pageNumber),
      section: optionalText(input.section),
      notes: optionalText(input.notes),
    },
  });
}

export async function listGaSources() {
  return prisma.gaSource.findMany({ orderBy: [{ sourceName: "asc" }, { pageNumber: "asc" }] });
}

export async function createGaWord(input: GaWordInput) {
  const data = buildGaWordData(input);
  return prisma.gaWord.create({ data, include: { source: true } });
}

export async function updateGaWord(id: string, input: Partial<GaWordInput>) {
  const existing = await prisma.gaWord.findUnique({ where: { id } });
  if (!existing) return null;
  const data = buildGaWordData({
    englishWord: input.englishWord ?? existing.englishWord,
    gaWord: input.gaWord ?? existing.gaWord,
    wordType: input.wordType ?? existing.wordType,
    category: input.category ?? existing.category,
    level: input.level ?? existing.level,
    sourceId: input.sourceId === undefined ? existing.sourceId : input.sourceId,
    sourcePage: input.sourcePage === undefined ? existing.sourcePage : input.sourcePage,
    reviewStatus: input.reviewStatus ?? existing.reviewStatus,
    audioStatus: input.audioStatus ?? existing.audioStatus,
    quizReady: input.quizReady ?? existing.quizReady,
    storyReady: input.storyReady ?? existing.storyReady,
    notes: input.notes === undefined ? existing.notes : input.notes,
  });
  return prisma.gaWord.update({ where: { id }, data, include: { source: true } });
}

export async function listGaWords(filters: GaWordFilters = {}) {
  const limit = Math.min(200, Math.max(1, Math.floor(filters.limit ?? 100)));
  const q = cleanText(filters.q);
  const where = {
    ...(filters.approvedOnly ? { reviewStatus: "Approved" } : {}),
    ...(filters.reviewStatus ? { reviewStatus: filters.reviewStatus } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.level ? { level: filters.level } : {}),
    ...(filters.wordType ? { wordType: filters.wordType } : {}),
    ...(filters.audioStatus ? { audioStatus: filters.audioStatus } : {}),
    ...(filters.sourcePage !== null && filters.sourcePage !== undefined ? { sourcePage: filters.sourcePage } : {}),
    ...(filters.quizReady !== null && filters.quizReady !== undefined ? { quizReady: filters.quizReady } : {}),
    ...(filters.storyReady !== null && filters.storyReady !== undefined ? { storyReady: filters.storyReady } : {}),
    ...(q
      ? {
          OR: [
            { englishWord: { contains: q, mode: "insensitive" as const } },
            { gaWord: { contains: q, mode: "insensitive" as const } },
            { notes: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  return prisma.gaWord.findMany({
    where,
    include: { source: true },
    orderBy: [{ category: "asc" }, { englishWord: "asc" }],
    take: limit,
  });
}

export async function getGaWordMetrics() {
  const [totalWords, approvedWords, pendingReview, audioApproved] = await Promise.all([
    prisma.gaWord.count(),
    prisma.gaWord.count({ where: { reviewStatus: "Approved" } }),
    prisma.gaWord.count({ where: { reviewStatus: { in: ["Pending", "Reviewed"] } } }),
    prisma.gaWord.count({ where: { audioStatus: "Approved" } }),
  ]);
  return { totalWords, approvedWords, pendingReview, audioApproved };
}
