import { prisma } from "@/lib/db";

export async function detectWeakAreas(studentId?: string) {
  const records = await prisma.progressRecord.findMany({
    where: { ...(studentId ? { childId: studentId } : {}), correct: false },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { activityType: true, activityName: true, notes: true },
  });

  const counts = new Map<string, number>();
  for (const record of records) {
    const key = `${record.activityType}: ${record.notes || record.activityName || "practice"}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([topic, count]) => ({ topic, count }));
}
