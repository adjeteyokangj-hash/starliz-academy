import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { getStudentLearningBrain, toParentLearningBrainView } from "@/lib/student-learning-brain";
import { learningActivityTopicBuckets, type LearningActivityEvent } from "@/lib/learning-activity-aggregation";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const summaryMode = new URL(request.url).searchParams.get("summary") === "1";

  const childrenForParent = await prisma.childProfile.findMany({
    where: { parentId: parentScope.parentId, archived: false },
    select: { id: true, name: true },
  });

  const brainRows = await Promise.all(childrenForParent.map(async (child) => {
    const brain = await getStudentLearningBrain(child.id, { includeCoachSignals: !summaryMode });
    return brain ? { child, brain, parentBrain: toParentLearningBrainView(brain) } : null;
  }));
  const brainViews = brainRows.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const activityEvents: LearningActivityEvent[] = brainViews.flatMap(({ brain }) => [
    ...brain.source.attempts.map((attempt) => ({
      id: attempt.id,
      studentId: brain.studentId,
      source: "attempt" as const,
      topic: attempt.skill || attempt.topic || attempt.subject || "General",
      subject: attempt.subject || "general",
      correct: attempt.correct,
      completed: true,
      score: attempt.correct ? 100 : 0,
      createdAt: attempt.createdAt,
    })),
    ...brain.source.progressRecords.map((record) => ({
      id: record.id,
      studentId: brain.studentId,
      source: "progress_record" as const,
      topic: record.activityName || record.activityType || "General",
      subject: record.activityType || "general",
      correct: record.correct ?? null,
      completed: record.completed,
      score: typeof record.accuracy === "number"
        ? record.accuracy
        : typeof record.score === "number"
          ? record.score
          : record.correct === true
            ? 100
            : record.correct === false
              ? 0
              : null,
      createdAt: record.createdAt,
    })),
  ]);
  const allTopics = learningActivityTopicBuckets(activityEvents);

  const strengths = allTopics
    .filter((item) => item.accuracy >= 80)
    .slice(0, 5);

  const weaknesses = allTopics
    .filter((item) => item.accuracy < 80)
    .slice(0, 5);

  // Calculate overall metrics
  const scoredEvents = activityEvents.filter((event) => typeof event.score === "number");
  const totalAttempts = scoredEvents.length;
  const averageAccuracy = totalAttempts > 0
    ? Math.round(scoredEvents.reduce((sum, event) => sum + (event.score ?? 0), 0) / totalAttempts)
    : 0;

  // Get learning mode from mode struggles
  const modeBuckets = new Map<string, { total: number; correct: number }>();
  for (const attempt of brainViews.flatMap(({ brain }) => brain.source.attempts)) {
    if (attempt.subject !== "spelling" || !attempt.spellingMode) continue;
    const existing = modeBuckets.get(attempt.spellingMode) ?? { total: 0, correct: 0 };
    existing.total += 1;
    if (attempt.correct) existing.correct += 1;
    modeBuckets.set(attempt.spellingMode, existing);
  }

  const modeStruggles = Array.from(modeBuckets.entries())
    .map(([mode]) => mode)
    .slice(0, 1)[0] ?? null;

  let learningDna: Array<{
    childId: string;
    childName: string;
    totalAttempts?: number;
    enoughHistory?: boolean;
    readinessLabel?: string;
    fallbackMessage?: string | null;
    confidenceTrend?: number;
    preferredPace?: string;
    recommendations?: string[];
  }> = [];

  if (!summaryMode) {
    learningDna = brainViews
      .filter(({ parentBrain }) => Boolean(parentBrain.learningDna))
      .map(({ child, parentBrain }) => {
      return {
          childId: child.id,
          childName: child.name,
          ...parentBrain.learningDna,
          heartbeatSummary: parentBrain.heartbeatSummary,
          quickLevelFinderBaseline: parentBrain.quickLevelFinderBaseline,
          weakAreas: parentBrain.weakAreas,
          languageReadiness: parentBrain.languageReadiness,
        };
      });
  }

  // Calculate daily activity for the past 30 days
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const activityByDay = new Map<string, number>();
  let lastActivityAt: Date | null = null;
  
  for (const event of activityEvents) {
    const eventDate = new Date(event.createdAt);
    if (eventDate < thirtyDaysAgo) continue;
    const dateKey = eventDate.toISOString().split('T')[0]; // YYYY-MM-DD
    activityByDay.set(dateKey, (activityByDay.get(dateKey) ?? 0) + 1);
    
    if (!lastActivityAt || eventDate > lastActivityAt) {
      lastActivityAt = eventDate;
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
    learningDna,
  });
}
