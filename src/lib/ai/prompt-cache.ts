import crypto from "crypto";
import { prisma } from "@/lib/db";

export function promptCacheKey(input: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function findCachedPrompt(contentType: string, level: number, topic: string) {
  return prisma.aIContentCache.findFirst({
    where: { contentType, level, topic, status: { in: ["draft", "reviewed", "approved", "published"] } },
    orderBy: { createdAt: "desc" },
  });
}
