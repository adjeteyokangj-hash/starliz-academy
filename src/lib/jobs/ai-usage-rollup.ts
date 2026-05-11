import { prisma } from "@/lib/db";

export async function runAiUsageRollup() {
  const content = await prisma.aIContentCache.findMany({ select: { contentJson: true, usedCount: true } });
  const generatedItems = content.reduce((total, item) => {
    try {
      const parsed = JSON.parse(item.contentJson);
      return total + (Array.isArray(parsed) ? parsed.length : 1);
    } catch {
      return total + 1;
    }
  }, 0);
  const usageCount = content.reduce((total, item) => total + item.usedCount, 0);
  const estimatedCostPence = Math.round(generatedItems * 0.02 + usageCount * 0.005);
  return { generatedItems, usageCount, estimatedCostPence };
}
