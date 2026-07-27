import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

/** Statuses that currently grant paid access (including cancel-scheduled until period end). */
export function subscriptionGrantsAccess(input: {
  status: string | null | undefined;
  currentPeriodEnd?: Date | null;
  graceEndsAt?: Date | null;
  now?: Date;
}): boolean {
  const status = (input.status ?? "").toLowerCase();
  const now = input.now ?? new Date();
  if (status === "active" || status === "trialing") return true;
  if (status === "cancelled" && input.currentPeriodEnd && input.currentPeriodEnd.getTime() > now.getTime()) {
    return true;
  }
  if (status === "past_due") {
    return Boolean(input.graceEndsAt && input.graceEndsAt.getTime() > now.getTime());
  }
  return false;
}

export function formatParentSubscriptionStatus(input: {
  status: string | null | undefined;
  currentPeriodEnd?: Date | null;
  graceEndsAt?: Date | null;
  now?: Date;
}): {
  code: string;
  label: string;
  tone: "ok" | "warning" | "danger" | "neutral";
  detail: string;
  canManageBilling: boolean;
  cancelScheduled: boolean;
  accessEndsAt: string | null;
} {
  const now = input.now ?? new Date();
  const status = (input.status ?? "inactive").toLowerCase();
  const periodEnd = input.currentPeriodEnd ?? null;
  const graceEnds = input.graceEndsAt ?? null;
  const accessEndsAt = periodEnd ? periodEnd.toISOString() : null;
  const periodEndLabel = periodEnd
    ? periodEnd.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const graceLabel = graceEnds
    ? graceEnds.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  if (status === "active" || status === "trialing") {
    return {
      code: status,
      label: status === "trialing" ? "Trial" : "Active",
      tone: "ok",
      detail: periodEndLabel
        ? `Renews on ${periodEndLabel}. Cancel any time — access continues until the end of the paid period.`
        : "Your subscription is active.",
      canManageBilling: true,
      cancelScheduled: false,
      accessEndsAt,
    };
  }

  if (status === "cancelled" && periodEnd && periodEnd.getTime() > now.getTime()) {
    return {
      code: "cancel_at_period_end",
      label: "Cancels at period end",
      tone: "warning",
      detail: `Cancellation is scheduled. Access continues until ${periodEndLabel}. No cancellation fee and no automatic pro-rata refund.`,
      canManageBilling: true,
      cancelScheduled: true,
      accessEndsAt,
    };
  }

  if (status === "past_due" || status === "unpaid" || status === "incomplete" || status === "payment_failed") {
    return {
      code: status === "payment_failed" ? "past_due" : status,
      label: "Payment needs attention",
      tone: "danger",
      detail: graceLabel
        ? `We could not take payment. Update your payment method to keep access. Grace continues until ${graceLabel}.`
        : "We could not take payment. Update your payment method to restore or keep access.",
      canManageBilling: true,
      cancelScheduled: false,
      accessEndsAt: graceEnds?.toISOString() ?? accessEndsAt,
    };
  }

  if (status === "cancelled" || status === "expired" || status === "blocked" || status === "inactive") {
    return {
      code: status,
      label: status === "expired" ? "Expired" : status === "blocked" ? "Access paused" : "Cancelled",
      tone: "neutral",
      detail: periodEndLabel && status === "cancelled"
        ? `Access ended on ${periodEndLabel}. Choose a plan to resubscribe.`
        : "Your subscription is not active. Choose a plan to resubscribe.",
      canManageBilling: true,
      cancelScheduled: false,
      accessEndsAt,
    };
  }

  return {
    code: status,
    label: status.replaceAll("_", " "),
    tone: "neutral",
    detail: "Review your billing details to continue.",
    canManageBilling: true,
    cancelScheduled: false,
    accessEndsAt,
  };
}

export async function auditSubscriptionRejection(input: {
  actorUserId: string;
  parentId: string;
  reason: string;
  metadata?: Record<string, unknown>;
}) {
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "subscription_change_rejected",
    entityType: "Subscription",
    entityId: input.parentId,
    metadata: { reason: input.reason, ...(input.metadata ?? {}) },
  });
}

export async function getLatestParentSubscription(parentId: string) {
  return prisma.subscription.findFirst({
    where: { parentId },
    orderBy: { updatedAt: "desc" },
  });
}
