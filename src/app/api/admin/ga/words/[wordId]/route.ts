import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { updateGaWord } from "@/lib/ga-word-bank";
import { listGaCategoryNamesForContext } from "@/lib/ga-categories";

const updateSchema = z.object({
  englishWord: z.string().trim().min(1).optional(),
  gaWord: z.string().trim().min(1).optional(),
  wordType: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  level: z.string().trim().min(1).optional(),
  sourceId: z.string().trim().optional().nullable(),
  sourcePage: z.number().int().optional().nullable(),
  reviewStatus: z.string().trim().optional().nullable(),
  audioStatus: z.string().trim().optional().nullable(),
  quizReady: z.boolean().optional(),
  storyReady: z.boolean().optional(),
  notes: z.string().trim().optional().nullable(),
}).refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field to update." });

type Context = { params: Promise<{ wordId: string }> };

function serializeWord<T extends { createdAt: Date; updatedAt: Date; source?: { createdAt: Date; updatedAt: Date } | null }>(word: T) {
  return {
    ...word,
    createdAt: word.createdAt.toISOString(),
    updatedAt: word.updatedAt.toISOString(),
    source: word.source ? { ...word.source, createdAt: word.source.createdAt.toISOString(), updatedAt: word.source.updatedAt.toISOString() } : null,
  };
}

export async function PATCH(request: Request, context: Context) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { wordId } = await context.params;
  try {
    const body = updateSchema.parse(await request.json());
    const allowedCategories = await listGaCategoryNamesForContext("word_bank", "active");
    const updated = await updateGaWord(wordId, body, { allowedCategories });
    if (!updated) return NextResponse.json({ error: "Ga word not found." }, { status: 404 });
    await writeAuditLog({
      actorUserId: session.userId,
      action: "ga_word.updated",
      entityType: "ga_word",
      entityId: updated.id,
      metadata: { englishWord: updated.englishWord, gaWord: updated.gaWord, reviewStatus: updated.reviewStatus, audioStatus: updated.audioStatus },
    });
    return NextResponse.json({ item: serializeWord(updated) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update Ga word." }, { status: 400 });
  }
}
