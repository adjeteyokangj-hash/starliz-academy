import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { getDictionaryWordByContext } from "@/lib/dictionary";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const { searchParams } = new URL(request.url);
  const word = searchParams.get("word");
  const subject = searchParams.get("subject");
  const keyStage = searchParams.get("keyStage");
  const yearGroup = searchParams.get("yearGroup");
  const topic = searchParams.get("topic");

  const entry = await getDictionaryWordByContext({ word, subject, keyStage, yearGroup, topic, active: true });
  if (!entry) {
    return NextResponse.json({ word: null });
  }

  return NextResponse.json({
    word: {
      ...entry,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    },
  });
}
