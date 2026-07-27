import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { getPlan, normalizePlanKey } from "@/lib/subscriptions/plans";
import { createPricingPlanResolver } from "@/lib/pricing/service";
import { adminPlanKeyFromPricingPlan, normalizeAdminPlanKey } from "@/lib/subscriptions/adminPlanKeys";
import { writeAuditLog } from "@/lib/audit";
import {
  formatParentSubscriptionStatus,
  getLatestParentSubscription,
} from "@/lib/subscriptions/parent-subscription-access";
import {
  requestCancelAtPeriodEnd,
  requestReactivateSubscription,
} from "@/lib/subscriptions/parent-subscription-actions";
import { enqueueAdminPaymentLifecycleReminder } from "@/lib/subscriptions/admin-payment-reminder";

const ALLOWED_ACTIONS = [
  "cancel_at_period_end",
  "reactivate",
  "send_payment_reminder",
  "record_operational_note",
] as const;

const REJECTED_ACTIONS = [
  "change_plan",
  "cancel_subscription",
  "pause_subscription",
  "resume_subscription",
  "extend_trial",
  "set_status",
  "set_renewal",
  "activate",
] as const;

const actionSchema = z.enum([...ALLOWED_ACTIONS, ...REJECTED_ACTIONS]);

const updateSchema = z
  .object({
    parentId: z.string().min(1),
    action: actionSchema,
    note: z.string().trim().min(3).max(500).optional(),
    // Intentionally ignored payment-derived fields — presence triggers rejection audit.
    planKey: z.string().optional(),
    status: z.string().optional(),
    renewalDate: z.string().nullable().optional(),
    trialDays: z.number().optional(),
    pricingPlanId: z.string().optional(),
    subscriptionId: z.string().optional(),
    currentPeriodEnd: z.string().nullable().optional(),
    cancelAtPeriodEnd: z.boolean().optional(),
    graceEndsAt: z.string().nullable().optional(),
    providerCustomerId: z.string().optional(),
    providerSubId: z.string().optional(),
    stripeCustomerId: z.string().optional(),
  })
  .strict();

const PAYMENT_DERIVED_BODY_KEYS = [
  "planKey",
  "status",
  "renewalDate",
  "trialDays",
  "pricingPlanId",
  "subscriptionId",
  "currentPeriodEnd",
  "cancelAtPeriodEnd",
  "graceEndsAt",
  "providerCustomerId",
  "providerSubId",
  "stripeCustomerId",
] as const;

export function toUiStatus(status: string | null | undefined) {
  const normalized = (status ?? "active").toLowerCase();
  if (normalized === "failed_payment" || normalized === "payment_failed") return "failed_payment";
  if (normalized === "blocked" || normalized === "suspended") return "suspended";
  if (normalized === "trialing") return "trialing";
  if (normalized === "cancelled") return "cancelled";
  if (normalized === "past_due" || normalized === "unpaid" || normalized === "incomplete") return "past_due";
  if (normalized === "expired" || normalized === "inactive") return "expired";
  return "active";
}

function currency(valuePence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format((valuePence || 0) / 100);
}

function amountForPlan(planKey: string, billingCycle: "monthly" | "yearly") {
  const plan = getPlan(planKey);
  if (billingCycle === "yearly") {
    return plan.yearlyPricePence ?? plan.monthlyPricePence * 12;
  }
  return plan.monthlyPricePence;
}

/** @deprecated retained for existing unit tests; parent profile status is no longer mutated by Admin overrides. */
export function accountStatusFromSubscription(status: string) {
  if (status === "past_due" || status === "cancelled" || status === "blocked") return "suspended";
  return "active";
}

async function auditRejection(input: {
  actorUserId: string;
  parentId: string;
  action: string;
  reason: string;
  metadata?: Record<string, unknown>;
}) {
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "admin_subscription_change_rejected",
    entityType: "Subscription",
    entityId: input.parentId,
    metadata: {
      action: input.action,
      reason: input.reason,
      ...(input.metadata ?? {}),
    },
  });
}

