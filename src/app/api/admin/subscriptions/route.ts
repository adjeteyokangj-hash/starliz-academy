import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, requireAdminPermission } from "@/lib/api_guard";
import { addDays, getPlan, normalizePlanKey } from "@/lib/subscriptions/plans";
import { resolveCurrentPricingPlan } from "@/lib/pricing/service";
import { writeAuditLog } from "@/lib/audit";

const actionSchema = z.enum([
  "change_plan",
  "cancel_subscription",
  "pause_subscription",
  "resume_subscription",
  "extend_trial",
  "send_payment_reminder",
]);

const updateSchema = z.object({
  parentId: z.string().min(1),
  action: actionSchema,
  planKey: z.string().trim().min(1).optional(),
  status: z
    .enum(["active", "trialing", "cancelled", "past_due", "blocked", "failed_payment", "suspended"])
    .optional(),
  renewalDate: z.string().datetime().nullable().optional(),
  trialDays: z.number().int().min(1).max(60).optional(),
});

function toUiStatus(status: string | null | undefined) {
  const normalized = (status ?? "active").toLowerCase();
  if (normalized === "failed_payment") return "failed_payment";
  if (normalized === "blocked" || normalized === "suspended") return "suspended";
  if (normalized === "trialing") return "trialing";
  if (normalized === "cancelled") return "cancelled";
  if (normalized === "past_due") return "past_due";
  return "active";
}

function amountForPlan(planKey: string, billingCycle: "monthly" | "yearly") {
  const plan = getPlan(planKey);
  if (billingCycle === "yearly") {
    return plan.yearlyPricePence ?? plan.monthlyPricePence * 12;
  }
  return plan.monthlyPricePence;
}

function currency(valuePence: number) {
  return `GBP ${((valuePence || 0) / 100).toFixed(2)}`;
}

function accountStatusFromSubscription(status: string) {
  if (status === "past_due" || status === "cancelled" || status === "blocked") return "suspended";
  return "active";
}

function normalizeAdminPlanKey(planKey: string | null | undefined): string {
  const raw = String(planKey ?? "free").trim().toLowerCase();
  if (!raw) return "free";
  if (raw === "free") return "free";
  if (raw === "starter") return "starter";
  if (raw === "standard" || raw === "monthly") return "standard";
  if (raw === "pro" || raw === "yearly" || raw === "family" || raw === "premium") return "pro";
  if (raw.includes("enterprise") || raw.includes("custom") || raw.includes("school")) return "enterprise";
  return raw;
}

function toStoredPlanKey(adminPlanKey: string): string {
  if (adminPlanKey === "standard") return "monthly";
  if (adminPlanKey === "pro") return "yearly";
  if (adminPlanKey === "enterprise") return "enterprise_custom";
  return adminPlanKey;
}

async function canAdminManageSubscriptions(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      adminProfile: {
        select: {
          role: { select: { name: true, permissions: true } },
        },
      },
    },
  });

  const role = user?.adminProfile?.role;
  if (!role || role.name === "Super Admin") return true;

  try {
    const parsed = JSON.parse(role.permissions);
    const permissions = Array.isArray(parsed) ? parsed.map(String) : [];
    return permissions.includes("parents:write");
  } catch {
    return false;
  }
}

