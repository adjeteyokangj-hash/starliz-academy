import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { getStudentLearningBrain, toParentLearningBrainView } from "@/lib/student-learning-brain";
import { buildLearningActivitySummaries, learningActivityTopicBuckets } from "@/lib/learning-activity-aggregation";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const summaryMode = new URL(request.url).searchParams.get("summary") === "1";

  const attempts = await prisma.attempt.findMany({
    where: { student: { parentId: parentScope.parentId } },
    select: { id: true, studentId: true, skillFocus: true, correct: true, subject: true, spellingMode: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: summaryMode ? 120 : 300,
  });

  const childIds = [...new Set(attempts.map((attempt) => attempt.studentId))];
  const childrenForParent = await prisma.childProfile.findMany({
    where: { parentId: parentScope.parentId, archived: false },
    select: { id: true, name: true, studentProfile: { select: { aiLearningProfileJson: true } } },
  });
  for (const child of childrenForParent) childIds.push(child.id);

  const progressRecords = await prisma.progressRecord.findMany({
    where: { childId: { in: childIds } },
    select: { id: true, childId: true, activityType: true, activityName: true, correct: true, completed: true, score: true, accuracy: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: summaryMode ? 120 : 300,
  });

  const activitySummaries = buildLearningActivitySummaries({
    studentIds: childIds,
    attempts,
    progressRecords,
    profiles: childrenForParent.map((child) => ({
      studentId: child.id,
      aiLearningProfileJson: child.studentProfile?.aiLearningProfileJson ?? null,
    })),
  });
  const activityEvents = [...activitySummaries.values()].flatMap((summary) => summary.events);
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
    const brainViews = await Promise.all(childrenForParent.map(async (child) => {
      const brain = await getStudentLearningBrain(child.id, { includeCoachSignals: true });
      if (!brain) return null;
      const parentBrain = toParentLearningBrainView(brain);
      if (!parentBrain.learningDna) return null;
      return {
          childId: child.id,
          childName: child.name,
          ...parentBrain.learningDna,
          heartbeatSummary: parentBrain.heartbeatSummary,
          quickLevelFinderBaseline: parentBrain.quickLevelFinderBaseline,
          weakAreas: parentBrain.weakAreas,
          languageReadiness: parentBrain.languageReadiness,
        };
    }));

    learningDna = brainViews.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
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
