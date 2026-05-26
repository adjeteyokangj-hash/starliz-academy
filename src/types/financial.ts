import { z } from "zod";

export const financialRegionSchema = z.enum(["UK", "GH"]);
export type FinancialRegion = z.infer<typeof financialRegionSchema>;

export const financialSyncStatusSchema = z.enum(["pending", "synced", "failed", "skipped"]);
export type FinancialSyncStatus = z.infer<typeof financialSyncStatusSchema>;

export const financialInvoiceStatusSchema = z.enum(["draft", "issued", "paid", "void", "failed"]);
export type FinancialInvoiceStatus = z.infer<typeof financialInvoiceStatusSchema>;

export const financialEventTypeSchema = z.enum([
  "subscription_payment_success",
  "subscription_payment_failed",
  "subscription_renewed",
  "subscription_cancelled",
  "invoice_created",
  "invoice_paid",
  "manual_adjustment",
]);
export type FinancialEventType = z.infer<typeof financialEventTypeSchema>;

export const moneySchema = z.object({
  grossAmount: z.number().nonnegative(),
  vatAmount: z.number().nonnegative(),
  netAmount: z.number().nonnegative(),
  currency: z.string().trim().min(3).max(8).default("GBP"),
});
export type MoneyBreakdown = z.infer<typeof moneySchema>;

export const vatInputSchema = z.object({
  grossAmount: z.number().nonnegative(),
  country: z.string().trim().min(2).max(4).default("UK"),
  currency: z.string().trim().min(3).max(8).default("GBP"),
  provider: z.string().trim().optional(),
  subscriptionPlan: z.string().trim().optional(),
  vatEnabled: z.boolean().default(true),
});
export type VatInput = z.infer<typeof vatInputSchema>;

export const financialEventPayloadSchema = z.object({
  source: z.string().trim().min(1),
  sourceId: z.string().trim().optional(),
  eventType: financialEventTypeSchema,
  studentId: z.string().trim().optional(),
  parentId: z.string().trim().optional(),
  invoiceNumber: z.string().trim().optional(),
  paymentProvider: z.string().trim().optional(),
  paymentReference: z.string().trim().optional(),
  region: financialRegionSchema.default("UK"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  money: moneySchema,
});
export type FinancialEventPayload = z.infer<typeof financialEventPayloadSchema>;

export const reconciliationSummarySchema = z.object({
  pending: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  synced: z.number().int().nonnegative(),
  lastSyncAt: z.string().nullable(),
  status: z.string(),
});
export type ReconciliationSummary = z.infer<typeof reconciliationSummarySchema>;
