import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { getFinancialDashboardSnapshot } from "@/lib/billing/reconciliation";
import { buildLearningActivitySummaries } from "@/lib/learning-activity-aggregation";

type PrismaWithComms = typeof prisma & {
  adminEmail?: { count: (args: { where: { direction: string; isRead: boolean } }) => Promise<number> };
  parentMessageThread?: {
    count: (args?: { where?: { unreadCount?: { gt: number } } }) => Promise<number>;
    aggregate: (args: { _sum: { unreadCount: true } }) => Promise<{ _sum: { unreadCount: number | null } }>;
  };
};

function commsModel() {
  return prisma as PrismaWithComms;
}

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: string; message?: string };
  if (maybeError.code === "P2021" || maybeError.code === "P2022") return true;
  const message = String(maybeError.message ?? "").toLowerCase();
  return message.includes("does not exist") || message.includes("not found in the current database");
}

async function safeQuery<T>(label: string, query: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (isMissingTableError(error)) {
      console.warn(`Admin stats fallback for ${label}:`, error);
      return fallback;
    }
    throw error;
  }
}

export async function GET() {
  try {
    const { session, response } = await requireAdmin();
    if (!session) return response;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      totalChildren,
      recentProgress,
      recentAttempts,
      allChildren,
      lessonsCompleted,
      contentItems,
      recentRecords,
      recentAttemptRecords,
      rewards,
      storeItems,
      supportTickets,
      subscriptions,
      lessons,
      apiKeys,
      activeWeakAreas,
      inboxUnread,
      messageThreadsWithUnread,
      unreadMessagesAggregate,
      orphanedParentsCount,
      financialDashboard,
    ] = await Promise.all([
      prisma.user.count({ where: { role: "parent" } }),
      prisma.childProfile.count({ where: { archived: false } }),
      prisma.progressRecord.findMany({
        where: { createdAt: { gte: todayStart } },
        select: { childId: true },
      }),
      prisma.attempt.findMany({
        where: { createdAt: { gte: todayStart } },
        select: { studentId: true },
      }),
      prisma.childProfile.findMany({
        where: { archived: false },
        select: { snapshotJson: true },
      }),
      prisma.progressRecord.count({ where: { completed: true } }),
      prisma.aIContentCache.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, contentType: true, level: true, topic: true, contentJson: true, usedCount: true, createdAt: true, createdBy: true },
      }),
      prisma.progressRecord.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          child: { select: { name: true, parent: { select: { email: true } } } },
        },
      }),
      prisma.attempt.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          student: { select: { name: true, parent: { select: { email: true } } } },
        },
      }),
      Promise.all([
        safeQuery("rewardItem", () => prisma.rewardItem.count(), 0),
        safeQuery("rewardRule", () => prisma.rewardRule.count(), 0),
      ]).then(([items, rules]) => items + rules),
      safeQuery("storeItem", () => prisma.storeItem.count(), 0),
      safeQuery("supportTicket", () => prisma.supportTicket.count(), 0),
      safeQuery("subscription", () => prisma.subscription.count(), 0),
      safeQuery("lesson", () => prisma.lesson.count(), 0),
      safeQuery("apiKeyConfig", () => prisma.apiKeyConfig.findMany({ select: { provider: true, status: true, updatedAt: true } }), []),
      safeQuery(
        "weakArea",
        () =>
          prisma.weakArea.findMany({
            where: { status: "active" },
            include: { student: { select: { id: true, name: true } } },
            orderBy: [{ accuracy: "asc" }, { lastDetectedAt: "desc" }],
            take: 20,
          }),
        []
      ),
      commsModel().adminEmail?.count({ where: { direction: "inbox", isRead: false } }) ?? Promise.resolve(0),
      commsModel().parentMessageThread?.count({ where: { unreadCount: { gt: 0 } } }) ?? Promise.resolve(0),
      commsModel().parentMessageThread?.aggregate({ _sum: { unreadCount: true } }) ?? Promise.resolve({ _sum: { unreadCount: 0 } }),
      prisma.user.count({
        where: {
          role: "parent",
          parentProfile: null,
        },
      }),
      safeQuery(
        "financialDashboard",
        () => getFinancialDashboardSnapshot(),
        {
          todayRevenue: 0,
          monthlyRevenue: 0,
          vatCollected: 0,
          failedPayments: 0,
          pendingSyncs: 0,
          reconciliationStatus: "unavailable",
          mrr: 0,
          arr: 0,
          churn: 0,
          taxLiabilityEstimate: 0,
        },
      ),
    ]);

    const todayActivity = buildLearningActivitySummaries({
      studentIds: [],
      attempts: recentAttempts.map((attempt) => ({
        id: attempt.studentId,
        studentId: attempt.studentId,
        subject: "activity",
        skillFocus: null,
        correct: true,
        createdAt: todayStart,
      })),
      progressRecords: recentProgress.map((record) => ({
        id: record.childId,
        childId: record.childId,
        activityType: "activity",
        activityName: "Activity",
        correct: true,
        completed: true,
        score: 100,
        accuracy: 100,
        createdAt: todayStart,
      })),
      today: todayStart,
    });
    const activeToday = [...todayActivity.values()].filter((summary) => summary.activeToday).length;

    const patternCounts: Record<string, number> = {};
    for (const child of allChildren) {
      if (!child.snapshotJson) continue;
      try {
        const snap = JSON.parse(child.snapshotJson);
        const patterns = snap.spellingPatterns as Record<string, number> | undefined;
        if (patterns) {
          for (const [pattern, count] of Object.entries(patterns)) {
            patternCounts[pattern] = (patternCounts[pattern] ?? 0) + count;
          }
        }
      } catch {
        // skip malformed snapshots
      }
    }

    const weakestPatterns = Object.entries(patternCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pattern, count]) => ({ pattern, count }));

    const [allProgressForAccuracy, allAttemptsForAccuracy] = await Promise.all([
      prisma.progressRecord.findMany({
        select: { id: true, childId: true, activityType: true, activityName: true, correct: true, completed: true, score: true, accuracy: true, createdAt: true },
        take: 5000,
        orderBy: { createdAt: "desc" },
      }),
      prisma.attempt.findMany({
        select: { id: true, studentId: true, subject: true, skillFocus: true, correct: true, createdAt: true },
        take: 5000,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const aggregateAccuracy = [...buildLearningActivitySummaries({
      studentIds: [],
      attempts: allAttemptsForAccuracy,
      progressRecords: allProgressForAccuracy,
    }).values()].flatMap((summary) => summary.events).filter((event) => typeof event.score === "number");
    const avgAccuracy = aggregateAccuracy.length
      ? Math.round(aggregateAccuracy.reduce((sum, event) => sum + (event.score ?? 0), 0) / aggregateAccuracy.length)
      : 0;
    const wordsGenerated = contentItems.reduce((total, item) => {
      try {
        const parsed = JSON.parse(item.contentJson);
        return total + (Array.isArray(parsed) ? parsed.length : 1);
      } catch {
        return total + 1;
      }
    }, 0);

    const generatedContent = contentItems.slice(0, 5).map((item) => ({
      id: item.id,
      contentType: item.contentType,
      level: item.level,
      topic: item.topic,
      usedCount: item.usedCount,
      createdAt: item.createdAt.toISOString(),
      createdBy: item.createdBy,
    }));

    const recentActivity = [
      ...recentRecords.map((record) => ({
        id: record.id,
        childName: record.child.name,
        parentEmail: record.child.parent.email,
        activityType: record.activityType,
        activityName: record.activityName,
        accuracy: record.accuracy,
        correct: record.correct,
        completed: record.completed,
        createdAt: record.createdAt.toISOString(),
      })),
      ...recentAttemptRecords.map((attempt) => ({
        id: attempt.id,
        childName: attempt.student.name,
        parentEmail: attempt.student.parent.email,
        activityType: attempt.subject,
        activityName: attempt.skillFocus || attempt.subject,
        accuracy: attempt.correct ? 100 : 0,
        correct: attempt.correct,
        completed: true,
        createdAt: attempt.createdAt.toISOString(),
      })),
    ]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 8);

    const recentSessionSignals = await prisma.progressRecord.findMany({
      where: { completed: true },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { notes: true },
    });

    let confidenceImprovingCount = 0;
    let confidenceNeedsSupportCount = 0;
    let engagementHighCount = 0;
    let frustrationHighCount = 0;
    const moodCounts: Record<string, number> = {};

    for (const row of recentSessionSignals) {
      try {
        const parsed = JSON.parse(String(row.notes ?? "{}")) as {
          sessionSignals?: {
            learningConfidence?: string;
            engagementLevel?: string;
            frustrationSignals?: string;
            emotionalMood?: string | null;
          };
        };
        const signals = parsed.sessionSignals;
        if (!signals) continue;

        if (signals.learningConfidence === "improving" || signals.learningConfidence === "mastering") {
          confidenceImprovingCount += 1;
        }
        if (signals.learningConfidence === "needs_support") {
          confidenceNeedsSupportCount += 1;
        }
        if (signals.engagementLevel === "high") {
          engagementHighCount += 1;
        }
        if (signals.frustrationSignals === "high") {
          frustrationHighCount += 1;
        }
        if (signals.emotionalMood) {
          moodCounts[signals.emotionalMood] = (moodCounts[signals.emotionalMood] ?? 0) + 1;
        }
      } catch {
        // ignore malformed notes payloads
      }
    }

    const dominantMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "neutral";
    const confidenceTrend = confidenceImprovingCount >= confidenceNeedsSupportCount ? "Improving" : "Needs support";
    const frustrationTrend = frustrationHighCount > 6 ? "High" : frustrationHighCount > 2 ? "Medium" : "Low";
    const engagementTrend = engagementHighCount > 10 ? "High" : engagementHighCount > 4 ? "Medium" : "Low";

    return NextResponse.json({
      totalUsers,
      totalChildren,
      activeToday,
      avgAccuracy,
      lessonsCompleted,
      wordsGenerated,
      subscriptions,
      lessons,
      rewards,
      storeItems,
      supportTickets,
      inboxUnread,
      messageThreadsWithUnread,
      messagesUnread: unreadMessagesAggregate?._sum?.unreadCount ?? 0,
      apiKeyStatuses: Object.fromEntries(apiKeys.map((key) => [key.provider, key.status])),
      weakestPatterns,
      generatedContent,
      recentActivity,
      studentsNeedingSupport: new Set(activeWeakAreas.map((area) => area.studentId)).size,
      topWeakSkillFocus: Object.entries(activeWeakAreas.reduce<Record<string, number>>((acc, area) => {
        acc[area.skillFocus] = (acc[area.skillFocus] ?? 0) + 1;
        return acc;
      }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([skillFocus, count]) => ({ skillFocus, count })),
      weakAreaStudents: activeWeakAreas.slice(0, 5).map((area) => ({
        id: area.id,
        studentId: area.studentId,
        studentName: area.student.name,
        subject: area.subject,
        skillFocus: area.skillFocus,
        accuracy: area.accuracy,
        weaknessType: area.weaknessType,
      })),
      sessionSignalsSummary: {
        confidenceTrend,
        engagementLevel: engagementTrend,
        frustrationSignals: frustrationTrend,
        dominantMood,
      },
      healthCheck: {
        orphanedParentsCount,
        orphanedParentsStatus: orphanedParentsCount === 0 ? "healthy" : "warning",
      },
      financialDashboard,
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load admin stats.",
      },
      { status: 500 }
    );
  }
}
