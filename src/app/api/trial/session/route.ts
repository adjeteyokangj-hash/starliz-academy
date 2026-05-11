import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { getPlan } from "@/lib/subscriptions/plans";
import { getTrialSessionLimit } from "@/lib/subscriptions/enforcement";

export async function POST() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const [user, subscription] = await Promise.all([
    prisma.user.findUnique({ where: { id: parentScope.parentId }, select: { id: true, trialSessionsUsed: true } }),
    prisma.subscription.findFirst({ where: { parentId: parentScope.parentId }, orderBy: { updatedAt: "desc" } }),
  ]);

  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const limit = getTrialSessionLimit();
  const plan = getPlan(subscription?.planKey);
  const hasPaidSubscription = plan.key !== "free" && (subscription?.status ?? "active") === "active";

  if (hasPaidSubscription) {
    return NextResponse.json({ ok: true, hasPaidSubscription: true, trialSessionsUsed: user.trialSessionsUsed, trialSessionsLeft: limit });
  }

  if (user.trialSessionsUsed >= limit) {
    return NextResponse.json({ error: "Subscription required", trialSessionsUsed: user.trialSessionsUsed, trialSessionsLeft: 0 }, { status: 403 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { trialSessionsUsed: { increment: 1 } },
    select: { trialSessionsUsed: true },
  });

  return NextResponse.json({
    ok: true,
    hasPaidSubscription: false,
    trialSessionsUsed: updated.trialSessionsUsed,
    trialSessionsLeft: Math.max(0, limit - updated.trialSessionsUsed),
  });
}