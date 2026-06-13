import { prisma } from "@/lib/db";
import { GA_APPROVED_CATEGORIES, normalizeGaCategory } from "@/lib/ga-word-categories";

export const GA_CATEGORY_CONTEXTS = ["word_bank", "lessons"] as const;

export type GaCategoryContext = typeof GA_CATEGORY_CONTEXTS[number];

export type GaCategoryRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  isArchived: boolean;
  usedByWordBank: boolean;
  usedByLessons: boolean;
  wordCount: number;
  lessonCount: number;
  source: "database" | "fallback";
  createdAt: Date;
  updatedAt: Date;
};

export type GaCategoryCreateInput = {
  name: string;
  description?: string | null;
  isActive?: boolean;
  usedByWordBank?: boolean;
  usedByLessons?: boolean;
};

export type GaCategoryUpdateInput = {
  name?: string;
  description?: string | null;
  isActive?: boolean;
  isArchived?: boolean;
  usedByWordBank?: boolean;
  usedByLessons?: boolean;
  force?: boolean;
};

const CATEGORY_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  isActive: true,
  isArchived: true,
  usedByWordBank: true,
  usedByLessons: true,
  createdAt: true,
  updatedAt: true,
} as const;

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function toOptionalText(value: unknown): string | null {
  const text = cleanText(value);
  return text.length ? text : null;
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function slugifyCategoryName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "ga-category";
}

function toCanonicalCategoryName(input: string): string {
  const normalized = normalizeGaCategory(input);
  return titleCase(cleanText(normalized));
}

function isGaCategorySchemaNotReadyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  return (
    normalized.includes("p2021")
    || (normalized.includes("relation") && normalized.includes("gacategory") && normalized.includes("does not exist"))
    || (normalized.includes("table") && normalized.includes("gacategory") && normalized.includes("does not exist"))
  );
}

function fallbackCategoryRows(): GaCategoryRecord[] {
  const now = new Date();
  return GA_APPROVED_CATEGORIES.map((name, index) => ({
    id: `fallback-${index + 1}`,
    name,
    slug: slugifyCategoryName(name),
    description: null,
    isActive: true,
    isArchived: false,
    usedByWordBank: true,
    usedByLessons: true,
    wordCount: 0,
    lessonCount: 0,
    source: "fallback" as const,
    createdAt: now,
    updatedAt: now,
  }));
}

async function categoryUsageCounts(): Promise<{
  wordCountsByCategory: Map<string, number>;
  lessonCountsByCategory: Map<string, number>;
}> {
  const [wordUsage, lessonUsage] = await Promise.all([
    prisma.gaWord.groupBy({ by: ["category"], _count: { _all: true } }),
    prisma.gaLesson.groupBy({ by: ["category"], _count: { _all: true } }),
  ]);

  return {
    wordCountsByCategory: new Map(wordUsage.map((row) => [row.category, row._count._all])),
    lessonCountsByCategory: new Map(lessonUsage.map((row) => [row.category, row._count._all])),
  };
}

