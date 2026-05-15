import { prisma } from "@/lib/db";
import { keyStageForYearGroup, normalizeExamBoard } from "@/lib/curriculum";

export type AdminReportFilters = {
  keyStage?: string;
  yearGroup?: string;
  examBoard?: string;
};

function parseContentMetadata(raw: string | null): { examBoard: string | null } {
  if (!raw) return { examBoard: null };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      examBoard: normalizeExamBoard(typeof parsed.examBoard === "string" ? parsed.examBoard : null),
    };
  } catch {
    return { examBoard: null };
  }
}

export async function buildAdminReports(filters: AdminReportFilters = {}) {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const examBoardFilter = normalizeExamBoard(filters.examBoard ?? null);
  const yearGroupFilter = filters.yearGroup?.trim() ?? "";
  const keyStageFilter = filters.keyStage?.trim() ?? "";

  const [parents, students, progress, subscriptions, aiContent, lessons, rewards, storeItems, supportTickets, attempts, assignments] = await Promise.all([
    prisma.user.count({ where: { role: "parent" } }),
    prisma.childProfile.count({ where: { archived: false } }),
    prisma.progressRecord.findMany({ where: { createdAt: { gte: since } }, include: { child: { select: { name: true, parentId: true, yearGroup: true } } } }),
    prisma.subscription.findMany(),
    prisma.aIContentCache.findMany(),
    prisma.lesson.count(),
    prisma.rewardRule.count(),
    prisma.storeItem.count(),
    prisma.supportTicket.count({ where: { status: { not: "closed" } } }),
    prisma.attempt.findMany({
      where: { createdAt: { gte: since }, assignmentId: { not: null }, correct: false },
      select: { assignmentId: true, subject: true, skillFocus: true, questionText: true, correctAnswer: true },
    }),
    prisma.assignment.findMany({
      where: { updatedAt: { gte: since } },
      select: {
        id: true,
        student: { select: { yearGroup: true } },
        content: { select: { metadataJson: true } },
      },
    }),
  ]);

  const assignmentMetaMap = new Map<string, { yearGroup: string; keyStage: string; examBoard: string | null }>();
  for (const assignment of assignments) {
    const yearGroup = assignment.student.yearGroup ?? "";
    assignmentMetaMap.set(assignment.id, {
      yearGroup,
      keyStage: keyStageForYearGroup(yearGroup),
      examBoard: parseContentMetadata(assignment.content.metadataJson).examBoard,
    });
  }

  const filteredProgress = progress.filter((record) => {
    const yearGroup = record.child.yearGroup ?? "";
    const keyStage = keyStageForYearGroup(yearGroup);
    const matchesYear = !yearGroupFilter || yearGroup === yearGroupFilter;
    const matchesStage = !keyStageFilter || keyStage === keyStageFilter;
    return matchesYear && matchesStage;
  });

  const filteredAiContent = aiContent.filter((item) => {
    const itemKeyStage = item.keyStage ?? "";
    const itemYearGroup = item.yearGroup ?? "";
    const itemExamBoard = parseContentMetadata(item.metadataJson).examBoard;
    const matchesYear = !yearGroupFilter || itemYearGroup === yearGroupFilter;
    const matchesStage = !keyStageFilter || itemKeyStage === keyStageFilter;
    const matchesBoard = !examBoardFilter || itemExamBoard === examBoardFilter;
    return matchesYear && matchesStage && matchesBoard;
  });

  const filteredWeakAttempts = attempts.filter((attempt) => {
    const assignmentId = attempt.assignmentId;
    if (!assignmentId) return false;
    const meta = assignmentMetaMap.get(assignmentId);
    if (!meta) return false;
    const matchesYear = !yearGroupFilter || meta.yearGroup === yearGroupFilter;
    const matchesStage = !keyStageFilter || meta.keyStage === keyStageFilter;
    const matchesBoard = !examBoardFilter || meta.examBoard === examBoardFilter;
    return matchesYear && matchesStage && matchesBoard;
  });

  const correct = filteredProgress.filter((record) => record.correct).length;
  const completed = filteredProgress.filter((record) => record.completed).length;
  const avgAccuracy = filteredProgress.length ? Math.round((correct / filteredProgress.length) * 100) : 0;
  const activeStudents = new Set(filteredProgress.map((record) => record.childId)).size;
  const activeParents = new Set(filteredProgress.map((record) => record.child.parentId)).size;
  const activeSubscriptions = subscriptions.filter((sub) => ["active", "trialing"].includes(sub.status)).length;
  const estimatedAiCostPence = filteredAiContent.reduce((total, item) => total + item.usedCount, 0) * 0.5 + filteredAiContent.length * 2;

  const weakTopics = Object.entries(
    filteredWeakAttempts
      .reduce<Record<string, number>>((acc, record) => {
        const fallbackLabel = `${record.subject}: ${record.skillFocus}`;
        let label = (record.skillFocus || record.correctAnswer || record.questionText || fallbackLabel).trim();
        if (label.length > 60) label = label.slice(0, 57) + "…";
        const key = `${record.subject}: ${label}`;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic, count]) => ({ topic, count }));

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      keyStage: keyStageFilter || null,
      yearGroup: yearGroupFilter || null,
      examBoard: examBoardFilter || null,
    },
    overview: { parents, students, activeStudents, activeParents, avgAccuracy, completed, activeSubscriptions, lessons, rewards, storeItems, supportTickets },
    ai: { contentItems: filteredAiContent.length, estimatedCostPence: Math.round(estimatedAiCostPence), totalUses: filteredAiContent.reduce((total, item) => total + item.usedCount, 0) },
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
