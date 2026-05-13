import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { canAddChild } from "@/lib/subscriptions/enforcement";
import { getPlan, normalizePlanKey, planBadgeText, SubscriptionPlanKey } from "@/lib/subscriptions/plans";
import { getPublicPricingPlans, resolveCurrentPricingPlan } from "@/lib/pricing/service";

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
  const pricingPlans = await getPublicPricingPlans();

  const inferredChildLimit = currentPricingPlan?.audience === "individual" ? 1 : 6;

  return NextResponse.json({
    subscription: {
      id: subscription?.id ?? null,
      pricingPlanId: currentPricingPlan?.id ?? subscription?.pricingPlanId ?? null,
      planKey: plan.key,
      planName: currentPricingPlan?.name ?? plan.name,
      status: subscription?.status ?? "active",
      badge: currentPricingPlan?.badge ?? currentPricingPlan?.name ?? planBadgeText(subscription?.planKey, subscription?.status),
      provider: subscription?.provider ?? "stripe",
      childLimit: currentPricingPlan ? inferredChildLimit : plan.childLimit,
      childrenUsed,
      upgradeRequired: !access.allowed,
      reason: access.reason ?? null,
      trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null,
      renewalDate: subscription?.currentPeriodEnd?.toISOString() ?? null,
      paymentFailed: (subscription?.status ?? "").toLowerCase() === "past_due",
    },
    plans: pricingPlans.map((entry) => ({
      id: entry.id,
      key: entry.id,
      name: entry.name,
      stripePriceId: entry.stripePriceId,
      monthlyPricePence: entry.interval === "month" ? Math.round(entry.price * 100) : null,
      yearlyPricePence: entry.interval === "year" ? Math.round(entry.price * 100) : null,
      childLimit: entry.audience === "individual" ? 1 : 6,
      description: entry.description,
      features: entry.features,
      price: entry.price,
      currency: entry.currency,
      interval: entry.interval,
      badge: entry.badge,
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
