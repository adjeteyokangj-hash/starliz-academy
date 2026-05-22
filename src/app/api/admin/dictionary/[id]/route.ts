import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { deactivateDictionaryWord, getDictionaryWordById, updateDictionaryWord } from "@/lib/dictionary";

const updateSchema = z.object({
  word: z.string().trim().min(1).optional(),
  subject: z.string().trim().min(1).optional(),
  keyStage: z.string().trim().min(1).optional(),
  yearGroup: z.string().trim().optional().nullable(),
  difficulty: z.string().trim().optional().nullable(),
  topic: z.string().trim().optional().nullable(),
  skillFocus: z.string().trim().optional().nullable(),
  definitionChild: z.string().trim().min(1).optional(),
  definitionParent: z.string().trim().optional().nullable(),
  exampleSentence: z.string().trim().optional().nullable(),
  secondExampleSentence: z.string().trim().optional().nullable(),
  phonicsPattern: z.string().trim().optional().nullable(),
  syllables: z.string().trim().optional().nullable(),
  pronunciationHint: z.string().trim().optional().nullable(),
  synonyms: z.union([z.string(), z.array(z.string())]).optional().nullable(),
  antonyms: z.union([z.string(), z.array(z.string())]).optional().nullable(),
  relatedWords: z.union([z.string(), z.array(z.string())]).optional().nullable(),
  isTrickyWord: z.boolean().optional(),
  isTopicKeyword: z.boolean().optional(),
  isMathsKeyword: z.boolean().optional(),
  isScienceKeyword: z.boolean().optional(),
  isReadingKeyword: z.boolean().optional(),
  isSpellingKeyword: z.boolean().optional(),
  interventionTags: z.union([z.string(), z.array(z.string())]).optional().nullable(),
  senTags: z.union([z.string(), z.array(z.string())]).optional().nullable(),
  safeguardingTags: z.union([z.string(), z.array(z.string())]).optional().nullable(),
  curriculumTags: z.union([z.string(), z.array(z.string())]).optional().nullable(),
  importSource: z.string().trim().optional().nullable(),
  active: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field to update." });

type Context = { params: Promise<{ id: string }> };

function serializeWord(word: Awaited<ReturnType<typeof updateDictionaryWord>> | Awaited<ReturnType<typeof deactivateDictionaryWord>>) {
  if (!word) return null;
  return {
    ...word,
    createdAt: word.createdAt.toISOString(),
    updatedAt: word.updatedAt.toISOString(),
  };
}

export async function GET(_request: Request, context: Context) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { id } = await context.params;
  const word = await getDictionaryWordById(id);
  if (!word) return NextResponse.json({ error: "Dictionary word not found." }, { status: 404 });
  return NextResponse.json({ item: serializeWord(word) });
}

export async function PATCH(request: Request, context: Context) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { id } = await context.params;
  try {
    const body = updateSchema.parse(await request.json());
    const updated = await updateDictionaryWord(id, body, {
      actorUserId: session.userId,
      importSource: body.importSource,
    });
    if (!updated) return NextResponse.json({ error: "Dictionary word not found." }, { status: 404 });

    await writeAuditLog({
      actorUserId: session.userId,
      action: body.active === false ? "dictionary.deactivated" : "dictionary.updated",
      entityType: "dictionary_word",
      entityId: updated.id,
      metadata: {
        word: updated.word,
        subject: updated.subject,
        keyStage: updated.keyStage,
        active: updated.active,
        importSource: updated.importSource,
      },
    });

    return NextResponse.json({ item: serializeWord(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update dictionary word.";
    const status = message.includes("Duplicate dictionary word") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, context: Context) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { id } = await context.params;
  const deactivated = await deactivateDictionaryWord(id, session.userId);
  if (!deactivated) return NextResponse.json({ error: "Dictionary word not found." }, { status: 404 });

  await writeAuditLog({
    actorUserId: session.userId,
    action: "dictionary.deactivated",
    entityType: "dictionary_word",
    entityId: deactivated.id,
    metadata: { word: deactivated.word, subject: deactivated.subject, keyStage: deactivated.keyStage, active: deactivated.active },
  });

  return NextResponse.json({ item: serializeWord(deactivated) });
}
