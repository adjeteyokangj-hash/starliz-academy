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
    select: { skillFocus: true, correct: true, subject: true, spellingMode: true, createdAt: true },
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

  const allTopics = Array.from(buckets.entries())
    .map(([topic, stats]) => {
      const accuracy = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;
      return { topic, accuracy, attempts: stats.total };
    })
    .sort((a, b) => b.accuracy - a.accuracy);

  const strengths = allTopics
    .filter((item) => item.accuracy >= 80)
    .slice(0, 5);

  const weaknesses = allTopics
    .filter((item) => item.accuracy < 80)
    .slice(0, 5);

  // Calculate overall metrics
  const totalAttempts = attempts.length;
  const correctAttempts = attempts.filter((a) => a.correct).length;
  const averageAccuracy = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;

  // Get learning mode from mode struggles
  const modeBuckets = new Map<string, { total: number; correct: number }>();
  for (const attempt of attempts) {
    if (attempt.subject !== "spelling" || !attempt.spellingMode) continue;
    const existing = modeBuckets.get(attempt.spellingMode) ?? { total: 0, correct: 0 };
    existing.total += 1;
    if (attempt.correct) existing.correct += 1;
    modeBuckets.set(attempt.spellingMode, existing);
  }

  const modeStruggles = Array.from(modeBuckets.entries())
    .map(([mode]) => mode)
    .slice(0, 1)[0] ?? null;

  // Calculate daily activity for the past 30 days
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const activityByDay = new Map<string, number>();
  let lastActivityAt: Date | null = null;
  
  for (const attempt of attempts) {
    if (attempt.createdAt < thirtyDaysAgo) continue;
    const dateKey = new Date(attempt.createdAt).toISOString().split('T')[0]; // YYYY-MM-DD
    activityByDay.set(dateKey, (activityByDay.get(dateKey) ?? 0) + 1);
    
    // Track the most recent attempt
    if (!lastActivityAt || attempt.createdAt > lastActivityAt) {
      lastActivityAt = attempt.createdAt;
    }
  }

  // Fill in missing days with zeros
  const activity: Array<{ date: string; count: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateKey = date.toISOString().split('T')[0];
    activity.push({ date: dateKey, count: activityByDay.get(dateKey) ?? 0 });
  }

  return NextResponse.json({
    strengths,
    weaknesses,
    averageAccuracy,
    totalAttempts,
    learningMode: modeStruggles,
    activity,
    lastActivityAt: lastActivityAt?.toISOString() ?? null,
  });
}