export async function GET() {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const canManagePlans = await canAdminManageSubscriptions(session.userId);

  const parents = await prisma.user.findMany({
    where: { role: "parent" },
    select: {
      id: true,
      name: true,
      email: true,
      updatedAt: true,
      parentProfile: {
        select: {
          stripeCustomerId: true,
          trialStatus: true,
          subscriptionPlan: true,
          status: true,
          paystackCustomerId: true,
        },
      },
      subscriptions: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const rows = await Promise.all(parents.map(async (parent) => {
    const subscription = parent.subscriptions[0] ?? null;
    const rawPlan = subscription?.planKey ?? parent.parentProfile?.subscriptionPlan ?? "free";
    const normalizedPlan = normalizePlanKey(rawPlan);
    const uiStatus = toUiStatus(subscription?.status ?? parent.parentProfile?.status ?? "active");
    const currentPricingPlan = await resolveCurrentPricingPlan({
      pricingPlanId: subscription?.pricingPlanId,
      legacyPlanKey: rawPlan,
    });
    const renewalDate = subscription?.currentPeriodEnd?.toISOString() ?? null;
    const trialEndDate = subscription?.trialEndsAt?.toISOString() ?? null;
    const paymentProvider = subscription?.provider === "paystack" ? "paystack" : "stripe";
    const billingCycle: "monthly" | "yearly" = currentPricingPlan?.interval === "year" || normalizedPlan === "yearly" ? "yearly" : "monthly";
    const amountPence = currentPricingPlan ? Math.round(currentPricingPlan.price * 100) : amountForPlan(normalizedPlan, billingCycle);
    const adminPlanKey = normalizeAdminPlanKey(rawPlan);

    return {
      parentId: parent.id,
      parentName: parent.name,
      parentEmail: parent.email,
      planKey: adminPlanKey,
      planName: currentPricingPlan?.name ?? getPlan(normalizedPlan).name,
      status: uiStatus,
      trialStatus: parent.parentProfile?.trialStatus ?? null,
      trialEndDate,
      renewalDate,
      amountLabel: currency(amountPence),
      amountPence,
      billingCycle,
      childLimit: currentPricingPlan?.childLimit ?? getPlan(normalizedPlan).childLimit,
      paymentProvider,
      paymentMethod: paymentProvider === "stripe" ? "Card (Stripe)" : "Paystack",
      stripeCustomerId: subscription?.providerCustomerId ?? parent.parentProfile?.stripeCustomerId ?? null,
      paystackCustomerId: parent.parentProfile?.paystackCustomerId ?? null,
      lastPaymentDate: subscription?.updatedAt?.toISOString() ?? parent.updatedAt.toISOString(),
      createdAt: parent.updatedAt.toISOString(),
    };
  }));

  const monthlyRecurringRevenuePence = rows
    .filter((row) => row.status === "active" || row.status === "trialing")
    .reduce((sum, row) => {
      if (row.billingCycle === "yearly") return sum + Math.round(row.amountPence / 12);
      return sum + row.amountPence;
    }, 0);

  const metrics = {
    totalParents: rows.length,
    activeSubscriptions: rows.filter((row) => row.status === "active").length,
    trialSubscriptions: rows.filter((row) => row.status === "trialing").length,
    churnedSubscriptions: rows.filter((row) => row.status === "cancelled").length,
    failedPayments: rows.filter((row) => row.status === "past_due" || row.status === "failed_payment").length,
    mrrLabel: currency(monthlyRecurringRevenuePence),
    monthRevenueLabel: currency(rows.reduce((sum, row) => sum + row.amountPence, 0)),
  };

  return NextResponse.json({ rows, metrics, canManagePlans });
}

export async function PATCH(request: Request) {
  const { session, response } = await requireAdminPermission("parents:write");
  if (!session) return response;

  try {
    const body = updateSchema.parse(await request.json());

    const parent = await prisma.user.findUnique({
      where: { id: body.parentId },
      select: { id: true, role: true },
    });
    if (!parent || parent.role !== "parent") {
      return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
    }

    const current = await prisma.subscription.findFirst({
      where: { parentId: body.parentId },
      orderBy: { updatedAt: "desc" },
    });

    if (body.action === "send_payment_reminder") {
      return NextResponse.json({ ok: true, message: "Payment reminder queued." });
    }

    const existingPlan = normalizeAdminPlanKey(current?.planKey ?? "free");
    let nextPlan = existingPlan;
    let nextStatus = toUiStatus(current?.status ?? "active");
    let nextTrialEndsAt = current?.trialEndsAt ?? null;

    if (body.action === "change_plan") {
      nextPlan = normalizeAdminPlanKey(body.planKey ?? existingPlan);
    }
    if (body.action === "cancel_subscription") {
      nextStatus = "cancelled";
    }
    if (body.action === "pause_subscription") {
      nextStatus = "suspended";
    }
    if (body.action === "resume_subscription") {
      nextStatus = "active";
    }
    if (body.action === "extend_trial") {
      nextStatus = "trialing";
      nextTrialEndsAt = addDays(new Date(), body.trialDays ?? 7);
    }
    if (body.status) {
      nextStatus = toUiStatus(body.status);
    }

    const databaseStatus = nextStatus === "suspended" ? "blocked" : nextStatus === "failed_payment" ? "past_due" : nextStatus;

    let selectedPricingPlanId = current?.pricingPlanId ?? null;
    if (body.action === "change_plan") {
      const planMatcher = nextPlan;
      const candidate = await prisma.pricingPlan.findFirst({
        where: {
          isActive: true,
          OR: [
            { name: { contains: planMatcher, mode: "insensitive" } },
            planMatcher === "standard" ? { interval: "month", audience: "family" } : { id: "__none__" },
            planMatcher === "pro" ? { name: { contains: "pro", mode: "insensitive" } } : { id: "__none__" },
            planMatcher === "enterprise" ? { interval: "custom" } : { id: "__none__" },
          ],
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      selectedPricingPlanId = candidate?.id ?? current?.pricingPlanId ?? null;
    }

    const storedPlanKey = toStoredPlanKey(nextPlan);

    const data = {
      planKey: storedPlanKey,
      pricingPlanId: selectedPricingPlanId,
      status: databaseStatus,
      provider: current?.provider === "paystack" ? "paystack" : "stripe",
      currentPeriodEnd: body.renewalDate ? new Date(body.renewalDate) : current?.currentPeriodEnd ?? null,
      trialEndsAt: nextTrialEndsAt,
      graceEndsAt: databaseStatus === "past_due" ? addDays(new Date(), 7) : null,
    };

    if (current) {
      await prisma.subscription.update({ where: { id: current.id }, data });
    } else {
      await prisma.subscription.create({ data: { parentId: body.parentId, ...data } });
    }

    await prisma.parentProfile.upsert({
      where: { userId: body.parentId },
      create: {
        userId: body.parentId,
        phone: "Not set",
        status: accountStatusFromSubscription(databaseStatus),
        trialStatus: nextStatus === "trialing" ? "trial" : nextStatus,
        subscriptionPlan: storedPlanKey,
      },
      update: {
        status: accountStatusFromSubscription(databaseStatus),
        trialStatus: nextStatus === "trialing" ? "trial" : nextStatus,
        subscriptionPlan: storedPlanKey,
      },
    });

    await writeAuditLog({
      actorUserId: session.userId,
      action: "admin.subscription.override",
      entityType: "subscription",
      entityId: current?.id,
      metadata: {
        parentId: body.parentId,
        action: body.action,
        oldPlan: existingPlan,
        newPlan: nextPlan,
        oldStatus: toUiStatus(current?.status ?? "active"),
        newStatus: nextStatus,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid subscription action payload." }, { status: 400 });
  }
}
