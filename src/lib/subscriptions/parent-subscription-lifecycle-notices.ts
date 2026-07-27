import { prisma } from "@/lib/db";
import { emitNotificationEvent } from "@/lib/notifications/dispatcher";
import { writeAuditLog } from "@/lib/audit";

function formatEnGbDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function resolveLifecycleKind(input: {
  eventType: string;
  previousStatus: string | null;
  nextStatus: string;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
}): {
  kind:
    | "payment_failed"
    | "payment_retry_scheduled"
    | "grace_period_started"
    | "grace_period_ending"
    | "subscription_cancelled"
    | "access_ending"
    | "subscription_expired"
    | "payment_recovered"
    | null;
  subject: string;
  message: string;
  auditAction: string;
} | null {
  const prev = (input.previousStatus ?? "").toLowerCase();
  const next = input.nextStatus.toLowerCase();
  const periodLabel = formatEnGbDate(input.currentPeriodEnd);
  const graceLabel = formatEnGbDate(input.graceEndsAt);
  const now = Date.now();
  const periodFuture = Boolean(input.currentPeriodEnd && input.currentPeriodEnd.getTime() > now);
  const graceEndingSoon =
    Boolean(input.graceEndsAt)
    && input.graceEndsAt!.getTime() > now
    && input.graceEndsAt!.getTime() - now <= 2 * 86_400_000;

  if (
    (input.eventType === "invoice.payment_failed" || input.eventType === "charge.failed" || next === "past_due")
    && next === "past_due"
    && prev !== "past_due"
  ) {
    return {
      kind: "payment_failed",
      auditAction: "payment_failed",
      subject: "Payment unsuccessful — action needed",
      message: [
        "We could not take your latest subscription payment.",
        graceLabel
          ? `A grace period applies until ${graceLabel}. Update your payment method in the Parent Portal billing section to keep access.`
          : "Update your payment method in the Parent Portal billing section to restore or keep access.",
        "This is an essential billing notice.",
      ].join(" "),
    };
  }

  if (next === "past_due" && prev === "past_due" && graceEndingSoon) {
    return {
      kind: "grace_period_ending",
      auditAction: "payment_failed",
      subject: "Grace period ending soon",
      message: [
        `Your payment grace period ends on ${graceLabel}.`,
        "Please update your payment method in the Parent Portal to avoid losing access.",
        "This is an essential billing notice.",
      ].join(" "),
    };
  }

  if (next === "past_due" && prev !== "past_due" && graceLabel) {
    return {
      kind: "grace_period_started",
      auditAction: "payment_failed",
      subject: "Grace period started",
      message: [
        `Payment needs attention. Grace continues until ${graceLabel}.`,
        "Open Manage billing in the Parent Portal to update your payment method.",
        "This is an essential billing notice.",
      ].join(" "),
    };
  }

  if (next === "past_due" && prev === "past_due") {
    return {
      kind: "payment_retry_scheduled",
      auditAction: "payment_failed",
      subject: "Payment retry scheduled",
      message: [
        "We will retry your subscription payment.",
        graceLabel ? `Access continues during grace until ${graceLabel}.` : "Please update your payment method if needed.",
        "This is an essential billing notice.",
      ].join(" "),
    };
  }

  if (
    (next === "active" || next === "trialing")
    && (prev === "past_due" || prev === "unpaid" || prev === "incomplete" || prev === "payment_failed")
  ) {
    return {
      kind: "payment_recovered",
      auditAction: "payment_recovered",
      subject: "Payment recovered — subscription active",
      message: [
        "Your payment was successful and your subscription is active again.",
        periodLabel ? `Next renewal date: ${periodLabel}.` : "",
        "This is an essential billing notice.",
      ].filter(Boolean).join(" "),
    };
  }

  if (next === "cancelled" && periodFuture && prev !== "cancelled") {
    return {
      kind: "subscription_cancelled",
      auditAction: "subscription_cancelled_at_period_end",
      subject: "Subscription cancellation scheduled",
      message: [
        `Your subscription will not renew. Access continues until ${periodLabel}.`,
        "There is no cancellation fee and no automatic pro-rata refund for unused days.",
        "You can reactivate before the period ends from Parent Portal billing.",
        "This is an essential billing notice.",
      ].join(" "),
    };
  }

  if (next === "cancelled" && periodFuture && prev === "cancelled") {
    return {
      kind: "access_ending",
      auditAction: "subscription_cancelled_at_period_end",
      subject: "Access ending soon",
      message: [
        `Reminder: paid access ends on ${periodLabel}.`,
        "Resubscribe from Parent Portal billing if you want to continue.",
        "This is an essential billing notice.",
      ].join(" "),
    };
  }

  if (
    (next === "cancelled" || next === "expired" || next === "inactive")
    && !periodFuture
    && prev !== next
  ) {
    return {
      kind: "subscription_expired",
      auditAction: "subscription_cancelled_at_period_end",
      subject: "Subscription ended",
      message: [
        periodLabel ? `Your subscription access ended on ${periodLabel}.` : "Your subscription access has ended.",
        "Choose a plan in Parent Portal billing to resubscribe.",
        "This is an essential billing notice.",
      ].join(" "),
    };
  }

  return null;
}

/**
 * Essential billing notices — sent even when optional marketing preferences are off.
 * Idempotent via dedupe keys; does not expose Stripe/DB identifiers to the parent.
 */
export async function enqueueParentSubscriptionLifecycleNotice(input: {
  parentId: string;
  eventType: string;
  previousStatus: string | null;
  nextStatus: string;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
  providerEventId?: string | null;
}) {
  const resolved = resolveLifecycleKind(input);
  if (!resolved || !resolved.kind) return { ok: false as const, reason: "no_notice" };

  const user = await prisma.user.findUnique({
    where: { id: input.parentId },
    select: { email: true },
  });
  if (!user?.email) return { ok: false as const, reason: "no_email" };

  const dayKey = new Date().toISOString().slice(0, 10);
  const dedupeKey = [
    "parent-billing",
    resolved.kind,
    input.parentId,
    input.nextStatus,
    input.currentPeriodEnd?.toISOString().slice(0, 10) ?? "none",
    input.graceEndsAt?.toISOString().slice(0, 10) ?? "none",
    // Cap retries: one notice kind per parent per day (plus period/grace anchors).
    dayKey,
  ].join(":");

  const event = await emitNotificationEvent({
    eventType: `parent_subscription_${resolved.kind}`,
    severity: resolved.kind === "payment_failed" || resolved.kind === "grace_period_ending" ? "warning" : "info",
    dedupeKey,
    payload: {
      channel: "email",
      recipient: user.email,
      subject: resolved.subject,
      message: resolved.message,
      essential: true,
      kind: resolved.kind,
    },
  });

  await writeAuditLog({
    actorUserId: input.parentId,
    action: resolved.auditAction,
    entityType: "Subscription",
    entityId: input.parentId,
    metadata: {
      kind: resolved.kind,
      eventType: input.eventType,
      noticeEventId: event.id,
      // provider event id kept in audit only (not parent-facing)
      providerEventId: input.providerEventId ?? null,
    },
  });

  return { ok: true as const, kind: resolved.kind, eventId: event.id };
}
