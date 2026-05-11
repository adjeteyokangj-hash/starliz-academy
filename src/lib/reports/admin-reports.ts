import { prisma } from "@/lib/db";

export async function buildAdminReports() {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [parents, students, progress, subscriptions, aiContent, lessons, rewards, storeItems, supportTickets] = await Promise.all([
    prisma.user.count({ where: { role: "parent" } }),
    prisma.childProfile.count({ where: { archived: false } }),
    prisma.progressRecord.findMany({ where: { createdAt: { gte: since } }, include: { child: { select: { name: true, parentId: true } } } }),
    prisma.subscription.findMany(),
    prisma.aIContentCache.findMany(),
    prisma.lesson.count(),
    prisma.rewardRule.count(),
    prisma.storeItem.count(),
    prisma.supportTicket.count({ where: { status: { not: "closed" } } }),
  ]);

  const correct = progress.filter((record) => record.correct).length;
  const completed = progress.filter((record) => record.completed).length;
  const avgAccuracy = progress.length ? Math.round((correct / progress.length) * 100) : 0;
  const activeStudents = new Set(progress.map((record) => record.childId)).size;
  const activeParents = new Set(progress.map((record) => record.child.parentId)).size;
  const activeSubscriptions = subscriptions.filter((sub) => ["active", "trialing"].includes(sub.status)).length;
  const estimatedAiCostPence = aiContent.reduce((total, item) => total + item.usedCount, 0) * 0.5 + aiContent.length * 2;

  const weakTopics = Object.entries(
    progress
      .filter((record) => record.correct === false)
      .reduce<Record<string, number>>((acc, record) => {
        // activityName can be a raw JSON string for lesson/boss_battle types — extract a readable label
        let label = record.activityName;
        if (label.trim().startsWith("{")) {
          try {
            const parsed = JSON.parse(label) as Record<string, unknown>;
            label = String(parsed.type ?? parsed.title ?? parsed.subject ?? record.activityType);
          } catch {
            label = record.activityType;
          }
        }
        if (label.length > 60) label = label.slice(0, 57) + "…";
        const key = `${record.activityType}: ${label}`;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic, count]) => ({ topic, count }));

  return {
    generatedAt: new Date().toISOString(),
    overview: { parents, students, activeStudents, activeParents, avgAccuracy, completed, activeSubscriptions, lessons, rewards, storeItems, supportTickets },
    ai: { contentItems: aiContent.length, estimatedCostPence: Math.round(estimatedAiCostPence), totalUses: aiContent.reduce((total, item) => total + item.usedCount, 0) },
    weakTopics,
    subscriptions: subscriptions.map((sub) => ({ parentId: sub.parentId, planKey: sub.planKey, status: sub.status, trialEndsAt: sub.trialEndsAt?.toISOString() ?? null })),
  };
}

export function reportsToCsv(report: Awaited<ReturnType<typeof buildAdminReports>>) {
  const rows = [
    ["metric", "value"],
    ...Object.entries(report.overview).map(([key, value]) => [key, String(value)]),
    ["aiContentItems", String(report.ai.contentItems)],
    ["aiEstimatedCostPence", String(report.ai.estimatedCostPence)],
    ["aiTotalUses", String(report.ai.totalUses)],
    [],
    ["weakTopic", "misses"],
    ...report.weakTopics.map((topic) => [topic.topic, String(topic.count)]),
  ];
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}
