import { prisma } from "@/lib/db";
import { GA_APPROVED_CATEGORIES, normalizeGaCategory } from "@/lib/ga-word-categories";
import { resolveGaCategoryAgainstAllowed } from "@/lib/ga-categories";
import {
  GA_LANGUAGE_PROFILE,
  languageRequiresVerifiedWordBank,
  validateWordCharacters,
} from "@/lib/language-profiles";

export const GA_WORD_TYPES = ["noun", "verb", "adjective", "pronoun", "expression", "conjunction", "determiner"] as const;
export const GA_CATEGORIES = GA_APPROVED_CATEGORIES;
export const GA_LEVELS = ["Foundation", "Beginner 1", "Beginner 2", "Intermediate"] as const;
export const GA_REVIEW_STATUSES = ["Pending", "Reviewed", "Approved", "Rejected"] as const;
export const GA_AUDIO_STATUSES = ["Not Started", "Draft", "Needs Review", "Approved"] as const;
export const GA_BULK_IMPORT_HEADERS = [
  "englishWord",
  "gaWord",
  "wordType",
  "category",
  "level",
  "sourcePage",
  "reviewStatus",
  "audioStatus",
  "quizReady",
  "storyReady",
  "notes",
  "sourceId",
  "sourceName",
] as const;
export const GA_BULK_IMPORT_TEMPLATE = "englishWord,gaWord,wordType,category,level,sourcePage,reviewStatus,audioStatus,quizReady,storyReady,notes,sourceName";

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

type GaWordBuildOptions = {
  allowedCategories?: readonly string[];
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

export type GaBulkImportDuplicateStrategy = "skip" | "update";

export type GaBulkImportSource = {
  id: string;
  sourceName: string;
};

export type GaBulkImportExistingWord = {
  id: string;
  englishWord: string;
  gaWord: string;
  category: string;
  sourcePage: number | null;
};

const ENGLISH_NUMBER_WORD_TO_DIGIT: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
};

const ENGLISH_NUMBER_DIGIT_TO_WORD: Record<string, string> = {
  "0": "zero",
  "1": "one",
  "2": "two",
  "3": "three",
  "4": "four",
  "5": "five",
  "6": "six",
  "7": "seven",
  "8": "eight",
  "9": "nine",
  "10": "ten",
};

export type GaBulkImportParsedRow = {
  rowNumber: number;
  values: Record<string, string>;
};

export type GaBulkImportValidRow = {
  rowNumber: number;
  duplicateKey: string;
  duplicateExisting: boolean;
  existingWordId: string | null;
  data: ReturnType<typeof buildGaWordData>;
};

export type GaBulkImportInvalidRow = {
  rowNumber: number;
  errors: string[];
};

export type GaBulkImportPreview = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateWarnings: number;
  rows: {
    rowNumber: number;
    valid: boolean;
    duplicateExisting: boolean;
    errors: string[];
  }[];
  validItems: GaBulkImportValidRow[];
  invalidItems: GaBulkImportInvalidRow[];
};

export function isGaWordSchemaNotReadyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  return (
    normalized.includes("p2021")
    || (normalized.includes("relation") && (normalized.includes("gaword") || normalized.includes("gasource")) && normalized.includes("does not exist"))
    || (normalized.includes("table") && (normalized.includes("gaword") || normalized.includes("gasource")) && normalized.includes("does not exist"))
  );
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

export function isGaAlphabetLetterRowLabel(value: string): boolean {
  const normalized = cleanText(value).replace(/\s+/g, " ");
  const match = /^letter\s+([a-z])$/i.exec(normalized);
  return Boolean(match);
}

function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, "").trim().toLowerCase();
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      const next = line[index + 1];
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values;
}

function parseImportBoolean(value: string): boolean | null {
  const normalized = cleanText(value).toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n", ""].includes(normalized)) return false;
  return null;
}

function buildDuplicateKey(englishWord: string, gaWord: string, category: string, sourcePage: number | null): string {
  return `${englishWord.trim().toLowerCase()}::${gaWord.trim().toLowerCase()}::${category.trim().toLowerCase()}::${sourcePage === null ? "null" : String(sourcePage)}`;
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

export function parseGaBulkImportText(text: string): GaBulkImportParsedRow[] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (rows.length === 0) return [];

  const delimiter = rows[0].includes("\t") ? "\t" : ",";
  const headers = parseDelimitedLine(rows[0], delimiter).map((header) => normalizeHeader(header));
  const headerMap = new Map<string, string>([
    ["englishword", "englishWord"],
    ["gaword", "gaWord"],
    ["wordtype", "wordType"],
    ["category", "category"],
    ["level", "level"],
    ["sourcepage", "sourcePage"],
    ["reviewstatus", "reviewStatus"],
    ["audiostatus", "audioStatus"],
    ["quizready", "quizReady"],
    ["storyready", "storyReady"],
    ["notes", "notes"],
    ["sourceid", "sourceId"],
    ["sourcename", "sourceName"],
  ]);

  return rows.slice(1).map((line, rowIndex) => {
    const columns = parseDelimitedLine(line, delimiter);
    const values: Record<string, string> = {};
    for (let index = 0; index < headers.length; index += 1) {
      const mappedHeader = headerMap.get(headers[index]);
      if (!mappedHeader) continue;
      values[mappedHeader] = columns[index] ?? "";
    }
    return { rowNumber: rowIndex + 2, values };
  });
}

