type StripeWebhookStatusInput = {
  eventType: string;
  rawStatus?: string;
  existingStatus?: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: Date | null;
  now?: Date;
};

type RevolutWebhookStatusInput = {
  eventType: string;
  existingStatus?: string;
};

function normalizeStatus(status: string | undefined): string | null {
  if (!status) return null;
  const raw = status.toLowerCase();
  if (raw === "trial") return "trialing";
  if (raw === "unpaid" || raw === "incomplete") return "past_due";
  if (raw === "canceled" || raw === "incomplete_expired") return "cancelled";
  if (["active", "trialing", "past_due", "cancelled", "blocked"].includes(raw)) {
    return raw;
  }
  return null;
}

export function resolveStripeWebhookStatus(input: StripeWebhookStatusInput): string {
  const now = input.now ?? new Date();
  const eventType = input.eventType;
  const normalizedRaw = normalizeStatus(input.rawStatus);
  const normalizedExisting = normalizeStatus(input.existingStatus) ?? "active";
  const currentPeriodEnd = input.currentPeriodEnd ?? null;
  const cancelAtPeriodEnd = input.cancelAtPeriodEnd === true;

  if (eventType === "customer.subscription.deleted") {
    return "cancelled";
  }

  if (eventType === "invoice.payment_failed") {
    return normalizedExisting === "cancelled" ? "cancelled" : "past_due";
  }

  if (eventType === "invoice.payment_succeeded") {
    if (normalizedRaw === "active" || normalizedRaw === "trialing") {
      return normalizedRaw;
    }
    if (normalizedExisting === "cancelled" && (!currentPeriodEnd || currentPeriodEnd.getTime() <= now.getTime())) {
      return "cancelled";
    }
    return "active";
  }

  if (eventType === "checkout.session.completed") {
    return "active";
  }

  // Local model: cancel_at_period_end with paid time remaining is stored as cancelled
  // while currentPeriodEnd remains in the future (access continues until then).
  if (cancelAtPeriodEnd && (normalizedRaw === "active" || normalizedRaw === "trialing") && currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime()) {
    return "cancelled";
  }

  return normalizedRaw ?? normalizedExisting;
}

export function resolveRevolutWebhookStatus(input: RevolutWebhookStatusInput): string {
  const existingStatus = normalizeStatus(input.existingStatus) ?? "pending";

  if (input.eventType === "ORDER_COMPLETED") {
    return "active";
  }

  if (input.eventType === "ORDER_AUTHORISED") {
    return existingStatus === "active" ? "active" : "pending";
  }

  if (input.eventType === "ORDER_PAYMENT_FAILED" || input.eventType === "ORDER_PAYMENT_DECLINED") {
    return existingStatus === "cancelled" ? "cancelled" : "past_due";
  }

  return existingStatus;
}
