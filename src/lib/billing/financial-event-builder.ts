import type { FinancialEventPayload, FinancialEventType } from "@/types/financial";
import { calculateVat } from "@/lib/billing/vat-calculator";

export type PaymentEventBuilderInput = {
  source: string;
  sourceId?: string;
  eventType: FinancialEventType;
  parentId?: string;
  studentId?: string;
  paymentProvider?: string;
  paymentReference?: string;
  region: "UK" | "GH";
  currency: string;
  grossAmount: number;
  vatEnabled: boolean;
  subscriptionPlan?: string;
  metadata?: Record<string, unknown>;
};

export function buildFinancialEventPayload(input: PaymentEventBuilderInput): FinancialEventPayload {
  const vat = calculateVat({
    grossAmount: input.grossAmount,
    country: input.region,
    currency: input.currency,
    provider: input.paymentProvider,
    subscriptionPlan: input.subscriptionPlan,
    vatEnabled: input.vatEnabled,
  });

  return {
    source: input.source,
    sourceId: input.sourceId,
    eventType: input.eventType,
    studentId: input.studentId,
    parentId: input.parentId,
    paymentProvider: input.paymentProvider,
    paymentReference: input.paymentReference,
    region: input.region,
    metadata: {
      ...input.metadata,
      vatRate: vat.vatRate,
      vatEnabled: vat.vatEnabled,
      country: vat.country,
    },
    money: {
      grossAmount: vat.grossAmount,
      vatAmount: vat.vatAmount,
      netAmount: vat.netAmount,
      currency: vat.currency,
    },
  };
}

export function buildFinancialAuditMetadata(input: {
  invoiceNumber?: string | null;
  paymentReference?: string | null;
  eventType: string;
  syncStatus: string;
  attempts: number;
  message?: string | null;
}): Record<string, unknown> {
  return {
    invoiceNumber: input.invoiceNumber ?? null,
    paymentReference: input.paymentReference ?? null,
    eventType: input.eventType,
    syncStatus: input.syncStatus,
    syncAttempts: input.attempts,
    message: input.message ?? null,
    recordedAt: new Date().toISOString(),
  };
}
