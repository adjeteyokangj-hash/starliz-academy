import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { canAddChild } from "@/lib/subscriptions/enforcement";
import { getPlan, listPlans, normalizePlanKey, planBadgeText, SubscriptionPlanKey } from "@/lib/subscriptions/plans";
import { resolveCurrentPricingPlan } from "@/lib/pricing/service";

const updateSchema = z.object({
  planKey: z.enum(["free", "monthly", "yearly"]).optional(),
  status: z.enum(["active", "trialing", "cancelled", "past_due", "blocked"]).optional(),
});

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const [subscription, access, childrenUsed] = await Promise.all([
    prisma.subscription.findFirst({
      where: { parentId: parentScope.parentId },
      orderBy: { updatedAt: "desc" },
    }),
    canAddChild(parentScope.parentId),
    prisma.childProfile.count({ where: { parentId: parentScope.parentId, archived: false } }),
  ]);

  const plan = getPlan(subscription?.planKey);
  const currentPricingPlan = await resolveCurrentPricingPlan({
    pricingPlanId: subscription?.pricingPlanId,
    legacyPlanKey: subscription?.planKey,
  });

  return NextResponse.json({
    subscription: {
      id: subscription?.id ?? null,
      pricingPlanId: currentPricingPlan?.id ?? subscription?.pricingPlanId ?? null,
      planKey: plan.key,
      planName: currentPricingPlan?.name ?? plan.name,
      status: subscription?.status ?? "active",
      badge: currentPricingPlan?.badge ?? currentPricingPlan?.name ?? planBadgeText(subscription?.planKey, subscription?.status),
      provider: subscription?.provider ?? "stripe",
      childLimit: plan.childLimit,
      childrenUsed,
      upgradeRequired: !access.allowed,
      reason: access.reason ?? null,
      trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null,
      renewalDate: subscription?.currentPeriodEnd?.toISOString() ?? null,
      paymentFailed: (subscription?.status ?? "").toLowerCase() === "past_due",
    },
    plans: listPlans().map((entry) => ({
      key: entry.key,
      name: entry.name,
      monthlyPricePence: entry.monthlyPricePence,
      yearlyPricePence: entry.yearlyPricePence ?? null,
      childLimit: entry.childLimit,
      description: entry.description,
      features: entry.features,
    })),
  });
}

export async function PATCH(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  try {
    const body = updateSchema.parse(await request.json());
    const current = await prisma.subscription.findFirst({ where: { parentId: parentScope.parentId }, orderBy: { updatedAt: "desc" } });

    const planKey = normalizePlanKey(body.planKey ?? current?.planKey) as SubscriptionPlanKey;
    const status = body.status ?? current?.status ?? "active";

    const payload = {
      pricingPlanId: current?.pricingPlanId ?? null,
      planKey,
      status,
      provider: current?.provider ?? "stripe",
    };

    if (current) {
      await prisma.subscription.update({ where: { id: current.id }, data: payload });
    } else {
      await prisma.subscription.create({ data: { parentId: parentScope.parentId, ...payload } });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid subscription payload." }, { status: 400 });
  }
}
