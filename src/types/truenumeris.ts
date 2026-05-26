import { z } from "zod";
import { financialEventPayloadSchema, financialRegionSchema } from "@/types/financial";

export const trueNumerisSettingsSchema = z.object({
  companyId: z.string().trim().optional(),
  region: financialRegionSchema.default("UK"),
  enabled: z.boolean().default(false),
  apiKey: z.string().trim().optional(),
  baseUrl: z.string().trim().url().optional(),
  autoInvoice: z.boolean().default(true),
  autoVat: z.boolean().default(true),
  autoReconciliation: z.boolean().default(true),
  syncFrequencyMinutes: z.number().int().min(1).max(1440).default(15),
});
export type TrueNumerisSettingsInput = z.infer<typeof trueNumerisSettingsSchema>;

export const trueNumerisStoredSettingsSchema = trueNumerisSettingsSchema.extend({
  id: z.string(),
  lastSyncAt: z.string().nullable().optional(),
  lastSyncStatus: z.string().nullable().optional(),
  lastSyncMessage: z.string().nullable().optional(),
  maskedApiKey: z.string().nullable().optional(),
});
export type TrueNumerisStoredSettings = z.infer<typeof trueNumerisStoredSettingsSchema>;

export const trueNumerisEventRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(8),
  event: financialEventPayloadSchema,
});
export type TrueNumerisEventRequest = z.infer<typeof trueNumerisEventRequestSchema>;

export const trueNumerisInvoiceRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(8),
  invoiceNumber: z.string().trim().min(3),
  parentId: z.string().trim().optional(),
  studentId: z.string().trim().optional(),
  currency: z.string().trim().min(3).max(8).default("GBP"),
  grossAmount: z.number().nonnegative(),
  vatAmount: z.number().nonnegative(),
  netAmount: z.number().nonnegative(),
  providerReference: z.string().trim().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type TrueNumerisInvoiceRequest = z.infer<typeof trueNumerisInvoiceRequestSchema>;

export const trueNumerisApiResultSchema = z.object({
  ok: z.boolean(),
  statusCode: z.number().int(),
  message: z.string().optional(),
  reference: z.string().optional(),
  payload: z.unknown().optional(),
});
export type TrueNumerisApiResult = z.infer<typeof trueNumerisApiResultSchema>;

export const syncHistoricalInputSchema = z.object({
  lookbackDays: z.number().int().min(1).max(365).default(30),
  limit: z.number().int().min(1).max(1000).default(200),
});
export type SyncHistoricalInput = z.infer<typeof syncHistoricalInputSchema>;
