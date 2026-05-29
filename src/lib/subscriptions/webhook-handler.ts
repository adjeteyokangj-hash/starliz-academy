import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { resolveGraceEndsAt } from "./webhook-grace";
import { resolveRevolutWebhookStatus, resolveStripeWebhookStatus } from "./webhook-status";
import { planKeyFromPricingPlan, resolveCurrentPricingPlan } from "@/lib/pricing/service";
import { handleFinancialSyncFromWebhook } from "@/lib/billing/truenumeris-pipeline";

type PaymentEvent = {
  id?: string;
  type?: string;
  event?: string;
  data?: {
    object?: Record<string, unknown>;
  } | Record<string, unknown>;
  order_id?: string;
  merchant_order_ext_ref?: string;
};

type ProviderKind = "stripe" | "paystack" | "revolut";

function resolveProviderFromEvent(event: PaymentEvent): ProviderKind {
  if (typeof event.order_id === "string" && event.order_id.trim()) return "revolut";
  if (typeof event.merchant_order_ext_ref === "string" && event.merchant_order_ext_ref.trim() && !event.data) return "revolut";
  if (typeof event.event === "string" && event.event.trim()) return "paystack";
  return "stripe";
}

function getEventType(event: PaymentEvent): string {
  if (typeof event.type === "string" && event.type.trim()) return event.type.trim();
  if (typeof event.event === "string" && event.event.trim()) return event.event.trim();
  return "unknown";
}

function getEventObject(event: PaymentEvent, provider: ProviderKind): Record<string, unknown> | null {
  if (provider === "revolut") {
    return event as Record<string, unknown>;
  }

  if (provider === "paystack") {
    const data = event.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      if ("object" in data && typeof (data as { object?: unknown }).object === "object") {
        return ((data as { object?: unknown }).object ?? null) as Record<string, unknown> | null;
      }
      return data as Record<string, unknown>;
    }
    return null;
  }
  const data = event.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (!("object" in data)) return null;
  const value = (data as { object?: unknown }).object;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function resolvePaystackStatus(eventType: string): string {
  if (eventType === "charge.success") return "active";
  if (eventType === "invoice.payment_failed" || eventType === "charge.failed") return "payment_failed";
  if (eventType === "subscription.disable" || eventType === "subscription.not_renew") return "cancelled";
  if (eventType === "subscription.create") return "trialing";
  return "pending";
}

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
  const orderId = asString(object.order_id);

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
  if (orderId) {
    const subscription = await prisma.subscription.findFirst({ where: { providerSubId: orderId }, include: { parent: true } });
    if (subscription?.parent) return subscription.parent;
  }
  if (email) {
    return prisma.user.findFirst({ where: { email, role: "parent" } });
  }
  return null;
}

