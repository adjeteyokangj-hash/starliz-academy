import { prisma } from "@/lib/db";

export async function runCleanupAiDrafts() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const deleted = await prisma.aIContentCache.deleteMany({
    where: { status: "draft", createdAt: { lt: cutoff }, usedCount: 0 },
  });

  return { deletedDrafts: deleted.count };
}
