import { prisma } from "@/lib/db";
import { emitNotificationEvent } from "@/lib/notifications/dispatcher";
import { writeAuditLog } from "@/lib/audit";
import {
  formatParentSubscriptionStatus,
  getLatestParentSubscription,
} from "@/lib/subscriptions/parent-subscription-access";

function formatEnGbDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Admin-triggered essential billing reminder using existing notification infrastructure.
 * Never reports success unless a notification event was created (or dedupe returns an existing one).
 * Does not expose Stripe/DB identifiers in parent-facing copy.
 */
export async function enqueueAdminPaymentLifecycleReminder(input: {
  parentId: string;
  actorUserId: string;
}) {
  const subscription = await getLatestParentSubscription(input.parentId);
  if (!subscription) {
    await writeAuditLog({
      actorUserId: input.actorUserId,
      action: "admin_payment_notice_failed",
      entityType: "Subscription",
      entityId: input.parentId,
      metadata: { reason: "no_subscription", parentId: input.parentId },
    });
    return { ok: false as const, status: 404 as const, error: "No subscription found for this parent." };
  }

  const user = await prisma.user.findUnique({
    where: { id: input.parentId },
    select: { email: true, role: true },
  });
  if (!user || user.role !== "parent" || !user.email) {
    await writeAuditLog({
      actorUserId: input.actorUserId,
      action: "admin_payment_notice_failed",
      entityType: "Subscription",
      entityId: subscription.id,
      metadata: { reason: "no_parent_email", parentId: input.parentId },
    });
    return { ok: false as const, status: 404 as const, error: "Parent email not available." };
  }

  const statusMeta = formatParentSubscriptionStatus({
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd,
    graceEndsAt: subscription.graceEndsAt,
  });

  const periodLabel = formatEnGbDate(subscription.currentPeriodEnd);
  const graceLabel = formatEnGbDate(subscription.graceEndsAt);
  const paymentAttention = ["past_due", "unpaid", "incomplete", "payment_failed"].includes(
    (subscription.status ?? "").toLowerCase(),
  );

  let kind: "payment_attention" | "access_ending" | "inactive_resubscribe";
  let subject: string;
  let message: string;

  if (paymentAttention) {
    kind = "payment_attention";
    subject = "Payment needs attention";
    message = [
      "We could not take your latest subscription payment.",
      graceLabel
        ? `A grace period applies until ${graceLabel}. Update your payment method in the Parent Portal billing section to keep access.`
        : "Update your payment method in the Parent Portal billing section to restore or keep access.",
      "There is no cancellation fee and no automatic pro-rata refund for unused days.",
      "This is an essential billing notice.",
    ].join(" ");
  } else if (statusMeta.cancelScheduled) {
    kind = "access_ending";
    subject = "Access ending soon";
    message = [
      periodLabel
        ? `Reminder: paid access ends on ${periodLabel}.`
        : "Reminder: your subscription is scheduled to end at the period end.",
      "You can reactivate before the period ends from Parent Portal billing.",
      "There is no cancellation fee and no automatic pro-rata refund for unused days.",
      "This is an essential billing notice.",
    ].join(" ");
  } else if (statusMeta.code === "active" || statusMeta.code === "trialing") {
    await writeAuditLog({
      actorUserId: input.actorUserId,
      action: "admin_payment_notice_failed",
      entityType: "Subscription",
      entityId: subscription.id,
      metadata: { reason: "not_applicable_active", parentId: input.parentId, status: subscription.status },
    });
    return {
      ok: false as const,
      status: 409 as const,
      error: "Payment reminder is only available when payment needs attention or cancellation is scheduled.",
    };
  } else {
    kind = "inactive_resubscribe";
    subject = "Subscription not active";
    message = [
      periodLabel
        ? `Your subscription access ended on ${periodLabel}.`
        : "Your subscription is not currently active.",
      "Choose a plan in Parent Portal billing to resubscribe.",
      "This is an essential billing notice.",
    ].join(" ");
  }

  const dayKey = new Date().toISOString().slice(0, 10);
  const dedupeKey = [
    "admin-parent-billing-reminder",
    kind,
    input.parentId,
    subscription.status,
    subscription.currentPeriodEnd?.toISOString().slice(0, 10) ?? "none",
    dayKey,
  ].join(":");

  try {
    const event = await emitNotificationEvent({
      eventType: `admin_parent_subscription_${kind}`,
      severity: paymentAttention ? "warning" : "info",
      dedupeKey,
      payload: {
        channel: "email",
        recipient: user.email,
        subject,
        message,
        essential: true,
        kind,
        parentId: input.parentId,
      },
    });

    await writeAuditLog({
      actorUserId: input.actorUserId,
      action: "admin_payment_notice_enqueued",
      entityType: "Subscription",
      entityId: subscription.id,
      metadata: {
        parentId: input.parentId,
        kind,
        noticeEventId: event.id,
        dedupeKey,
        status: subscription.status,
      },
    });

    return {
      ok: true as const,
      eventId: event.id,
      kind,
      message: "Payment lifecycle notice enqueued for the parent.",
    };
  } catch (error) {
    await writeAuditLog({
      actorUserId: input.actorUserId,
      action: "admin_payment_notice_failed",
      entityType: "Subscription",
      entityId: subscription.id,
      metadata: {
        parentId: input.parentId,
        reason: error instanceof Error ? error.message : "enqueue_failed",
      },
    });
    return {
      ok: false as const,
      status: 500 as const,
      error: "Unable to enqueue payment notice.",
    };
  }
}
