import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function codingAssistanceEnabled(
  getSettings: () => Promise<{ humanAssistanceEnabled: boolean } | null> = () => prisma.skillsLabSettings.findUnique({ where: { labId: "coding" } }),
): Promise<boolean> {
  try {
    const row = await getSettings();
    return row?.humanAssistanceEnabled === true;
  } catch (error) {
    // Safe rollout before the additive migration is applied. Other failures remain visible.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") return false;
    throw error;
  }
}