export function previewGaBulkImport(
  parsedRows: GaBulkImportParsedRow[],
  sources: GaBulkImportSource[],
  existingWords: GaBulkImportExistingWord[],
  options: GaWordBuildOptions = {},
): GaBulkImportPreview {
  const requiredFields = [
    "englishWord",
    "gaWord",
    "wordType",
    "category",
    "level",
    "reviewStatus",
    "audioStatus",
    "quizReady",
    "storyReady",
  ] as const;
  const sourceById = new Map(sources.map((source) => [source.id, source.id]));
  const sourceByName = new Map(sources.map((source) => [source.sourceName.trim().toLowerCase(), source.id]));
  const existingByKey = new Map<string, GaBulkImportExistingWord>();
  for (const item of existingWords) {
    const key = buildDuplicateKey(item.englishWord, item.gaWord, item.category, item.sourcePage);
    existingByKey.set(key, item);
  }

  const uploadSeen = new Map<string, number>();
  const validItems: GaBulkImportValidRow[] = [];
  const invalidItems: GaBulkImportInvalidRow[] = [];
  const rows: GaBulkImportPreview["rows"] = [];
  let duplicateWarnings = 0;

  for (const row of parsedRows) {
    const errors: string[] = [];
    for (const field of requiredFields) {
      if (!cleanText(row.values[field])) {
        errors.push(`${field} is required.`);
      }
    }

    const sourceIdRaw = cleanText(row.values.sourceId);
    const sourceNameRaw = cleanText(row.values.sourceName);
    let sourceId: string | null = null;
    if (!sourceIdRaw && !sourceNameRaw) {
      errors.push("Either sourceId or sourceName is required.");
    } else if (sourceIdRaw) {
      if (!sourceById.has(sourceIdRaw)) {
        errors.push(`sourceId '${sourceIdRaw}' was not found.`);
      } else {
        sourceId = sourceIdRaw;
      }
    } else if (sourceNameRaw) {
      const matched = sourceByName.get(sourceNameRaw.toLowerCase());
      if (!matched) {
        errors.push(`sourceName '${sourceNameRaw}' was not found.`);
      } else {
        sourceId = matched;
      }
    }

    const sourcePageRaw = cleanText(row.values.sourcePage);
    const sourcePageValue = sourcePageRaw === "" ? null : Number(sourcePageRaw);
    if (sourcePageValue !== null && (!Number.isInteger(sourcePageValue) || sourcePageValue < 0)) {
      errors.push("sourcePage must be a valid non-negative integer when provided.");
    }

    const quizReady = parseImportBoolean(row.values.quizReady);
    if (quizReady === null) {
      errors.push("quizReady must be true/false.");
    }
    const storyReady = parseImportBoolean(row.values.storyReady);
    if (storyReady === null) {
      errors.push("storyReady must be true/false.");
    }

    let data: ReturnType<typeof buildGaWordData> | null = null;
    if (errors.length === 0) {
      try {
        data = buildGaWordData({
          englishWord: row.values.englishWord,
          gaWord: row.values.gaWord,
          wordType: row.values.wordType,
          category: row.values.category,
          level: row.values.level,
          sourceId,
          sourcePage: sourcePageValue,
          reviewStatus: row.values.reviewStatus,
          audioStatus: row.values.audioStatus,
          quizReady: quizReady ?? false,
          storyReady: storyReady ?? false,
          notes: cleanText(row.values.notes) || null,
        }, options);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Invalid row values.");
      }
    }

    if (!data || errors.length > 0) {
      invalidItems.push({ rowNumber: row.rowNumber, errors });
      rows.push({ rowNumber: row.rowNumber, valid: false, duplicateExisting: false, errors });
      continue;
    }

    const duplicateKey = buildDuplicateKey(data.englishWord, data.gaWord, data.category, data.sourcePage ?? null);
    const existingMatch = existingByKey.get(duplicateKey);
    if (existingMatch) duplicateWarnings += 1;
    const priorRow = uploadSeen.get(duplicateKey);
    if (priorRow) {
      duplicateWarnings += 1;
      const duplicateErrors = [`Duplicate row in this import batch (already appears on row ${priorRow}).`];
      invalidItems.push({ rowNumber: row.rowNumber, errors: duplicateErrors });
      rows.push({ rowNumber: row.rowNumber, valid: false, duplicateExisting: false, errors: duplicateErrors });
      continue;
    }
    uploadSeen.set(duplicateKey, row.rowNumber);

    const validRow: GaBulkImportValidRow = {
      rowNumber: row.rowNumber,
      duplicateKey,
      duplicateExisting: Boolean(existingMatch),
      existingWordId: existingMatch?.id ?? null,
      data,
    };
    validItems.push(validRow);
    rows.push({
      rowNumber: row.rowNumber,
      valid: true,
      duplicateExisting: Boolean(existingMatch),
      errors: [],
    });
  }

  return {
    totalRows: parsedRows.length,
    validRows: validItems.length,
    invalidRows: invalidItems.length,
    duplicateWarnings,
    rows,
    validItems,
    invalidItems,
  };
}