export async function listGaCategoriesAdmin(): Promise<GaCategoryRecord[]> {
  try {
    const [rows, usage] = await Promise.all([
      prisma.gaCategory.findMany({ select: CATEGORY_SELECT, orderBy: [{ isArchived: "asc" }, { name: "asc" }] }),
      categoryUsageCounts(),
    ]);

    const byName = new Map(rows.map((row) => [row.name.toLowerCase(), row]));
    const mergedRows = [...rows];

    // Keep hardcoded categories as fallback safety entries if the table was partially seeded.
    for (const fallbackName of GA_APPROVED_CATEGORIES) {
      if (!byName.has(fallbackName.toLowerCase())) {
        const now = new Date();
        mergedRows.push({
          id: `fallback-${fallbackName.toLowerCase()}`,
          name: fallbackName,
          slug: slugifyCategoryName(fallbackName),
          description: null,
          isActive: true,
          isArchived: false,
          usedByWordBank: true,
          usedByLessons: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return mergedRows
      .map((row) => ({
        ...row,
        wordCount: usage.wordCountsByCategory.get(row.name) ?? 0,
        lessonCount: usage.lessonCountsByCategory.get(row.name) ?? 0,
        source: row.id.startsWith("fallback-") ? "fallback" as const : "database" as const,
      }))
      .sort((left, right) => {
        if (left.isArchived !== right.isArchived) return Number(left.isArchived) - Number(right.isArchived);
        return left.name.localeCompare(right.name);
      });
  } catch (error) {
    if (!isGaCategorySchemaNotReadyError(error)) throw error;
    return fallbackCategoryRows();
  }
}

export async function listGaCategoryNamesForContext(context: GaCategoryContext, mode: "active" | "all" = "active"): Promise<string[]> {
  const rows = await listGaCategoriesAdmin();
  const filtered = rows.filter((row) => {
    if (mode === "active" && (!row.isActive || row.isArchived)) return false;
    if (context === "word_bank" && !row.usedByWordBank) return false;
    if (context === "lessons" && !row.usedByLessons) return false;
    return true;
  });
  const names = filtered.map((row) => row.name);
  return [...new Set(names)].sort((left, right) => left.localeCompare(right));
}

export function resolveGaCategoryAgainstAllowed(rawCategory: string, allowedCategories: readonly string[]): string {
  const normalized = toCanonicalCategoryName(rawCategory);
  if (!normalized) return normalized;
  const match = allowedCategories.find((name) => name.toLowerCase() === normalized.toLowerCase());
  if (match) return match;
  throw new Error(`Category must be one of: ${allowedCategories.join(", ")}.`);
}

export async function createGaCategory(input: GaCategoryCreateInput) {
  const name = toCanonicalCategoryName(cleanText(input.name));
  if (!name) throw new Error("Category name is required.");
  const usedByWordBank = input.usedByWordBank !== false;
  const usedByLessons = input.usedByLessons !== false;
  if (!usedByWordBank && !usedByLessons) {
    throw new Error("Category must be enabled for Word Bank, Lessons, or both.");
  }

  const slugBase = slugifyCategoryName(name);
  const existingByName = await prisma.gaCategory.findFirst({
    where: {
      OR: [
        { name: { equals: name, mode: "insensitive" } },
        { slug: slugBase },
      ],
    },
    select: { id: true },
  });
  if (existingByName) throw new Error("Category already exists.");

  return prisma.gaCategory.create({
    data: {
      name,
      slug: slugBase,
      description: toOptionalText(input.description),
      isActive: input.isActive !== false,
      isArchived: false,
      usedByWordBank,
      usedByLessons,
    },
    select: CATEGORY_SELECT,
  });
}

export async function updateGaCategory(id: string, input: GaCategoryUpdateInput) {
  const existing = await prisma.gaCategory.findUnique({ where: { id }, select: CATEGORY_SELECT });
  if (!existing) return null;

  const nextName = input.name === undefined ? existing.name : toCanonicalCategoryName(input.name);
  if (!nextName) throw new Error("Category name is required.");

  const usedByWordBank = input.usedByWordBank === undefined ? existing.usedByWordBank : input.usedByWordBank;
  const usedByLessons = input.usedByLessons === undefined ? existing.usedByLessons : input.usedByLessons;
  if (!usedByWordBank && !usedByLessons) {
    throw new Error("Category must be enabled for Word Bank, Lessons, or both.");
  }

  const isActive = input.isActive === undefined ? existing.isActive : input.isActive;
  const isArchived = input.isArchived === undefined ? existing.isArchived : input.isArchived;

  const [wordCount, lessonCount] = await Promise.all([
    prisma.gaWord.count({ where: { category: existing.name } }),
    prisma.gaLesson.count({ where: { category: existing.name } }),
  ]);

  if (!input.force && ((isArchived && !existing.isArchived) || (!isActive && existing.isActive)) && (wordCount > 0 || lessonCount > 0)) {
    throw new Error(`This category is currently in use by ${wordCount} words and ${lessonCount} lessons. Pass force=true to continue.`);
  }

  const slug = slugifyCategoryName(nextName);
  const conflict = await prisma.gaCategory.findFirst({
    where: {
      id: { not: id },
      OR: [
        { name: { equals: nextName, mode: "insensitive" } },
        { slug },
      ],
    },
    select: { id: true },
  });
  if (conflict) throw new Error("Another category already uses this name or slug.");

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.gaCategory.update({
      where: { id },
      data: {
        name: nextName,
        slug,
        description: input.description === undefined ? existing.description : toOptionalText(input.description),
        isActive,
        isArchived,
        usedByWordBank,
        usedByLessons,
      },
      select: CATEGORY_SELECT,
    });

    if (existing.name !== nextName) {
      await Promise.all([
        tx.gaWord.updateMany({ where: { category: existing.name }, data: { category: nextName } }),
        tx.gaLesson.updateMany({ where: { category: existing.name }, data: { category: nextName } }),
      ]);
    }

    return row;
  });

  return updated;
}