export async function handlePaymentWebhook(event: PaymentEvent) {
  const provider = resolveProviderFromEvent(event);
  const eventType = getEventType(event);
  const eventId = typeof event.id === "string" && event.id.trim() ? event.id.trim() : null;
  const derivedEventId = eventId ?? `${provider}:${eventType}:${Date.now()}`;
  if (eventId) {
    const claimed = await claimPaymentWebhookEvent(eventId, provider);
    if (!claimed) {
      try {
        await writeAuditLog({
          action: "payment.webhook.duplicate",
          entityType: "WebhookEvent",
          entityId: derivedEventId,
          metadata: {
            provider,
            eventId: derivedEventId,
            eventType,
          },
        });
      } catch {
        // Avoid breaking webhook handling if audit logging fails.
      }
      return { ok: true, ignored: true, reason: "DUPLICATE_EVENT" };
    }
  }

  const object = getEventObject(event, provider);
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
  const providerSubId = asString(object.subscription) ?? asString(object.order_id) ?? asString(object.id);
  const metadata = object.metadata && typeof object.metadata === "object" ? (object.metadata as Record<string, unknown>) : {};
  const providerFromMetadata = asString(metadata.provider);
  const resolvedProvider = providerFromMetadata === "paystack" ? "paystack" : provider;
  if (resolvedProvider !== "stripe" && resolvedProvider !== "paystack" && resolvedProvider !== "revolut") {
    if (eventId) await markPaymentWebhookEventFailed(eventId);
    return { ok: false, ignored: true, reason: "UNSUPPORTED_PROVIDER" };
  }

  const stripeAllowedEvents = new Set([
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_succeeded",
    "invoice.payment_failed",
  ]);
  const paystackAllowedEvents = new Set([
    "charge.success",
    "charge.failed",
    "subscription.create",
    "subscription.disable",
    "subscription.not_renew",
  ]);
  const revolutAllowedEvents = new Set([
    "ORDER_AUTHORISED",
    "ORDER_COMPLETED",
    "ORDER_PAYMENT_DECLINED",
    "ORDER_PAYMENT_FAILED",
  ]);
  const allowedEvents = resolvedProvider === "paystack" ? paystackAllowedEvents : resolvedProvider === "revolut" ? revolutAllowedEvents : stripeAllowedEvents;
  if (!allowedEvents.has(eventType)) {
    if (eventId) await markPaymentWebhookEventProcessed(eventId);
    return { ok: true, ignored: true, reason: "IGNORED_EVENT_TYPE" };
  }

  try {
    const existing = await prisma.subscription.findFirst({
      where: providerSubId ? { parentId: parent.id, providerSubId } : { parentId: parent.id },
    });
    const pricingPlanId = asString(metadata.pricingPlanId) ?? existing?.pricingPlanId ?? undefined;

    const objectCurrentPeriodEnd = asDateFromSeconds(object.current_period_end);
    const currentPeriodEnd = objectCurrentPeriodEnd ?? existing?.currentPeriodEnd ?? undefined;
    const status = resolvedProvider === "paystack"
      ? resolvePaystackStatus(eventType)
      : resolvedProvider === "revolut"
        ? resolveRevolutWebhookStatus({ eventType, existingStatus: existing?.status })
      : resolveStripeWebhookStatus({
          eventType,
          rawStatus: asString(object.status),
          existingStatus: existing?.status,
          cancelAtPeriodEnd: asBoolean(object.cancel_at_period_end),
          currentPeriodEnd,
        });

    const resolvedPlan = await resolveCurrentPricingPlan({
      pricingPlanId,
      legacyPlanKey: asString(metadata.planKey) ?? undefined,
    });
    const planKey = resolvedPlan ? planKeyFromPricingPlan(resolvedPlan) : (asString(metadata.planKey) ?? existing?.planKey ?? "free");
    const trialEndsAt = asDateFromSeconds(object.trial_end) ?? existing?.trialEndsAt ?? undefined;
    const graceEndsAt = resolveGraceEndsAt({ status, existingGraceEndsAt: existing?.graceEndsAt });

    const data = {
      provider: resolvedProvider,
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
        stripeCustomerId: resolvedProvider === "stripe" ? providerCustomerId ?? null : null,
      },
      update: {
        status: status === "past_due" || status === "cancelled" ? "suspended" : "active",
        trialStatus: status === "trialing" ? "trial" : status,
        subscriptionPlan: planKey,
        stripeCustomerId: resolvedProvider === "stripe" ? providerCustomerId ?? undefined : undefined,
      },
    });

    await writeAuditLog({
      action: "payment.webhook",
      entityType: "Subscription",
      entityId: subscription.id,
      metadata: { eventType, status, planKey, pricingPlanId, parentId: parent.id, provider: resolvedProvider },
    });

    try {
      await handleFinancialSyncFromWebhook({
        eventType,
        eventId: eventId ?? undefined,
        parentId: parent.id,
        object,
      });
    } catch {
      // Financial sync should not block subscription updates.
    }

    if (eventId) await markPaymentWebhookEventProcessed(eventId);

    return { ok: true, subscriptionId: subscription.id, status };
  } catch (error) {
    if (eventId) await markPaymentWebhookEventFailed(eventId);
    throw error;
  }
}