export function planGaBulkImportCommit(items: GaBulkImportValidRow[], strategy: GaBulkImportDuplicateStrategy) {
  let creates = 0;
  let updates = 0;
  let skips = 0;
  for (const item of items) {
    if (item.duplicateExisting) {
      if (strategy === "update") {
        updates += 1;
      } else {
        skips += 1;
      }
      continue;
    }
    creates += 1;
  }
  return { creates, updates, skips };
}

export function buildGaWordData(input: GaWordInput, options: GaWordBuildOptions = {}) {
  const englishWord = cleanText(input.englishWord);
  const gaWord = cleanText(input.gaWord);
  const category = normalizeGaCategory(cleanText(input.category));
  const allowedCategories = options.allowedCategories ?? GA_CATEGORIES;
  if (!englishWord) throw new Error("English word is required.");
  if (!gaWord) throw new Error("Ga word is required.");

  const characterWarnings = validateWordCharacters(GA_LANGUAGE_PROFILE, gaWord);
  const baseNotes = optionalText(input.notes);
  const combinedNotes = characterWarnings.length
    ? [baseNotes, ...characterWarnings].filter(Boolean).join(" | ")
    : baseNotes;

  return {
    englishWord,
    gaWord,
    wordType: assertAllowed(cleanText(input.wordType), GA_WORD_TYPES, "Word type"),
    category: resolveGaCategoryAgainstAllowed(category, allowedCategories),
    level: assertAllowed(cleanText(input.level), GA_LEVELS, "Level"),
    sourceId: optionalText(input.sourceId),
    sourcePage: numberOrNull(input.sourcePage),
    reviewStatus: assertAllowed(cleanText(input.reviewStatus) || "Pending", GA_REVIEW_STATUSES, "Review status"),
    audioStatus: assertAllowed(cleanText(input.audioStatus) || "Not Started", GA_AUDIO_STATUSES, "Audio status"),
    quizReady: input.quizReady === true,
    storyReady: input.storyReady === true,
    notes: optionalText(combinedNotes),
  };
}

export function isGaWordStudentSafe(word: { reviewStatus: string }): boolean {
  if (!languageRequiresVerifiedWordBank(GA_LANGUAGE_PROFILE)) return word.reviewStatus === "Approved";
  return word.reviewStatus === "Approved";
}

export function formatGaEnglishDisplayWord(
  word: { englishWord: string; category?: string | null },
  mode: "source" | "digit" | "letters" = "source",
) {
  const englishWord = cleanText(word.englishWord);
  const category = cleanText(word.category);
  if (category !== "Numbers") return englishWord;

  const normalizedWord = englishWord.toLowerCase();
  const asDigit = ENGLISH_NUMBER_WORD_TO_DIGIT[normalizedWord];
  const asWord = ENGLISH_NUMBER_DIGIT_TO_WORD[englishWord];

  if (mode === "digit") return asDigit ?? englishWord;
  if (mode === "letters") return asWord ?? englishWord;
  return englishWord;
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
  pronunciationHint?: string | null;
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
    pronunciationHint: word.pronunciationHint ?? null,
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

export async function recategorizeGaAlphabetRowsFromGrammar() {
  const candidates = await prisma.gaWord.findMany({
    where: {
      category: "Grammar",
      englishWord: {
        startsWith: "Letter ",
      },
    },
    select: {
      id: true,
      englishWord: true,
    },
  });

  const targetIds = candidates
    .filter((row) => isGaAlphabetLetterRowLabel(row.englishWord))
    .map((row) => row.id);

  if (!targetIds.length) {
    return { inspected: candidates.length, targetCount: 0, updated: 0 };
  }

  const result = await prisma.gaWord.updateMany({
    where: { id: { in: targetIds } },
    data: { category: "Alphabet" },
  });

  return {
    inspected: candidates.length,
    targetCount: targetIds.length,
    updated: result.count,
  };
}

export async function createGaWord(input: GaWordInput, options: GaWordBuildOptions = {}) {
  const data = buildGaWordData(input, options);
  return prisma.gaWord.create({ data, include: { source: true } });
}

export async function updateGaWord(id: string, input: Partial<GaWordInput>, options: GaWordBuildOptions = {}) {
  const existing = await prisma.gaWord.findUnique({ where: { id } });
  if (!existing) return null;

  const allowedCategories = options.allowedCategories ?? GA_CATEGORIES;
  const currentCategory = normalizeGaCategory(existing.category);
  const categoryAllowList = allowedCategories.some((name) => name.toLowerCase() === currentCategory.toLowerCase())
    ? allowedCategories
    : [...allowedCategories, currentCategory];

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
  }, { allowedCategories: categoryAllowList });
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
