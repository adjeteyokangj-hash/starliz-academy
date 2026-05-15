import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { canAddChild } from "@/lib/subscriptions/enforcement";
import { getPublicPricingPlans, planKeyFromPricingPlan, resolveCurrentPricingPlan } from "@/lib/pricing/service";

const updateSchema = z.object({
  pricingPlanId: z.string().min(1).optional(),
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

  const currentPricingPlan = await resolveCurrentPricingPlan({
    pricingPlanId: subscription?.pricingPlanId,
    legacyPlanKey: subscription?.planKey,
  });
  const pricingPlans = await getPublicPricingPlans();
  const currentPricePence = currentPricingPlan ? Math.round(currentPricingPlan.price * 100) : 0;
  const currentInterval = currentPricingPlan?.interval ?? "custom";
  const currentChildLimit = currentPricingPlan?.childLimit ?? 1;

  return NextResponse.json({
    subscription: {
      id: subscription?.id ?? null,
      pricingPlanId: currentPricingPlan?.id ?? subscription?.pricingPlanId ?? null,
      planKey: subscription?.planKey ?? (currentPricingPlan ? planKeyFromPricingPlan(currentPricingPlan) : "free"),
      planName: currentPricingPlan?.name ?? "Free",
      status: subscription?.status ?? "active",
      badge: currentPricingPlan?.badge ?? currentPricingPlan?.name ?? "Free",
      provider: subscription?.provider ?? "stripe",
      childLimit: currentChildLimit,
      childrenUsed,
      upgradeRequired: !access.allowed,
      reason: access.reason ?? null,
      trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null,
      renewalDate: subscription?.currentPeriodEnd?.toISOString() ?? null,
      paymentFailed: (subscription?.status ?? "").toLowerCase() === "past_due",
      currentPricePence,
      currentInterval,
      currentCurrency: currentPricingPlan?.currency ?? "GBP",
    },
    plans: pricingPlans.map((entry) => ({
      id: entry.id,
      key: planKeyFromPricingPlan(entry),
      name: entry.name,
      stripePriceId: entry.stripePriceId,
      monthlyPricePence: entry.interval === "month" ? Math.round(entry.price * 100) : null,
      yearlyPricePence: entry.interval === "year" ? Math.round(entry.price * 100) : null,
      childLimit: entry.childLimit,
      description: entry.description,
      features: entry.features,
      price: entry.price,
      currency: entry.currency,
      interval: entry.interval,
      badge: entry.badge,
      stripeAvailable: (entry.interval === "month" || entry.interval === "year") && Boolean(entry.stripePriceId),
      changeType:
        currentPricingPlan?.id === entry.id
          ? "current"
          : currentPricingPlan
          ? entry.price > currentPricingPlan.price
            ? "upgrade"
            : entry.price < currentPricingPlan.price
            ? "downgrade"
            : "switch"
          : "upgrade",
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

    let pricingPlanId = current?.pricingPlanId ?? null;
    let planKey = current?.planKey ?? "free";
    if (body.pricingPlanId) {
      const selected = await prisma.pricingPlan.findFirst({
        where: { id: body.pricingPlanId, isActive: true },
      });
      if (!selected) {
        return NextResponse.json({ error: "Selected pricing plan is unavailable." }, { status: 404 });
      }
      pricingPlanId = selected.id;
      planKey = planKeyFromPricingPlan({ id: selected.id, name: selected.name });
    }
    const status = body.status ?? current?.status ?? "active";

    const payload = {
      pricingPlanId,
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
