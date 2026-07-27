import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { canAddChild } from "@/lib/subscriptions/enforcement";
import { getPublicPricingPlans, planKeyFromPricingPlan, resolveCurrentPricingPlan } from "@/lib/pricing/service";
import { resolvePaymentProvider } from "@/lib/billing/payment-routing";
import {
  auditSubscriptionRejection,
  formatParentSubscriptionStatus,
} from "@/lib/subscriptions/parent-subscription-access";
import {
  requestCancelAtPeriodEnd,
  requestReactivateSubscription,
} from "@/lib/subscriptions/parent-subscription-actions";

const updateSchema = z.object({
  action: z.enum(["cancel_at_period_end", "reactivate"]),
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
  const parentProfile = await prisma.parentProfile.findUnique({
    where: { userId: parentScope.parentId },
    select: { country: true, stripeCustomerId: true },
  });

  const currentPricingPlan = await resolveCurrentPricingPlan({
    pricingPlanId: subscription?.pricingPlanId,
    legacyPlanKey: subscription?.planKey,
  });
  const pricingPlans = await getPublicPricingPlans();
  const currentPricePence = currentPricingPlan ? Math.round(currentPricingPlan.price * 100) : 0;
  const currentInterval = currentPricingPlan?.interval ?? "custom";
  const currentChildLimit = currentPricingPlan?.childLimit ?? 1;
  const statusMeta = formatParentSubscriptionStatus({
    status: subscription?.status ?? "inactive",
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    graceEndsAt: subscription?.graceEndsAt ?? null,
  });

  return NextResponse.json({
    accountCountry: parentProfile?.country ?? "United Kingdom",
    subscription: {
      id: subscription?.id ?? null,
      pricingPlanId: currentPricingPlan?.id ?? subscription?.pricingPlanId ?? null,
      planKey: subscription?.planKey ?? (currentPricingPlan ? planKeyFromPricingPlan(currentPricingPlan) : "free"),
      planName: currentPricingPlan?.name ?? "Free",
      status: subscription?.status ?? "inactive",
      statusLabel: statusMeta.label,
      statusTone: statusMeta.tone,
      statusDetail: statusMeta.detail,
      cancelScheduled: statusMeta.cancelScheduled,
      accessEndsAt: statusMeta.accessEndsAt,
      canManageBilling: statusMeta.canManageBilling,
      badge: currentPricingPlan?.badge ?? currentPricingPlan?.name ?? "Free",
      provider: subscription?.provider ?? resolvePaymentProvider(parentProfile?.country ?? "UK"),
      hasProviderCustomer: Boolean(subscription?.providerCustomerId ?? parentProfile?.stripeCustomerId),
      childLimit: currentChildLimit,
      childrenUsed,
      upgradeRequired: !access.allowed,
      reason: access.reason ?? null,
      trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null,
      renewalDate: subscription?.currentPeriodEnd?.toISOString() ?? null,
      graceEndsAt: subscription?.graceEndsAt?.toISOString() ?? null,
      paymentFailed: ["past_due", "unpaid", "incomplete", "payment_failed"].includes(
        (subscription?.status ?? "").toLowerCase(),
      ),
      currentPricePence,
      currentInterval,
      currentCurrency: currentPricingPlan?.currency ?? "GBP",
      includesShortLearning:
        "Eligible plans include AI-led Short Learning (90/120 min). Human support is availability-based, not guaranteed, and not private 1:1 tutoring.",
      commercialNotes: [
        "Cancel in the Parent Portal — access continues until the end of the current billing period.",
        "There is no cancellation fee.",
        "There is no automatic pro-rata refund for unused days.",
        "Cancel booking is not cancel subscription.",
      ],
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

/**
 * Parent self-service only: cancel_at_period_end or reactivate.
 * Plan/status privilege escalation is rejected and audited.
 */
export async function PATCH(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    const attempted = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    await auditSubscriptionRejection({
      actorUserId: session.userId,
      parentId: parentScope.parentId,
      reason: "unsupported_patch_payload",
      metadata: {
        keys: Object.keys(attempted),
        hasStatus: "status" in attempted,
        hasPricingPlanId: "pricingPlanId" in attempted,
      },
    });
    return NextResponse.json(
      {
        error:
          "Parents cannot change plan or payment status directly. Use checkout, the billing portal, or cancel at period end.",
      },
      { status: 403 },
    );
  }

  if (parsed.data.action === "cancel_at_period_end") {
    try {
      const result = await requestCancelAtPeriodEnd({
        parentId: parentScope.parentId,
        actorUserId: session.userId,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({
        ok: true,
        action: "cancel_at_period_end",
        status: result.status,
        accessEndsAt: result.accessEndsAt,
        idempotent: result.idempotent,
        message:
          "Cancellation scheduled. Access continues until the end of the current billing period. No cancellation fee and no automatic pro-rata refund.",
      });
    } catch {
      return NextResponse.json({ error: "Unable to cancel subscription right now." }, { status: 502 });
    }
  }

  try {
    const result = await requestReactivateSubscription({
      parentId: parentScope.parentId,
      actorUserId: session.userId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      ok: true,
      action: "reactivate",
      status: result.status,
      renewalDate: result.renewalDate,
      message: "Cancellation withdrawn. Your subscription will renew as scheduled.",
    });
  } catch {
    return NextResponse.json({ error: "Unable to reactivate subscription right now." }, { status: 502 });
  }
}