export async function GET() {
  const { session, response } = await requireAdminPermission("MANAGE_SUBSCRIPTIONS");
  if (!session) return response;

  const canManagePlans = true;

  const [parents, resolvePricingPlan] = await Promise.all([
    prisma.user.findMany({
      where: { role: "parent" },
      select: {
        id: true,
        name: true,
        email: true,
        updatedAt: true,
        parentProfile: {
          select: {
            trialStatus: true,
            subscriptionPlan: true,
            status: true,
          },
        },
        subscriptions: {
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    createPricingPlanResolver(),
  ]);

  const rows = parents.map((parent) => {
    const subscription = parent.subscriptions[0] ?? null;
    const rawPlan = subscription?.planKey ?? parent.parentProfile?.subscriptionPlan ?? "free";
    const normalizedPlan = normalizePlanKey(rawPlan);
    const currentPricingPlan = resolvePricingPlan({
      pricingPlanId: subscription?.pricingPlanId,
      legacyPlanKey: rawPlan,
    });
      const billingCycle: "monthly" | "yearly" =
        currentPricingPlan?.interval === "year" || normalizedPlan === "yearly" ? "yearly" : "monthly";
      const amountPence = currentPricingPlan
        ? Math.round(currentPricingPlan.price * 100)
        : amountForPlan(normalizedPlan, billingCycle);
      const adminPlanKey = currentPricingPlan
        ? adminPlanKeyFromPricingPlan(currentPricingPlan)
        : normalizeAdminPlanKey(rawPlan);
      const statusMeta = formatParentSubscriptionStatus({
        status: subscription?.status ?? parent.parentProfile?.status ?? "inactive",
        currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
        graceEndsAt: subscription?.graceEndsAt ?? null,
      });
      const paymentProvider = subscription?.provider === "paystack" ? "paystack" : "stripe";

      return {
        parentId: parent.id,
        parentName: parent.name,
        parentEmail: parent.email,
        subscriptionId: subscription?.id ?? null,
        planKey: adminPlanKey,
        planName: currentPricingPlan?.name ?? getPlan(normalizedPlan).name,
        status: toUiStatus(subscription?.status ?? parent.parentProfile?.status ?? "inactive"),
        statusCode: statusMeta.code,
        statusLabel: statusMeta.label,
        statusTone: statusMeta.tone,
        statusDetail: statusMeta.detail,
        cancelScheduled: statusMeta.cancelScheduled,
        accessEndsAt: statusMeta.accessEndsAt,
        graceEndsAt: subscription?.graceEndsAt?.toISOString() ?? null,
        trialStatus: parent.parentProfile?.trialStatus ?? null,
        trialEndDate: subscription?.trialEndsAt?.toISOString() ?? null,
        renewalDate: subscription?.currentPeriodEnd?.toISOString() ?? null,
        amountLabel: currency(amountPence),
        amountPence,
        billingCycle,
        childLimit: currentPricingPlan?.childLimit ?? getPlan(normalizedPlan).childLimit,
        paymentProvider,
        paymentMethod: paymentProvider === "stripe" ? "Card" : "Paystack",
        hasProviderCustomer: Boolean(subscription?.providerCustomerId),
        lastUpdatedAt: subscription?.updatedAt?.toISOString() ?? parent.updatedAt.toISOString(),
        createdAt: parent.updatedAt.toISOString(),
      };
  });

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
    churnedSubscriptions: rows.filter((row) => row.status === "cancelled" || row.status === "expired").length,
    failedPayments: rows.filter((row) => row.status === "past_due" || row.status === "failed_payment").length,
    mrrLabel: currency(monthlyRecurringRevenuePence),
    monthRevenueLabel: currency(
      rows
        .filter((row) => row.status === "active" || row.status === "trialing")
        .reduce((sum, row) => sum + row.amountPence, 0),
    ),
  };

  return NextResponse.json({
    rows,
    metrics,
    canManagePlans,
    allowedActions: ALLOWED_ACTIONS,
    commercialNotes: [
      "Payment status is payment-provider truth. Admin cannot activate paid access locally.",
      "Cancel at period end keeps access until the paid period ends.",
      "There is no cancellation fee and no automatic pro-rata refund.",
    ],
  });
}

export async function PATCH(request: Request) {
  const { session, response } = await requireAdminPermission("MANAGE_SUBSCRIPTIONS");
  if (!session) return response;

  const canManagePlans = true;
  if (!canManagePlans) {
    await auditRejection({
      actorUserId: session.userId,
      parentId: "unknown",
      action: "forbidden",
      reason: "missing_subscription_management_permission",
    });
    return NextResponse.json({ error: "Forbidden: missing subscription management permission" }, { status: 403 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(rawBody);
  if (!parsed.success) {
    await auditRejection({
      actorUserId: session.userId,
      parentId: typeof (rawBody as { parentId?: unknown })?.parentId === "string"
        ? (rawBody as { parentId: string }).parentId
        : "unknown",
      action: "invalid_payload",
      reason: "schema_validation_failed",
    });
    return NextResponse.json({ error: "Invalid subscription action payload." }, { status: 400 });
  }

  const body = parsed.data;
  const tamperKeys = PAYMENT_DERIVED_BODY_KEYS.filter((key) => body[key] !== undefined);

  // Unsafe legacy actions — fail closed, never convert into another action.
  if ((REJECTED_ACTIONS as readonly string[]).includes(body.action)) {
    await auditRejection({
      actorUserId: session.userId,
      parentId: body.parentId,
      action: body.action,
      reason: "unsafe_local_override_disabled",
      metadata: { tamperKeys },
    });
    return NextResponse.json(
      {
        error:
          "This Admin action is disabled. Paid access and plan changes come from verified billing workflows only.",
      },
      { status: 403 },
    );
  }

  // Approved actions must not smuggle payment-derived field writes.
  if (tamperKeys.length > 0) {
    await auditRejection({
      actorUserId: session.userId,
      parentId: body.parentId,
      action: body.action,
      reason: "payment_derived_field_tamper",
      metadata: { tamperKeys },
    });
    return NextResponse.json(
      {
        error: "Payment-derived fields cannot be changed through Admin. Request was rejected.",
      },
      { status: 403 },
    );
  }

  const parent = await prisma.user.findUnique({
    where: { id: body.parentId },
    select: { id: true, role: true },
  });
  if (!parent || parent.role !== "parent") {
    await auditRejection({
      actorUserId: session.userId,
      parentId: body.parentId,
      action: body.action,
      reason: "parent_not_found",
    });
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const before = await getLatestParentSubscription(body.parentId);

  if (body.action === "send_payment_reminder") {
    const result = await enqueueAdminPaymentLifecycleReminder({
      parentId: body.parentId,
      actorUserId: session.userId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    await writeAuditLog({
      actorUserId: session.userId,
      action: "admin_billing_action_requested",
      entityType: "Subscription",
      entityId: before?.id ?? body.parentId,
      metadata: { action: body.action, parentId: body.parentId, kind: result.kind, noticeEventId: result.eventId },
    });
    return NextResponse.json({ ok: true, message: result.message, eventId: result.eventId, kind: result.kind });
  }

  if (body.action === "record_operational_note") {
    if (!body.note) {
      await auditRejection({
        actorUserId: session.userId,
        parentId: body.parentId,
        action: body.action,
        reason: "note_required",
      });
      return NextResponse.json({ error: "A note of at least 3 characters is required." }, { status: 400 });
    }
    await writeAuditLog({
      actorUserId: session.userId,
      action: "admin_billing_action_requested",
      entityType: "Subscription",
      entityId: before?.id ?? body.parentId,
      metadata: { action: body.action, parentId: body.parentId, note: body.note },
    });
    return NextResponse.json({ ok: true, message: "Operational billing note recorded." });
  }

  if (body.action === "cancel_at_period_end") {
    const result = await requestCancelAtPeriodEnd({
      parentId: body.parentId,
      actorUserId: session.userId,
    });
    if (!result.ok) {
      await auditRejection({
        actorUserId: session.userId,
        parentId: body.parentId,
        action: body.action,
        reason: result.error,
      });
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    await writeAuditLog({
      actorUserId: session.userId,
      action: "admin_subscription_cancel_requested",
      entityType: "Subscription",
      entityId: before?.id ?? body.parentId,
      metadata: {
        parentId: body.parentId,
        idempotent: result.idempotent,
        accessEndsAt: result.accessEndsAt,
      },
    });
    return NextResponse.json({
      ok: true,
      message: result.idempotent
        ? "Cancellation was already scheduled at period end."
        : "Cancellation requested at period end. Access continues until the paid period ends.",
      accessEndsAt: result.accessEndsAt,
      status: result.status,
    });
  }

  if (body.action === "reactivate") {
    const result = await requestReactivateSubscription({
      parentId: body.parentId,
      actorUserId: session.userId,
    });
    if (!result.ok) {
      await auditRejection({
        actorUserId: session.userId,
        parentId: body.parentId,
        action: body.action,
        reason: result.error,
      });
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    await writeAuditLog({
      actorUserId: session.userId,
      action: "admin_subscription_reactivation_requested",
      entityType: "Subscription",
      entityId: before?.id ?? body.parentId,
      metadata: {
        parentId: body.parentId,
        idempotent: result.idempotent,
        renewalDate: result.renewalDate,
      },
    });
    return NextResponse.json({
      ok: true,
      message: result.idempotent
        ? "Subscription is already active."
        : "Reactivation requested. Billing will continue at the next renewal.",
      renewalDate: result.renewalDate,
      status: result.status,
    });
  }

  await auditRejection({
    actorUserId: session.userId,
    parentId: body.parentId,
    action: body.action,
    reason: "unsupported_action",
  });
  return NextResponse.json({ error: "Unsupported Admin billing action." }, { status: 400 });
}
