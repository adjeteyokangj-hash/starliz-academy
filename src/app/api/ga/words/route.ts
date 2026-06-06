import { NextResponse } from "next/server";
import { z } from "zod";
import { listGaWords, toStudentSafeGaWord } from "@/lib/ga-word-bank";

const querySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  level: z.string().optional(),
  wordType: z.string().optional(),
  quizReady: z.string().optional(),
  storyReady: z.string().optional(),
  limit: z.string().optional(),
});

function parseBoolean(value: string | undefined): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.parse(Object.fromEntries(searchParams.entries()));
  const items = await listGaWords({
    q: parsed.q,
    category: parsed.category,
    level: parsed.level,
    wordType: parsed.wordType,
    quizReady: parseBoolean(parsed.quizReady),
    storyReady: parseBoolean(parsed.storyReady),
    approvedOnly: true,
    limit: parsed.limit ? Number(parsed.limit) : undefined,
  });

  return NextResponse.json({
    items: items.map(toStudentSafeGaWord).filter((word) => word !== null),
  });
}
