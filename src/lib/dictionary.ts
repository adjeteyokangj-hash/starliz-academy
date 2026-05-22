import { prisma } from "@/lib/db";
import {
  decodeDictionaryWordRelationships,
  encodeDictionaryWordRelationships,
  type DictionaryWordRelationships,
} from "@/lib/dictionary_relationships";

export type DictionaryWordRecord = {
  id: string;
  word: string;
  normalizedWord: string;
  subject: string;
  keyStage: string;
  yearGroup: string | null;
  difficulty: string;
  topic: string | null;
  skillFocus: string | null;
  definitionChild: string;
  definitionParent: string | null;
  exampleSentence: string | null;
  secondExampleSentence: string | null;
  phonicsPattern: string | null;
  syllables: string | null;
  pronunciationHint: string | null;
  synonyms: string[];
  antonyms: string[];
  relatedWords: string[];
  isTrickyWord: boolean;
  isTopicKeyword: boolean;
  isMathsKeyword: boolean;
  isScienceKeyword: boolean;
  isReadingKeyword: boolean;
  isSpellingKeyword: boolean;
  interventionTags: string[];
  senTags: string[];
  safeguardingTags: string[];
  curriculumTags: string[];
  importSource: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  deactivatedByUserId: string | null;
  deactivatedAt: Date | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type DictionaryWordFilters = {
  q?: string | null;
  subject?: string | null;
  keyStage?: string | null;
  yearGroup?: string | null;
  difficulty?: string | null;
  topic?: string | null;
  isTrickyWord?: boolean | null;
  isTopicKeyword?: boolean | null;
  active?: boolean | null;
  page?: number | null;
  limit?: number | null;
  skip?: number | null;
};

export type DictionaryWordInput = {
  word: string;
  subject: string;
  keyStage: string;
  yearGroup?: string | null;
  difficulty?: string | null;
  topic?: string | null;
  skillFocus?: string | null;
  definitionChild: string;
  definitionParent?: string | null;
  exampleSentence?: string | null;
  secondExampleSentence?: string | null;
  phonicsPattern?: string | null;
  syllables?: string | null;
  pronunciationHint?: string | null;
  synonyms?: string[] | string | null;
  antonyms?: string[] | string | null;
  relatedWords?: string[] | string | null;
  easierWords?: string[] | string | null;
  harderWords?: string[] | string | null;
  prerequisiteWords?: string[] | string | null;
  relatedMathConcepts?: string[] | string | null;
  phonicsFamilies?: string[] | string | null;
  spellingFamilies?: string[] | string | null;
  curriculumTopics?: string[] | string | null;
  interventionPaths?: string[] | string | null;
  isTrickyWord?: boolean;
  isTopicKeyword?: boolean;
  isMathsKeyword?: boolean;
  isScienceKeyword?: boolean;
  isReadingKeyword?: boolean;
  isSpellingKeyword?: boolean;
  interventionTags?: string[] | string | null;
  senTags?: string[] | string | null;
  safeguardingTags?: string[] | string | null;
  curriculumTags?: string[] | string | null;
  active?: boolean;
  importSource?: string | null;
};

export type DictionaryDashboardMetrics = {
  totalWords: number;
  activeWords: number;
  inactiveWords: number;
  wordsBySubject: Array<{ subject: string; count: number }>;
  wordsByKeyStage: Array<{ keyStage: string; count: number }>;
  mostUsedCoachLookups: Array<{ normalizedWord: string; subject: string | null; count: number }>;
};

export type DictionaryWordWithRelationships = DictionaryWordRecord & {
  relationships: DictionaryWordRelationships;
};

type DictionaryMutationContext = {
  actorUserId?: string | null;
  importSource?: string | null;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeDictionaryWord(word: string): string {
  return cleanText(word).toLowerCase();
}

function toOptionalText(value: unknown): string | null {
  const text = cleanText(value);
  return text ? text : null;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((entry) => cleanText(entry)).filter(Boolean))];
  }
  if (typeof value === "string") {
    return [...new Set(value.split(/[,\n;]/).map((entry) => cleanText(entry)).filter(Boolean))];
  }
  return [];
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

export function containsDangerousDictionaryHtml(input: string): boolean {
  if (!input) return false;
  const dangerousPattern = /<\s*script|<\s*iframe|<\s*object|<\s*embed|javascript:|on\w+\s*=|<\s*img[^>]+on\w+\s*=/i;
  return dangerousPattern.test(input);
}

function parseYearGroupNumber(yearGroup: string | null): number | null {
  if (!yearGroup) return null;
  const normalized = yearGroup.toLowerCase();
  if (normalized.includes("reception")) return 0;
  const match = normalized.match(/(\d{1,2})/);
  return match ? Number(match[1]) : null;
}

