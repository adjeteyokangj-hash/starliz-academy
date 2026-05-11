import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { addDays, PAST_DUE_GRACE_DAYS } from "./plans";
import { normalizePlanKey } from "./plans";

type PaymentEvent = {
  type: string;
  data?: {
    object?: Record<string, unknown>;
  };
};

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asDateFromSeconds(value: unknown) {
  return typeof value === "number" ? new Date(value * 1000) : undefined;
}

function mapStatus(eventType: string, rawStatus?: string) {
  if (eventType === "checkout.session.completed") return "active";
  if (eventType === "customer.subscription.deleted") return "cancelled";
  if (eventType === "invoice.payment_failed") return "past_due";
  if (eventType === "invoice.payment_succeeded") return "active";
  if (rawStatus === "trialing") return "trialing";
  if (rawStatus === "active") return "active";
  if (rawStatus === "past_due" || rawStatus === "unpaid") return "past_due";
  if (rawStatus === "canceled" || rawStatus === "cancelled") return "cancelled";
  if (rawStatus === "trial") return "trialing";
  return "active";
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
  const object = event.data?.object;
  if (!object || typeof object !== "object") {
    return { ok: false, ignored: true, reason: "INVALID_EVENT_PAYLOAD" };
  }

  const parent = await findParent(object);
  if (!parent) {
    return { ok: false, ignored: true, reason: "PARENT_NOT_FOUND" };
  }

  const providerCustomerId = asString(object.customer);
  const providerSubId = asString(object.subscription) ?? asString(object.id);
  const metadata = object.metadata && typeof object.metadata === "object" ? (object.metadata as Record<string, unknown>) : {};
  const provider = asString(metadata.provider) ?? "stripe";
  const pricingPlanId = asString(metadata.pricingPlanId);
  if (provider !== "stripe") {
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
    return { ok: true, ignored: true, reason: "IGNORED_EVENT_TYPE" };
  }

  const status = mapStatus(event.type, asString(object.status));
  const planKey = normalizePlanKey(asString(metadata.planKey) ?? "monthly");
  const currentPeriodEnd = asDateFromSeconds(object.current_period_end);
  const trialEndsAt = asDateFromSeconds(object.trial_end);
  const graceEndsAt = status === "past_due" ? addDays(new Date(), PAST_DUE_GRACE_DAYS) : undefined;

  const existing = await prisma.subscription.findFirst({
    where: providerSubId ? { parentId: parent.id, providerSubId } : { parentId: parent.id },
  });

  const data = {
    provider,
    providerCustomerId,
    providerSubId,
    pricingPlanId,
    planKey,
    status,
    currentPeriodEnd,
    trialEndsAt,
    graceEndsAt,
  };

  const subscription = existing
    ? await prisma.subscription.update({ where: { id: existing.id }, data })
    : await prisma.subscription.create({ data: { parentId: parent.id, ...data } });

  await writeAuditLog({
    action: "payment.webhook",
    entityType: "Subscription",
    entityId: subscription.id,
    metadata: { eventType: event.type, status, planKey, pricingPlanId, parentId: parent.id },
  });

  return { ok: true, subscriptionId: subscription.id, status };
}
