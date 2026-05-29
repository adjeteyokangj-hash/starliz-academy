import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { buildFinancialEventPayload } from "@/lib/billing/financial-event-builder";
import { buildIdempotencyKey, generateInvoiceNumber } from "@/lib/billing/invoice-number";
import { createTrueNumerisInvoice, createOrUpdateFinancialInvoice, sendFinancialEventToTrueNumeris } from "@/lib/truenumeris/client";
import { getTrueNumerisDefaultRegion } from "@/lib/truenumeris/config";
import { getTrueNumerisSettings } from "@/lib/truenumeris/integration";
import type { TrueNumerisEventRequest, TrueNumerisInvoiceRequest } from "@/types/truenumeris";

type WebhookObject = Record<string, unknown>;
type FinancialProvider = "stripe" | "revolut" | "paystack";

function moneyFromMinorUnits(minorUnits: number): number {
  return Math.max(0, minorUnits) / 100;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveEventType(
  eventType: string,
  provider: FinancialProvider,
): "subscription_payment_success" | "subscription_payment_failed" | null {
  if (provider === "revolut") {
    if (eventType === "ORDER_COMPLETED") return "subscription_payment_success";
    if (eventType === "ORDER_PAYMENT_FAILED" || eventType === "ORDER_PAYMENT_DECLINED") {
      return "subscription_payment_failed";
    }
    return null;
  }

  if (eventType === "invoice.payment_succeeded" || eventType === "checkout.session.completed") {
    return "subscription_payment_success";
  }
  if (eventType === "invoice.payment_failed") {
    return "subscription_payment_failed";
  }
  return null;
}

function resolvePaymentReference(object: WebhookObject): string | null {
  return (
    asString(object.payment_intent)
    ?? asString(object.charge)
    ?? asString(object.order_id)
    ?? asString(object.merchant_order_ext_ref)
    ?? asString(object.id)
    ?? asString(object.invoice)
    ?? null
  );
}

function resolveCurrency(object: WebhookObject): string {
  const currency = asString(object.currency) ?? "GBP";
  return currency.toUpperCase();
}

function resolveGrossAmount(object: WebhookObject): number {
  const amountTotal = Number(object.amount_total ?? object.amount_paid ?? object.amount_due ?? 0);
  return moneyFromMinorUnits(Number.isFinite(amountTotal) ? amountTotal : 0);
}

export async function handleFinancialSyncFromWebhook(input: {
  eventType: string;
  eventId?: string;
  parentId: string;
  object: WebhookObject;
  provider?: FinancialProvider;
  actorUserId?: string;
}) {
  const provider = input.provider ?? "stripe";
  const mappedType = resolveEventType(input.eventType, provider);
  if (!mappedType) {
    return { ok: true, ignored: true, reason: "EVENT_NOT_TRACKED" };
  }

  const settings = await getTrueNumerisSettings();
  if (!settings.enabled) {
    return { ok: true, ignored: true, reason: "INTEGRATION_DISABLED" };
  }

  const paymentReference = resolvePaymentReference(input.object);
  if (!paymentReference) {
    return { ok: false, ignored: true, reason: "NO_PAYMENT_REFERENCE" };
  }

  const region: "UK" | "GH" = settings.region === "GH" ? "GH" : "UK";
  const currency = resolveCurrency(input.object);
  const grossAmount = resolveGrossAmount(input.object);
  const vatEnabled = settings.autoVat;

  const payload = buildFinancialEventPayload({
    source: "subscription_webhook",
    sourceId: input.eventId,
    eventType: mappedType,
    parentId: input.parentId,
    paymentProvider: provider,
    paymentReference,
    region,
    currency,
    grossAmount,
    vatEnabled,
    metadata: {
      providerEventType: input.eventType,
      objectId: asString(input.object.id),
        provider,
    },
  });

  const invoiceNumber = generateInvoiceNumber({
    region: region || getTrueNumerisDefaultRegion(),
    paymentReference,
  });

  if (settings.autoInvoice && mappedType === "subscription_payment_success") {
    const invoice = await createOrUpdateFinancialInvoice({
      invoiceNumber,
      parentId: input.parentId,
      status: "paid",
      currency,
      grossAmount: payload.money.grossAmount,
      vatAmount: payload.money.vatAmount,
      netAmount: payload.money.netAmount,
      providerReference: paymentReference,
      metadata: {
        provider,
        providerEventType: input.eventType,
      },
    });

    const invoiceRequest: TrueNumerisInvoiceRequest = {
      idempotencyKey: buildIdempotencyKey(["invoice", invoice.invoiceNumber, paymentReference]),
      invoiceNumber: invoice.invoiceNumber,
      parentId: input.parentId,
      currency,
      grossAmount: payload.money.grossAmount,
      vatAmount: payload.money.vatAmount,
      netAmount: payload.money.netAmount,
      providerReference: paymentReference,
      metadata: {
        provider,
      },
    };

    void createTrueNumerisInvoice({ request: invoiceRequest, actorUserId: input.actorUserId });
    payload.invoiceNumber = invoice.invoiceNumber;
  }

  const duplicate = await prisma.financialSyncEvent.findFirst({
    where: {
      paymentProvider: provider,
      paymentReference,
      eventType: mappedType,
    },
    select: { id: true, syncStatus: true },
  });

  if (duplicate) {
    return { ok: true, ignored: true, reason: "DUPLICATE_SYNC_EVENT", existingId: duplicate.id };
  }

  const row = await prisma.financialSyncEvent.create({
    data: {
      source: payload.source,
      sourceId: payload.sourceId,
      eventType: mappedType,
      studentId: payload.studentId ?? null,
      parentId: payload.parentId ?? null,
      invoiceNumber: payload.invoiceNumber ?? null,
      currency,
      grossAmount: new Prisma.Decimal(payload.money.grossAmount.toFixed(2)),
      vatAmount: new Prisma.Decimal(payload.money.vatAmount.toFixed(2)),
      netAmount: new Prisma.Decimal(payload.money.netAmount.toFixed(2)),
      paymentProvider: payload.paymentProvider ?? provider,
      paymentReference,
      syncStatus: "pending",
      payloadJson: { event: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue },
    },
  });

  const request: TrueNumerisEventRequest = {
    idempotencyKey: buildIdempotencyKey([
      payload.source,
      payload.sourceId,
      mappedType,
      payload.paymentProvider,
      paymentReference,
    ]),
    event: payload,
  };

  const result = await sendFinancialEventToTrueNumeris({
    request,
    syncEventId: row.id,
    actorUserId: input.actorUserId,
  });

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "financial.sync.processed",
    entityType: "FinancialSyncEvent",
    entityId: row.id,
    metadata: {
      eventType: mappedType,
      paymentReference,
      status: result.ok ? "synced" : "failed",
    },
  });

  return { ok: true, syncEventId: row.id, syncStatus: result.ok ? "synced" : "failed" };
}