export function isKeyStageYearGroupCompatible(keyStage: string, yearGroup: string | null): boolean {
  const year = parseYearGroupNumber(yearGroup);
  if (year === null) return true;

  const normalizedStage = keyStage.toLowerCase();
  const stageRanges: Record<string, [number, number]> = {
    "early-years": [0, 0],
    ks1: [1, 2],
    ks2: [3, 6],
    ks3: [7, 9],
    ks4: [10, 11],
    ks5: [12, 13],
  };
  const range = stageRanges[normalizedStage];
  if (!range) return true;
  return year >= range[0] && year <= range[1];
}

function buildCreateData(input: DictionaryWordInput, context: DictionaryMutationContext = {}) {
  const word = cleanText(input.word);
  const normalizedWord = normalizeDictionaryWord(word);
  const definitionChild = cleanText(input.definitionChild);
  if (!definitionChild) {
    throw new Error("Child-friendly definition is required.");
  }

  if (containsDangerousDictionaryHtml(word)) throw new Error("Unsafe HTML/script content detected in word.");
  if (containsDangerousDictionaryHtml(definitionChild)) throw new Error("Unsafe HTML/script content detected in definition.");
  if (containsDangerousDictionaryHtml(cleanText(input.definitionParent))) throw new Error("Unsafe HTML/script content detected in parent definition.");
  if (containsDangerousDictionaryHtml(cleanText(input.exampleSentence))) throw new Error("Unsafe HTML/script content detected in example sentence.");
  if (containsDangerousDictionaryHtml(cleanText(input.secondExampleSentence))) throw new Error("Unsafe HTML/script content detected in second example sentence.");

  const keyStage = cleanText(input.keyStage);
  const yearGroup = toOptionalText(input.yearGroup);
  if (!isKeyStageYearGroupCompatible(keyStage, yearGroup)) {
    throw new Error("Year group does not match key stage.");
  }

  const relationshipInput = {
    relatedWords: input.relatedWords,
    easierWords: input.easierWords,
    harderWords: input.harderWords,
    prerequisiteWords: input.prerequisiteWords,
    relatedMathConcepts: input.relatedMathConcepts,
    phonicsFamilies: input.phonicsFamilies,
    spellingFamilies: input.spellingFamilies,
    curriculumTopics: input.curriculumTopics,
    interventionPaths: input.interventionPaths,
  };

  return {
    word,
    normalizedWord,
    subject: cleanText(input.subject),
    keyStage,
    yearGroup,
    difficulty: cleanText(input.difficulty) || "easy",
    topic: toOptionalText(input.topic),
    skillFocus: toOptionalText(input.skillFocus),
    definitionChild,
    definitionParent: toOptionalText(input.definitionParent),
    exampleSentence: toOptionalText(input.exampleSentence),
    secondExampleSentence: toOptionalText(input.secondExampleSentence),
    phonicsPattern: toOptionalText(input.phonicsPattern),
    syllables: toOptionalText(input.syllables),
    pronunciationHint: toOptionalText(input.pronunciationHint),
    synonyms: toStringArray(input.synonyms),
    antonyms: toStringArray(input.antonyms),
    relatedWords: encodeDictionaryWordRelationships(relationshipInput),
    isTrickyWord: toBoolean(input.isTrickyWord),
    isTopicKeyword: toBoolean(input.isTopicKeyword),
    isMathsKeyword: toBoolean(input.isMathsKeyword),
    isScienceKeyword: toBoolean(input.isScienceKeyword),
    isReadingKeyword: toBoolean(input.isReadingKeyword),
    isSpellingKeyword: toBoolean(input.isSpellingKeyword),
    interventionTags: toStringArray(input.interventionTags),
    senTags: toStringArray(input.senTags),
    safeguardingTags: toStringArray(input.safeguardingTags),
    curriculumTags: toStringArray(input.curriculumTags),
    importSource: toOptionalText(context.importSource ?? input.importSource) ?? "manual",
    ...(context.actorUserId ? { updatedByUserId: context.actorUserId } : {}),
    active: toBoolean(input.active, true),
  };
}

export function enrichDictionaryWordWithRelationships<T extends { relatedWords: string[] }>(item: T): T & { relationships: DictionaryWordRelationships } {
  return {
    ...item,
    relationships: decodeDictionaryWordRelationships(item.relatedWords),
  };
}

async function ensureDictionaryWordUnique(params: {
  id?: string;
  normalizedWord: string;
  subject: string;
  keyStage: string;
  yearGroup: string | null;
}) {
  const duplicate = await prisma.dictionaryWord.findFirst({
    where: {
      normalizedWord: params.normalizedWord,
      subject: params.subject,
      keyStage: params.keyStage,
      yearGroup: params.yearGroup,
      ...(params.id ? { NOT: { id: params.id } } : {}),
    },
    select: { id: true },
  });

  if (duplicate) {
    const error = new Error("Duplicate dictionary word for this subject, key stage and year group.");
    (error as Error & { code?: string }).code = "DUPLICATE_DICTIONARY_WORD";
    throw error;
  }
}

