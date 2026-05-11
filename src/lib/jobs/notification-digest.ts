import { prisma } from "@/lib/db";

export async function runNotificationDigest() {
  const inactiveSince = new Date();
  inactiveSince.setDate(inactiveSince.getDate() - 7);

  const activeChildIds = await prisma.progressRecord.findMany({
    where: { createdAt: { gte: inactiveSince } },
    select: { childId: true },
    distinct: ["childId"],
  });
  const activeSet = new Set(activeChildIds.map((record) => record.childId));
  const children = await prisma.childProfile.findMany({
    where: { archived: false },
    select: { id: true, parentId: true },
  });

  return {
    inactiveChildren: children.filter((child) => !activeSet.has(child.id)).length,
    parentAlertsQueued: new Set(children.filter((child) => !activeSet.has(child.id)).map((child) => child.parentId)).size,
  };
}
