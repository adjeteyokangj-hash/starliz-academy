import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { createGaWord, getGaWordMetrics, isGaWordSchemaNotReadyError, listGaWords } from "@/lib/ga-word-bank";
import { listGaCategoryNamesForContext } from "@/lib/ga-categories";

const querySchema = z.object({
  q: z.string().optional(),
  reviewStatus: z.string().optional(),
  category: z.string().optional(),
  level: z.string().optional(),
  wordType: z.string().optional(),
  sourcePage: z.string().optional(),
  audioStatus: z.string().optional(),
  quizReady: z.string().optional(),
  storyReady: z.string().optional(),
  limit: z.string().optional(),
});

const wordSchema = z.object({
  englishWord: z.string().trim().min(1),
  gaWord: z.string().trim().min(1),
  wordType: z.string().trim().min(1),
  category: z.string().trim().min(1),
  level: z.string().trim().min(1),
  sourceId: z.string().trim().optional().nullable(),
  sourcePage: z.number().int().optional().nullable(),
  reviewStatus: z.string().trim().optional().nullable(),
  audioStatus: z.string().trim().optional().nullable(),
  quizReady: z.boolean().optional(),
  storyReady: z.boolean().optional(),
  notes: z.string().trim().optional().nullable(),
});

function parseBoolean(value: string | undefined): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function serializeWord<T extends { createdAt: Date; updatedAt: Date; source?: { createdAt: Date; updatedAt: Date } | null }>(word: T) {
  return {
    ...word,
    createdAt: word.createdAt.toISOString(),
    updatedAt: word.updatedAt.toISOString(),
    source: word.source ? { ...word.source, createdAt: word.source.createdAt.toISOString(), updatedAt: word.source.updatedAt.toISOString() } : null,
  };
}

export async function GET(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.parse(Object.fromEntries(searchParams.entries()));
    const items = await listGaWords({
      q: parsed.q,
      reviewStatus: parsed.reviewStatus,
      category: parsed.category,
      level: parsed.level,
      wordType: parsed.wordType,
      sourcePage: parsed.sourcePage ? Number(parsed.sourcePage) : undefined,
      audioStatus: parsed.audioStatus,
      quizReady: parseBoolean(parsed.quizReady),
      storyReady: parseBoolean(parsed.storyReady),
      limit: parsed.limit ? Number(parsed.limit) : undefined,
    });
    const metrics = await getGaWordMetrics();
    return NextResponse.json({ items: items.map(serializeWord), metrics });
  } catch (error) {
    if (isGaWordSchemaNotReadyError(error)) {
      return NextResponse.json({
        items: [],
        metrics: { totalWords: 0, approvedWords: 0, pendingReview: 0, audioApproved: 0 },
        warning: "Ga Word tables are not ready yet. Apply migrations to enable full data.",
      });
    }
    return NextResponse.json({ error: "Unable to load Ga words." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const body = wordSchema.parse(await request.json());
    const allowedCategories = await listGaCategoryNamesForContext("word_bank", "active");
    const created = await createGaWord(body, { allowedCategories });
    await writeAuditLog({
      actorUserId: session.userId,
      action: "ga_word.created",
      entityType: "ga_word",
      entityId: created.id,
      metadata: { englishWord: created.englishWord, gaWord: created.gaWord, reviewStatus: created.reviewStatus, sourcePage: created.sourcePage },
    });
    return NextResponse.json({ item: serializeWord(created) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create Ga word." }, { status: 400 });
  }
}