export async function createDictionaryWord(input: DictionaryWordInput, context: DictionaryMutationContext = {}) {
  const data = buildCreateData(input, context);
  await ensureDictionaryWordUnique({
    normalizedWord: data.normalizedWord,
    subject: data.subject,
    keyStage: data.keyStage,
    yearGroup: data.yearGroup,
  });

  return prisma.dictionaryWord.create({
    data: {
      ...data,
      ...(context.actorUserId ? { createdByUserId: context.actorUserId, updatedByUserId: context.actorUserId } : {}),
    },
  });
}

export async function updateDictionaryWord(id: string, input: Partial<DictionaryWordInput>, context: DictionaryMutationContext = {}) {
  const existing = await prisma.dictionaryWord.findUnique({ where: { id } });
  if (!existing) return null;

  const merged = {
    ...existing,
    ...input,
    yearGroup: input.yearGroup === undefined ? existing.yearGroup : toOptionalText(input.yearGroup),
    difficulty: input.difficulty === undefined ? existing.difficulty : cleanText(input.difficulty) || "easy",
  };
  const data = buildCreateData(merged, context);
  await ensureDictionaryWordUnique({
    id,
    normalizedWord: data.normalizedWord,
    subject: data.subject,
    keyStage: data.keyStage,
    yearGroup: data.yearGroup,
  });

  return prisma.dictionaryWord.update({
    where: { id },
    data: {
      ...data,
      ...(context.actorUserId ? { updatedByUserId: context.actorUserId } : {}),
      ...(input.active === true ? { deactivatedByUserId: null, deactivatedAt: null } : {}),
    },
  });
}

export async function deactivateDictionaryWord(id: string, actorUserId?: string) {
  return prisma.dictionaryWord.update({
    where: { id },
    data: {
      active: false,
      deactivatedAt: new Date(),
      ...(actorUserId ? { deactivatedByUserId: actorUserId, updatedByUserId: actorUserId } : {}),
    },
  });
}

export async function getDictionaryWordById(id: string) {
  return prisma.dictionaryWord.findUnique({ where: { id } });
}

export async function getDictionaryWordByContext(params: {
  word?: string | null;
  subject?: string | null;
  keyStage?: string | null;
  yearGroup?: string | null;
  topic?: string | null;
  active?: boolean | null;
}) {
  const normalizedWord = normalizeDictionaryWord(params.word ?? "");
  if (!normalizedWord) return null;

  const candidate = await prisma.dictionaryWord.findFirst({
    where: {
      normalizedWord,
      ...(params.subject ? { subject: params.subject } : {}),
      ...(params.keyStage ? { keyStage: params.keyStage } : {}),
      ...(params.yearGroup ? { yearGroup: params.yearGroup } : {}),
      ...(params.topic ? { OR: [{ topic: { contains: params.topic, mode: "insensitive" } }, { skillFocus: { contains: params.topic, mode: "insensitive" } }] } : {}),
      active: params.active ?? true,
    },
    orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
  });

  if (candidate) return candidate;

  return prisma.dictionaryWord.findFirst({
    where: {
      normalizedWord,
      active: params.active ?? true,
    },
    orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
  });
}

