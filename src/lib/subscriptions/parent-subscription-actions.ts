import { prisma } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";
import { writeAuditLog } from "@/lib/audit";
import { getLatestParentSubscription, subscriptionGrantsAccess } from "@/lib/subscriptions/parent-subscription-access";

export async function requestCancelAtPeriodEnd(input: {
  parentId: string;
  actorUserId: string;
}) {
  const current = await getLatestParentSubscription(input.parentId);
  if (!current) {
    return { ok: false as const, status: 404 as const, error: "No subscription found." };
  }

  const status = current.status.toLowerCase();
  const now = new Date();
  const alreadyScheduled =
    status === "cancelled" && current.currentPeriodEnd && current.currentPeriodEnd.getTime() > now.getTime();

  if (alreadyScheduled) {
    await writeAuditLog({
      actorUserId: input.actorUserId,
      action: "subscription_cancel_requested",
      entityType: "Subscription",
      entityId: current.id,
      metadata: { idempotent: true, accessEndsAt: current.currentPeriodEnd?.toISOString() ?? null },
    });
    return {
      ok: true as const,
      idempotent: true,
      status: current.status,
      accessEndsAt: current.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  if (!subscriptionGrantsAccess(current) && status !== "past_due" && status !== "trialing" && status !== "active") {
    return { ok: false as const, status: 409 as const, error: "Subscription is not active." };
  }

  if (current.provider === "stripe" && current.providerSubId) {
    const stripe = await getStripeClient();
    if (!stripe) {
      return { ok: false as const, status: 503 as const, error: "Stripe is not configured." };
    }
    await stripe.subscriptions.update(current.providerSubId, { cancel_at_period_end: true });
  }

  const accessEndsAt = current.currentPeriodEnd ?? null;
  const updated = await prisma.subscription.update({
    where: { id: current.id },
    data: {
      status: "cancelled",
      // Keep currentPeriodEnd so access continues until paid period ends.
    },
  });

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "subscription_cancelled_at_period_end",
    entityType: "Subscription",
    entityId: updated.id,
    metadata: {
      accessEndsAt: accessEndsAt?.toISOString() ?? null,
      provider: updated.provider,
    },
  });

  return {
    ok: true as const,
    idempotent: false,
    status: updated.status,
    accessEndsAt: accessEndsAt?.toISOString() ?? null,
  };
}

export async function requestReactivateSubscription(input: {
  parentId: string;
  actorUserId: string;
}) {
  const current = await getLatestParentSubscription(input.parentId);
  if (!current) {
    return { ok: false as const, status: 404 as const, error: "No subscription found." };
  }

  const now = new Date();
  const status = current.status.toLowerCase();
  const cancelScheduled =
    status === "cancelled"
    && current.currentPeriodEnd
    && current.currentPeriodEnd.getTime() > now.getTime();

  // Already active (including after a prior reactivate) — treat as idempotent success.
  if (status === "active" || status === "trialing") {
    await writeAuditLog({
      actorUserId: input.actorUserId,
      action: "subscription_reactivated",
      entityType: "Subscription",
      entityId: current.id,
      metadata: { idempotent: true, renewalDate: current.currentPeriodEnd?.toISOString() ?? null },
    });
    return {
      ok: true as const,
      idempotent: true,
      status: current.status,
      renewalDate: current.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  if (!cancelScheduled) {
    return { ok: false as const, status: 409 as const, error: "Subscription is not scheduled to cancel." };
  }

  if (current.provider === "stripe" && current.providerSubId) {
    const stripe = await getStripeClient();
    if (!stripe) {
      return { ok: false as const, status: 503 as const, error: "Stripe is not configured." };
    }
    await stripe.subscriptions.update(current.providerSubId, { cancel_at_period_end: false });
  }

  const updated = await prisma.subscription.update({
    where: { id: current.id },
    data: { status: "active" },
  });

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "subscription_reactivated",
    entityType: "Subscription",
    entityId: updated.id,
    metadata: { renewalDate: updated.currentPeriodEnd?.toISOString() ?? null, idempotent: false },
  });

  return {
    ok: true as const,
    idempotent: false,
    status: updated.status,
    renewalDate: updated.currentPeriodEnd?.toISOString() ?? null,
  };
}
