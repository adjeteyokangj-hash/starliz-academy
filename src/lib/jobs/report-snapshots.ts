import { prisma } from "@/lib/db";

export async function runReportSnapshots() {
  const [parents, students, progressRecords, subscriptions] = await Promise.all([
    prisma.user.count({ where: { role: "parent" } }),
    prisma.childProfile.count({ where: { archived: false } }),
    prisma.progressRecord.count(),
    prisma.subscription.count(),
  ]);

  return { parents, students, progressRecords, subscriptions };
}