export async function listActiveDictionaryWordsByNormalizedWords(params: {
  normalizedWords: string[];
  subject?: string | null;
  keyStage?: string | null;
  yearGroup?: string | null;
}) {
  const normalizedWords = [...new Set(params.normalizedWords.map((word) => normalizeDictionaryWord(word)).filter(Boolean))];
  if (!normalizedWords.length) return [];

  return prisma.dictionaryWord.findMany({
    where: {
      normalizedWord: { in: normalizedWords },
      active: true,
      ...(params.subject ? { subject: params.subject } : {}),
      ...(params.keyStage ? { keyStage: params.keyStage } : {}),
      ...(params.yearGroup ? { yearGroup: params.yearGroup } : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
  });
}

export async function listDictionaryWords(filters: DictionaryWordFilters = {}) {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const limit = Math.min(100, Math.max(1, Math.floor(filters.limit ?? 25)));
  const skip = filters.skip !== undefined && filters.skip !== null
    ? Math.max(0, Math.floor(filters.skip))
    : (page - 1) * limit;
  const q = cleanText(filters.q).toLowerCase();

  const where = {
    ...(q
      ? {
          OR: [
            { word: { contains: q, mode: "insensitive" as const } },
            { normalizedWord: { contains: q, mode: "insensitive" as const } },
            { topic: { contains: q, mode: "insensitive" as const } },
            { skillFocus: { contains: q, mode: "insensitive" as const } },
            { definitionChild: { contains: q, mode: "insensitive" as const } },
            { exampleSentence: { contains: q, mode: "insensitive" as const } },
            { secondExampleSentence: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(filters.subject ? { subject: filters.subject } : {}),
    ...(filters.keyStage ? { keyStage: filters.keyStage } : {}),
    ...(filters.yearGroup ? { yearGroup: filters.yearGroup } : {}),
    ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
    ...(filters.topic ? { topic: { contains: filters.topic, mode: "insensitive" as const } } : {}),
    ...(filters.isTrickyWord === undefined || filters.isTrickyWord === null ? {} : { isTrickyWord: filters.isTrickyWord }),
    ...(filters.isTopicKeyword === undefined || filters.isTopicKeyword === null ? {} : { isTopicKeyword: filters.isTopicKeyword }),
    active: filters.active ?? true,
  };

  const [total, items] = await Promise.all([
    prisma.dictionaryWord.count({ where }),
    prisma.dictionaryWord.findMany({
      where,
      orderBy: [{ word: "asc" }],
      skip,
      take: limit,
    }),
  ]);

  return { items, total, page, limit };
}

export async function countDictionaryWordsForGraph(filters: Pick<DictionaryWordFilters, "q" | "subject" | "keyStage" | "yearGroup" | "active"> = {}) {
  const q = cleanText(filters.q).toLowerCase();

  const where = {
    ...(q
      ? {
          OR: [
            { word: { contains: q, mode: "insensitive" as const } },
            { normalizedWord: { contains: q, mode: "insensitive" as const } },
            { topic: { contains: q, mode: "insensitive" as const } },
            { skillFocus: { contains: q, mode: "insensitive" as const } },
            { definitionChild: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(filters.subject ? { subject: filters.subject } : {}),
    ...(filters.keyStage ? { keyStage: filters.keyStage } : {}),
    ...(filters.yearGroup ? { yearGroup: filters.yearGroup } : {}),
    active: filters.active ?? true,
  };

  return prisma.dictionaryWord.count({ where });
}

export async function recordCoachDictionaryLookup(params: {
  word: string;
  normalizedWord: string;
  subject?: string | null;
  keyStage?: string | null;
  yearGroup?: string | null;
  found: boolean;
  dictionaryWordId?: string | null;
}) {
  await prisma.coachDictionaryLookup.create({
    data: {
      word: params.word,
      normalizedWord: params.normalizedWord,
      subject: params.subject ?? null,
      keyStage: params.keyStage ?? null,
      yearGroup: params.yearGroup ?? null,
      found: params.found,
      dictionaryWordId: params.dictionaryWordId ?? null,
    },
  });
}

export async function getDictionaryDashboardMetrics(): Promise<DictionaryDashboardMetrics> {
  const [totalWords, activeWords, inactiveWords, bySubject, byKeyStage, recentLookups] = await Promise.all([
    prisma.dictionaryWord.count(),
    prisma.dictionaryWord.count({ where: { active: true } }),
    prisma.dictionaryWord.count({ where: { active: false } }),
    prisma.dictionaryWord.groupBy({ by: ["subject"], _count: { _all: true } }),
    prisma.dictionaryWord.groupBy({ by: ["keyStage"], _count: { _all: true } }),
    prisma.coachDictionaryLookup.findMany({
      select: { normalizedWord: true, subject: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
  ]);

  const lookupCounter = new Map<string, { normalizedWord: string; subject: string | null; count: number }>();
  for (const lookup of recentLookups) {
    const key = `${lookup.subject ?? ""}|${lookup.normalizedWord}`;
    const existing = lookupCounter.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      lookupCounter.set(key, { normalizedWord: lookup.normalizedWord, subject: lookup.subject, count: 1 });
    }
  }

  const mostUsedCoachLookups = [...lookupCounter.values()].sort((a, b) => b.count - a.count).slice(0, 10);

  return {
    totalWords,
    activeWords,
    inactiveWords,
    wordsBySubject: bySubject
      .map((entry) => ({ subject: entry.subject, count: entry._count._all }))
      .sort((a, b) => b.count - a.count),
    wordsByKeyStage: byKeyStage
      .map((entry) => ({ keyStage: entry.keyStage, count: entry._count._all }))
      .sort((a, b) => b.count - a.count),
    mostUsedCoachLookups,
  };
}

export async function recordDictionaryBulkImport(params: {
  source: string;
  initiatedByUserId?: string | null;
  addedCount: number;
  skippedCount: number;
  failedCount: number;
  metadata?: Record<string, unknown>;
}) {
  await prisma.dictionaryBulkImportHistory.create({
    data: {
      source: params.source,
      initiatedByUserId: params.initiatedByUserId ?? null,
      addedCount: params.addedCount,
      skippedCount: params.skippedCount,
      failedCount: params.failedCount,
      metadataJson: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  });
}
