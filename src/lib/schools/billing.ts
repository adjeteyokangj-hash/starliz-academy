/**
 * School billing utilities.
 *
 * Centralises all Stripe school subscription operations:
 *   - Creating a Stripe customer for a school
 *   - Creating/updating a school subscription
 *   - Seat upgrades (quantity changes)
 *   - Handling webhook events (payment_failed, subscription updated)
 *   - Auto-suspension after grace period
 */

import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { writeLicenceEvent, writeSchoolAuditLog } from "./audit";

export const SCHOOL_GRACE_PERIOD_DAYS = 7;

async function getConfiguredStripe(): Promise<Stripe> {
  const stripe = await getStripeClient();
  if (!stripe) {
    throw new Error("Stripe is not configured.");
  }
  return stripe;
}

// ─── Customer management ──────────────────────────────────────────────────

/**
 * Ensures a Stripe customer exists for the school, creating one if needed.
 * Stores providerCustomerId on the SchoolLicence record.
 */
export async function ensureSchoolStripeCustomer(schoolId: string): Promise<string> {
  const stripe = await getConfiguredStripe();
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    include: { licence: true },
  });
  if (!school) throw new Error(`School ${schoolId} not found`);

  if (school.licence?.providerCustomerId) {
    return school.licence.providerCustomerId;
  }

  const customer = await stripe.customers.create({
    name: school.name,
    email: school.contactEmail ?? undefined,
    metadata: { schoolId },
  });

  await prisma.schoolLicence.upsert({
    where: { schoolId },
    create: {
      schoolId,
      provider: "stripe",
      providerCustomerId: customer.id,
      status: "pilot",
      seatLimit: 0,
    },
    update: {
      provider: "stripe",
      providerCustomerId: customer.id,
    },
  });

  return customer.id;
}

// ─── Seat upgrades ─────────────────────────────────────────────────────────

/**
 * Updates the Stripe subscription quantity to match the new seat limit.
 * Also updates the local SchoolLicence.seatLimit.
 */
export async function upgradeSchoolSeats(
  schoolId: string,
  newSeatLimit: number,
  actorUserId?: string
): Promise<void> {
  const stripe = await getConfiguredStripe();
  const licence = await prisma.schoolLicence.findUnique({ where: { schoolId } });
  if (!licence) throw new Error(`No licence for school ${schoolId}`);

  if (licence.providerSubscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(licence.providerSubscriptionId);
    const item = subscription.items.data[0];
    if (item) {
      await stripe.subscriptions.update(licence.providerSubscriptionId, {
        items: [{ id: item.id, quantity: newSeatLimit }],
        proration_behavior: "always_invoice",
      });
    }
  }

  await prisma.schoolLicence.update({
    where: { schoolId },
    data: { seatLimit: newSeatLimit },
  });

  await Promise.all([
    writeSchoolAuditLog({
      schoolId,
      actorUserId,
      action: "seat_upgraded",
      entityType: "licence",
      entityId: licence.id,
      metadata: { previousSeatLimit: licence.seatLimit, newSeatLimit },
      severity: "info",
    }),
    writeLicenceEvent({
      schoolId,
      schoolLicenceId: licence.id,
      eventType: "seat_limit_updated",
      previousStatus: licence.status,
      nextStatus: licence.status,
      actorUserId,
      metadata: { previousSeatLimit: licence.seatLimit, newSeatLimit },
    }),
  ]);
}

// ─── Webhook handlers ─────────────────────────────────────────────────────

type StripeSubscriptionEvent = {
  schoolId: string;
  subscriptionId: string;
  status: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
};

/**
 * Handles subscription status updates from Stripe webhooks.
 * Maps Stripe status → SchoolLicence status, sets grace period on past_due.
 */
export async function handleSchoolSubscriptionUpdate(event: StripeSubscriptionEvent): Promise<void> {
  const { schoolId, subscriptionId, status, currentPeriodEnd } = event;

  let licenceStatus: string;
  let graceEndsAt: Date | null = null;

  switch (status) {
    case "active":
      licenceStatus = "active";
      break;
    case "trialing":
      licenceStatus = "trialing";
      break;
    case "past_due":
      licenceStatus = "past_due";
      // Grace period: SCHOOL_GRACE_PERIOD_DAYS after current period end
      graceEndsAt = new Date(currentPeriodEnd.getTime() + SCHOOL_GRACE_PERIOD_DAYS * 86_400_000);
      break;
    case "canceled":
    case "cancelled":
      licenceStatus = "cancelled";
      break;
    case "unpaid":
      licenceStatus = "suspended";
      break;
    default:
      licenceStatus = status;
  }

  const licence = await prisma.schoolLicence.findUnique({ where: { schoolId } });

  await prisma.schoolLicence.upsert({
    where: { schoolId },
    create: {
      schoolId,
      provider: "stripe",
      providerSubscriptionId: subscriptionId,
      status: licenceStatus,
      seatLimit: 0,
      currentPeriodEnd,
      endsAt: graceEndsAt,
    },
    update: {
      providerSubscriptionId: subscriptionId,
      status: licenceStatus,
      currentPeriodEnd,
      endsAt: graceEndsAt,
    },
  });

  if (licence) {
    await writeLicenceEvent({
      schoolId,
      schoolLicenceId: licence.id,
      eventType: "subscription_status_updated",
      previousStatus: licence.status,
      nextStatus: licenceStatus,
      metadata: {
        stripeSubscriptionId: subscriptionId,
        currentPeriodEnd: currentPeriodEnd.toISOString(),
        graceEndsAt: graceEndsAt?.toISOString() ?? null,
      },
    });
  }

  if (licenceStatus === "suspended") {
    await writeSchoolAuditLog({
      schoolId,
      action: "licence_suspended",
      entityType: "licence",
      entityId: licence?.id,
      metadata: { stripeSubscriptionId: subscriptionId, reason: "unpaid" },
      severity: "critical",
    });
  } else if (licenceStatus === "active") {
    await writeSchoolAuditLog({
      schoolId,
      action: "licence_renewed",
      entityType: "licence",
      entityId: licence?.id,
      metadata: { stripeSubscriptionId: subscriptionId, currentPeriodEnd: currentPeriodEnd.toISOString() },
      severity: "info",
    });
  }
}

/**
 * Auto-suspends schools whose grace period has ended.
 * Intended to be called from a scheduled job (e.g. daily cron).
 */
export async function autoSuspendExpiredGracePeriods(): Promise<number> {
  const now = new Date();
  const result = await prisma.schoolLicence.updateMany({
    where: {
      status: "past_due",
      endsAt: { lte: now },
    },
    data: { status: "suspended" },
  });

  // Audit each suspended school
  if (result.count > 0) {
    const suspended = await prisma.schoolLicence.findMany({
      where: { status: "suspended" },
      select: { id: true, schoolId: true },
    });
    await Promise.allSettled(
      suspended.flatMap((l) => [
        writeSchoolAuditLog({
          schoolId: l.schoolId,
          action: "licence_suspended",
          entityType: "licence",
          entityId: l.id,
          metadata: { reason: "grace_period_expired", autoSuspended: true },
          severity: "critical",
        }),
        writeLicenceEvent({
          schoolId: l.schoolId,
          schoolLicenceId: l.id,
          eventType: "auto_suspended_after_grace",
          previousStatus: "past_due",
          nextStatus: "suspended",
          metadata: { reason: "grace_period_expired" },
        }),
      ])
    );
  }

  return result.count;
}
