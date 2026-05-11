import { prisma } from "@/lib/db";

export async function runSubscriptionChecks() {
  const now = new Date();
  const [expiredTrials, expiredGrace, expiredPeriods] = await Promise.all([
    prisma.subscription.updateMany({
      where: { status: "trialing", trialEndsAt: { lt: now } },
      data: { status: "expired" },
    }),
    prisma.subscription.updateMany({
      where: { status: "past_due", graceEndsAt: { lt: now } },
      data: { status: "blocked" },
    }),
    prisma.subscription.updateMany({
      where: { status: "cancelled", currentPeriodEnd: { lt: now } },
      data: { status: "expired" },
    }),
  ]);

  return {
    expiredTrials: expiredTrials.count,
    blockedPastDue: expiredGrace.count,
    expiredCancelled: expiredPeriods.count,
  };
}
