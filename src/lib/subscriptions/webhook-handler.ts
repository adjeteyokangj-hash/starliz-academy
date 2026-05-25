import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { resolveGraceEndsAt } from "./webhook-grace";
import { resolveStripeWebhookStatus } from "./webhook-status";
import { planKeyFromPricingPlan, resolveCurrentPricingPlan } from "@/lib/pricing/service";

type PaymentEvent = {
  id?: string;
  type: string;
  data?: {
    object?: Record<string, unknown>;
  };
};

let paymentWebhookEventsTableReady = false;
const WEBHOOK_EVENT_STALE_MINUTES = 15;

async function ensurePaymentWebhookEventsTable(): Promise<void> {
  if (paymentWebhookEventsTableReady) return;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS payment_webhook_events (
      event_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'processing',
      processed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  paymentWebhookEventsTableReady = true;
}

async function claimPaymentWebhookEvent(eventId: string, provider: string): Promise<boolean> {
  await ensurePaymentWebhookEventsTable();

  const inserted = await prisma.$executeRaw`
    INSERT INTO payment_webhook_events (event_id, provider, status)
    VALUES (${eventId}, ${provider}, 'processing')
    ON CONFLICT (event_id) DO NOTHING
  `;

  if (inserted === 1) {
    return true;
  }

  const existingRows = await prisma.$queryRaw<Array<{ status: string; updated_at: Date }>>`
    SELECT status, updated_at
    FROM payment_webhook_events
    WHERE event_id = ${eventId}
    LIMIT 1
  `;

  const existing = existingRows[0];
  if (!existing || existing.status !== "processing") {
    return false;
  }

  const staleCutoff = new Date(Date.now() - WEBHOOK_EVENT_STALE_MINUTES * 60 * 1000);
  if (new Date(existing.updated_at).getTime() >= staleCutoff.getTime()) {
    return false;
  }

  const reclaimed = await prisma.$executeRaw`
    UPDATE payment_webhook_events
    SET updated_at = NOW()
    WHERE event_id = ${eventId}
      AND status = 'processing'
      AND updated_at = ${existing.updated_at}
  `;

  return reclaimed === 1;
}

async function markPaymentWebhookEventFailed(eventId: string): Promise<void> {
  await ensurePaymentWebhookEventsTable();
  await prisma.$executeRaw`
    DELETE FROM payment_webhook_events
    WHERE event_id = ${eventId} AND status = 'processing'
  `;
}

async function markPaymentWebhookEventProcessed(eventId: string): Promise<void> {
  await ensurePaymentWebhookEventsTable();
  await prisma.$executeRaw`
    UPDATE payment_webhook_events
    SET status = 'processed', processed_at = NOW(), updated_at = NOW()
    WHERE event_id = ${eventId}
  `;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asDateFromSeconds(value: unknown) {
  return typeof value === "number" ? new Date(value * 1000) : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

async function findParent(object: Record<string, unknown>) {
  const metadata = object.metadata && typeof object.metadata === "object" ? (object.metadata as Record<string, unknown>) : {};
  const userId = asString(metadata.userId);
  const clientReferenceId = asString(object.client_reference_id);
  const parentId = asString(metadata.parentId);
  const email = asString(object.customer_email) ?? asString(object.email) ?? asString(metadata.email);
  const customerId = asString(object.customer);

  if (userId) {
    const parent = await prisma.user.findFirst({ where: { id: userId, role: "parent" } });
    if (parent) return parent;
  }
  if (clientReferenceId) {
    const parent = await prisma.user.findFirst({ where: { id: clientReferenceId, role: "parent" } });
    if (parent) return parent;
  }

  if (parentId) {
    const parent = await prisma.user.findFirst({ where: { id: parentId, role: "parent" } });
    if (parent) return parent;
  }
  if (customerId) {
    const subscription = await prisma.subscription.findFirst({ where: { providerCustomerId: customerId }, include: { parent: true } });
    if (subscription?.parent) return subscription.parent;
  }
  if (email) {
    return prisma.user.findFirst({ where: { email, role: "parent" } });
  }
  return null;
}

export async function handlePaymentWebhook(event: PaymentEvent) {
  const eventId = typeof event.id === "string" && event.id.trim() ? event.id.trim() : null;
  if (eventId) {
    const claimed = await claimPaymentWebhookEvent(eventId, "stripe");
    if (!claimed) {
      try {
        await writeAuditLog({
          action: "payment.webhook.duplicate",
          entityType: "WebhookEvent",
          entityId: eventId,
          metadata: {
            provider: "stripe",
            eventId,
            eventType: event.type,
          },
        });
      } catch {
        // Avoid breaking webhook handling if audit logging fails.
      }
      return { ok: true, ignored: true, reason: "DUPLICATE_EVENT" };
    }
  }

  const object = event.data?.object;
  if (!object || typeof object !== "object") {
    if (eventId) await markPaymentWebhookEventFailed(eventId);
    return { ok: false, ignored: true, reason: "INVALID_EVENT_PAYLOAD" };
  }

  const parent = await findParent(object);
  if (!parent) {
    if (eventId) await markPaymentWebhookEventFailed(eventId);
    return { ok: false, ignored: true, reason: "PARENT_NOT_FOUND" };
  }

  const providerCustomerId = asString(object.customer);
  const providerSubId = asString(object.subscription) ?? asString(object.id);
  const metadata = object.metadata && typeof object.metadata === "object" ? (object.metadata as Record<string, unknown>) : {};
  const provider = asString(metadata.provider) ?? "stripe";
  const pricingPlanId = asString(metadata.pricingPlanId);
  if (provider !== "stripe") {
    if (eventId) await markPaymentWebhookEventFailed(eventId);
    return { ok: false, ignored: true, reason: "UNSUPPORTED_PROVIDER" };
  }

  const allowedEvents = new Set([
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_succeeded",
    "invoice.payment_failed",
  ]);
  if (!allowedEvents.has(event.type)) {
    if (eventId) await markPaymentWebhookEventProcessed(eventId);
    return { ok: true, ignored: true, reason: "IGNORED_EVENT_TYPE" };
  }

  try {
    const existing = await prisma.subscription.findFirst({
      where: providerSubId ? { parentId: parent.id, providerSubId } : { parentId: parent.id },
    });

    const objectCurrentPeriodEnd = asDateFromSeconds(object.current_period_end);
    const currentPeriodEnd = objectCurrentPeriodEnd ?? existing?.currentPeriodEnd ?? undefined;
    const status = resolveStripeWebhookStatus({
      eventType: event.type,
      rawStatus: asString(object.status),
      existingStatus: existing?.status,
      cancelAtPeriodEnd: asBoolean(object.cancel_at_period_end),
      currentPeriodEnd,
    });

    const resolvedPlan = await resolveCurrentPricingPlan({
      pricingPlanId,
      legacyPlanKey: asString(metadata.planKey) ?? undefined,
    });
    const planKey = resolvedPlan ? planKeyFromPricingPlan(resolvedPlan) : (asString(metadata.planKey) ?? "free");
    const trialEndsAt = asDateFromSeconds(object.trial_end) ?? existing?.trialEndsAt ?? undefined;
    const graceEndsAt = resolveGraceEndsAt({ status, existingGraceEndsAt: existing?.graceEndsAt });

    const data = {
      provider,
      providerCustomerId,
      providerSubId,
      pricingPlanId: resolvedPlan?.id ?? pricingPlanId,
      planKey,
      status,
      currentPeriodEnd,
      trialEndsAt,
      graceEndsAt,
    };

    const subscription = existing
      ? await prisma.subscription.update({ where: { id: existing.id }, data })
      : await prisma.subscription.create({ data: { parentId: parent.id, ...data } });

    await prisma.parentProfile.upsert({
      where: { userId: parent.id },
      create: {
        userId: parent.id,
        phone: "Not set",
        status: status === "past_due" || status === "cancelled" ? "suspended" : "active",
        trialStatus: status === "trialing" ? "trial" : status,
        subscriptionPlan: planKey,
        stripeCustomerId: providerCustomerId ?? null,
      },
      update: {
        status: status === "past_due" || status === "cancelled" ? "suspended" : "active",
        trialStatus: status === "trialing" ? "trial" : status,
        subscriptionPlan: planKey,
        stripeCustomerId: providerCustomerId ?? undefined,
      },
    });

    await writeAuditLog({
      action: "payment.webhook",
      entityType: "Subscription",
      entityId: subscription.id,
      metadata: { eventType: event.type, status, planKey, pricingPlanId, parentId: parent.id },
    });

    if (eventId) await markPaymentWebhookEventProcessed(eventId);

    return { ok: true, subscriptionId: subscription.id, status };
  } catch (error) {
    if (eventId) await markPaymentWebhookEventFailed(eventId);
    throw error;
  }
}
