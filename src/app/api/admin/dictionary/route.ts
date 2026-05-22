import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { createDictionaryWord, getDictionaryDashboardMetrics, listDictionaryWords } from "@/lib/dictionary";

const querySchema = z.object({
  q: z.string().optional(),
  subject: z.string().optional(),
  keyStage: z.string().optional(),
  yearGroup: z.string().optional(),
  difficulty: z.string().optional(),
  topic: z.string().optional(),
  tricky: z.string().optional(),
  topicKeyword: z.string().optional(),
  active: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

const arraySchema = z.union([z.string(), z.array(z.string())]).optional().nullable();

const createSchema = z.object({
  word: z.string().trim().min(1),
  subject: z.string().trim().min(1),
  keyStage: z.string().trim().min(1),
  yearGroup: z.string().trim().optional().nullable(),
  difficulty: z.string().trim().optional().nullable(),
  topic: z.string().trim().optional().nullable(),
  skillFocus: z.string().trim().optional().nullable(),
  definitionChild: z.string().trim().min(1),
  definitionParent: z.string().trim().optional().nullable(),
  exampleSentence: z.string().trim().optional().nullable(),
  secondExampleSentence: z.string().trim().optional().nullable(),
  phonicsPattern: z.string().trim().optional().nullable(),
  syllables: z.string().trim().optional().nullable(),
  pronunciationHint: z.string().trim().optional().nullable(),
  synonyms: arraySchema,
  antonyms: arraySchema,
  relatedWords: arraySchema,
  easierWords: arraySchema,
  harderWords: arraySchema,
  prerequisiteWords: arraySchema,
  relatedMathConcepts: arraySchema,
  phonicsFamilies: arraySchema,
  spellingFamilies: arraySchema,
  curriculumTopics: arraySchema,
  interventionPaths: arraySchema,
  isTrickyWord: z.boolean().optional(),
  isTopicKeyword: z.boolean().optional(),
  isMathsKeyword: z.boolean().optional(),
  isScienceKeyword: z.boolean().optional(),
  isReadingKeyword: z.boolean().optional(),
  isSpellingKeyword: z.boolean().optional(),
  interventionTags: arraySchema,
  senTags: arraySchema,
  safeguardingTags: arraySchema,
  curriculumTags: arraySchema,
  active: z.boolean().optional(),
  importSource: z.string().trim().optional().nullable(),
});

function parseBoolean(value: string | null): boolean | null {
  if (value === null) return null;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function serializeWord(word: Awaited<ReturnType<typeof listDictionaryWords>>["items"][number]) {
  return {
    ...word,
    createdAt: word.createdAt.toISOString(),
    updatedAt: word.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.parse(Object.fromEntries(searchParams.entries()));
  const active = parsed.active === undefined ? undefined : parseBoolean(parsed.active ?? null) ?? undefined;

  const result = await listDictionaryWords({
    q: parsed.q,
    subject: parsed.subject,
    keyStage: parsed.keyStage,
    yearGroup: parsed.yearGroup,
    difficulty: parsed.difficulty,
    topic: parsed.topic,
    isTrickyWord: parseBoolean(parsed.tricky ?? null),
    isTopicKeyword: parseBoolean(parsed.topicKeyword ?? null),
    active,
    page: parsed.page ? Number(parsed.page) : undefined,
    limit: parsed.limit ? Number(parsed.limit) : undefined,
  });
  const metrics = await getDictionaryDashboardMetrics();

  return NextResponse.json({
    items: result.items.map(serializeWord),
    total: result.total,
    page: result.page,
    limit: result.limit,
    metrics,
  });
}

export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const body = createSchema.parse(await request.json());
    const created = await createDictionaryWord(body, {
      actorUserId: session.userId,
      importSource: body.importSource,
    });

    await writeAuditLog({
      actorUserId: session.userId,
      action: "dictionary.created",
      entityType: "dictionary_word",
      entityId: created.id,
      metadata: {
        word: created.word,
        subject: created.subject,
        keyStage: created.keyStage,
        importSource: created.importSource,
        interventionTags: created.interventionTags,
        senTags: created.senTags,
        safeguardingTags: created.safeguardingTags,
        curriculumTags: created.curriculumTags,
      },
    });

    return NextResponse.json({ item: serializeWord(created) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create dictionary word.";
    const status = message.includes("Duplicate dictionary word") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
