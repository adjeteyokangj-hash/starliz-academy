import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { buildCoachWordHelpResponse } from "@/lib/coachDictionary";
import type { CoachWordHelpResponse } from "@/lib/coachDictionary";
import { buildKnowledgeGraph } from "@/lib/knowledge_graph";
import { countDictionaryWordsForGraph, listDictionaryWords } from "@/lib/dictionary";

const querySchema = z.object({
  q: z.string().optional(),
  subject: z.string().optional(),
  keyStage: z.string().optional(),
  yearGroup: z.string().optional(),
  school: z.string().optional(),
  interventionType: z.string().optional(),
  depth: z.coerce.number().int().min(1).max(6).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(25).max(600).optional(),
  recoveryWord: z.string().optional(),
});

export async function GET(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.parse(Object.fromEntries(searchParams.entries()));

  const limit = parsed.limit ?? 250;
  const offset = parsed.offset ?? 0;
  const depth = parsed.depth ?? 2;

  const [totalWords, listPayload] = await Promise.all([
    countDictionaryWordsForGraph({
      q: parsed.q,
      subject: parsed.subject,
      keyStage: parsed.keyStage,
      yearGroup: parsed.yearGroup,
      active: true,
    }),
    listDictionaryWords({
      q: parsed.q,
      subject: parsed.subject,
      keyStage: parsed.keyStage,
      yearGroup: parsed.yearGroup,
      active: true,
      skip: offset,
      limit,
    }),
  ]);

  const graph = buildKnowledgeGraph({
    words: listPayload.items,
    search: parsed.q,
    depthLimit: depth,
    offset: 0,
    limit,
  });

  let recoveryPath: CoachWordHelpResponse["recoveryPlan"] | null = null;

  if (parsed.recoveryWord) {
    const coachResponse = await buildCoachWordHelpResponse({
      word: parsed.recoveryWord,
      subject: parsed.subject,
      keyStage: parsed.keyStage,
      yearGroup: parsed.yearGroup,
      supportLevel: 2,
    });
    recoveryPath = coachResponse.recoveryPlan;
  }

  const hasMore = offset + listPayload.items.length < totalWords;

  return NextResponse.json({
    nodes: graph.nodes,
    edges: graph.edges,
    metrics: {
      ...graph.metrics,
      totalWords,
    },
    recoveryPath,
    pagination: {
      offset,
      limit,
      returned: listPayload.items.length,
      totalWords,
      hasMore,
    },
    filtersApplied: {
      subject: parsed.subject ?? null,
      keyStage: parsed.keyStage ?? null,
      yearGroup: parsed.yearGroup ?? null,
      school: parsed.school ?? null,
      interventionType: parsed.interventionType ?? null,
      depth,
      q: parsed.q ?? null,
    },
  });
}
