import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const attempts = await prisma.attempt.findMany({
    where: { student: { parentId: parentScope.parentId } },
    select: { skillFocus: true, correct: true, subject: true, spellingMode: true },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const buckets = new Map<string, { total: number; correct: number }>();
  for (const attempt of attempts) {
    const key = attempt.skillFocus || "General";
    const existing = buckets.get(key) ?? { total: 0, correct: 0 };
    existing.total += 1;
    if (attempt.correct) existing.correct += 1;
    buckets.set(key, existing);
  }

  const strengths = Array.from(buckets.entries())
    .map(([topic, stats]) => ({ topic, score: stats.total ? stats.correct / stats.total : 0 }))
    .filter((item) => item.score >= 0.8)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  const weakAreas = Array.from(buckets.entries())
    .map(([topic, stats]) => ({ topic, score: stats.total ? stats.correct / stats.total : 0 }))
    .filter((item) => item.score < 0.6)
    .sort((left, right) => left.score - right.score)
    .map((item) => item.topic)
    .slice(0, 5);

  const modeBuckets = new Map<string, { total: number; correct: number }>();
  for (const attempt of attempts) {
    if (attempt.subject !== "spelling" || !attempt.spellingMode) continue;
    const existing = modeBuckets.get(attempt.spellingMode) ?? { total: 0, correct: 0 };
    existing.total += 1;
    if (attempt.correct) existing.correct += 1;
    modeBuckets.set(attempt.spellingMode, existing);
  }

  const modeStruggles = Array.from(modeBuckets.entries())
    .map(([mode, stats]) => ({ mode, accuracy: stats.total ? stats.correct / stats.total : 0, total: stats.total }))
    .filter((item) => item.total >= 2)
    .sort((left, right) => left.accuracy - right.accuracy || right.total - left.total)
    .slice(0, 3);

  return NextResponse.json({ strengths, weakAreas, modeStruggles });
}