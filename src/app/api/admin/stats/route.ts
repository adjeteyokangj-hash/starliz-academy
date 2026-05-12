import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";

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
      Promise.all([prisma.rewardItem.count(), prisma.rewardRule.count()]).then(([items, rules]) => items + rules),
      prisma.storeItem.count(),
      prisma.supportTicket.count(),
      prisma.subscription.count(),
      prisma.lesson.count(),
      prisma.apiKeyConfig.findMany({ select: { provider: true, status: true, updatedAt: true } }),
      prisma.weakArea.findMany({
        where: { status: "active" },
        include: { student: { select: { id: true, name: true } } },
        orderBy: [{ accuracy: "asc" }, { lastDetectedAt: "desc" }],
        take: 20,
      }),
      commsModel().adminEmail?.count({ where: { direction: "inbox", isRead: false } }) ?? Promise.resolve(0),
      commsModel().parentMessageThread?.count({ where: { unreadCount: { gt: 0 } } }) ?? Promise.resolve(0),
      commsModel().parentMessageThread?.aggregate({ _sum: { unreadCount: true } }) ?? Promise.resolve({ _sum: { unreadCount: 0 } }),
      prisma.user.count({
        where: {
          role: "parent",
          parentProfile: null,
        },
      }),
    ]);

    const activeToday = new Set([...recentProgress.map((p) => p.childId), ...recentAttempts.map((attempt) => attempt.studentId)]).size;

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

    const [totalCorrect, totalAttempts, attemptCorrect, attemptTotal] = await Promise.all([
      prisma.progressRecord.count({ where: { correct: true } }),
      prisma.progressRecord.count(),
      prisma.attempt.count({ where: { correct: true } }),
      prisma.attempt.count(),
    ]);

    const combinedAttempts = attemptTotal || totalAttempts;
    const combinedCorrect = attemptTotal ? attemptCorrect : totalCorrect;
    const avgAccuracy = combinedAttempts > 0 ? Math.round((combinedCorrect / combinedAttempts) * 100) : 0;
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

    const recentActivity = recentRecords.map((record) => ({
      id: record.id,
      childName: record.child.name,
      parentEmail: record.child.parent.email,
      activityType: record.activityType,
      activityName: record.activityName,
      accuracy: record.accuracy,
      correct: record.correct,
      completed: record.completed,
      createdAt: record.createdAt.toISOString(),
    }));

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
