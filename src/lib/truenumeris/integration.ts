import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/secrets";
import { getTrueNumerisDefaultRegion } from "@/lib/truenumeris/config";
import type { TrueNumerisSettingsInput } from "@/types/truenumeris";

type TrueNumerisRow = {
  id: string;
  companyId: string | null;
  region: string;
  enabled: boolean;
  apiKeyEncrypted: string | null;
  baseUrl: string | null;
  autoInvoice: boolean;
  autoVat: boolean;
  autoReconciliation: boolean;
  syncFrequencyMinutes: number;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
  createdAt: Date;
};

type TrueNumerisDelegate = {
  findFirst: (args?: unknown) => Promise<TrueNumerisRow | null>;
  update: (args: unknown) => Promise<TrueNumerisRow>;
  create: (args: unknown) => Promise<TrueNumerisRow>;
};

function trueNumerisModel(): TrueNumerisDelegate | null {
  const model = (prisma as unknown as { trueNumerisIntegration?: TrueNumerisDelegate }).trueNumerisIntegration;
  return model ?? null;
}

function defaultTrueNumerisSettings() {
  return {
    id: null,
    companyId: null,
    region: getTrueNumerisDefaultRegion(),
    enabled: false,
    baseUrl: null,
    autoInvoice: true,
    autoVat: true,
    autoReconciliation: true,
    syncFrequencyMinutes: 15,
    lastSyncAt: null,
    lastSyncStatus: null,
    lastSyncMessage: null,
    maskedApiKey: null,
    hasApiKey: false,
  };
}

function sanitizeBaseUrl(value: string | undefined): string | null {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return null;
  try {
    return new URL(cleaned).toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export async function getTrueNumerisSettings() {
  const model = trueNumerisModel();
  if (!model) return defaultTrueNumerisSettings();

  const row = await model.findFirst({ orderBy: { createdAt: "asc" } });
  if (!row) {
    return defaultTrueNumerisSettings();
  }

  return {
    id: row.id,
    companyId: row.companyId,
    region: row.region === "GH" ? "GH" : "UK",
    enabled: row.enabled,
    baseUrl: row.baseUrl,
    autoInvoice: row.autoInvoice,
    autoVat: row.autoVat,
    autoReconciliation: row.autoReconciliation,
    syncFrequencyMinutes: row.syncFrequencyMinutes,
    lastSyncAt: row.lastSyncAt,
    lastSyncStatus: row.lastSyncStatus,
    lastSyncMessage: row.lastSyncMessage,
    maskedApiKey: row.apiKeyEncrypted ? maskSecret(decryptSecret(row.apiKeyEncrypted)) : null,
    hasApiKey: Boolean(row.apiKeyEncrypted),
  };
}

export async function getTrueNumerisSecretSettings() {
  const model = trueNumerisModel();
  if (!model) return null;

  const row = await model.findFirst({ orderBy: { createdAt: "asc" } });
  if (!row) return null;
  return {
    ...row,
    apiKey: row.apiKeyEncrypted ? decryptSecret(row.apiKeyEncrypted) : null,
  };
}

export async function saveTrueNumerisSettings(input: TrueNumerisSettingsInput, actorUserId?: string) {
  const model = trueNumerisModel();
  if (!model) {
    throw new Error("TrueNumeris integration model is unavailable.");
  }

  const existing = await model.findFirst({ orderBy: { createdAt: "asc" } });
  const encrypted = input.apiKey?.trim() ? encryptSecret(input.apiKey.trim()) : undefined;

  const data: Prisma.TrueNumerisIntegrationUncheckedCreateInput = {
    companyId: input.companyId?.trim() || null,
    region: input.region,
    enabled: input.enabled,
    apiKeyEncrypted: encrypted ?? existing?.apiKeyEncrypted ?? null,
    baseUrl: sanitizeBaseUrl(input.baseUrl) ?? existing?.baseUrl ?? null,
    autoInvoice: input.autoInvoice,
    autoVat: input.autoVat,
    autoReconciliation: input.autoReconciliation,
    syncFrequencyMinutes: input.syncFrequencyMinutes,
  };

  const row = existing
    ? await model.update({
        where: { id: existing.id },
        data,
      })
    : await model.create({ data });

  if (actorUserId) {
    await writeAuditLog({
      actorUserId,
      action: "truenumeris.settings.saved",
      entityType: "TrueNumerisIntegration",
      entityId: row.id,
      metadata: {
        enabled: row.enabled,
        region: row.region,
        autoInvoice: row.autoInvoice,
        autoVat: row.autoVat,
        autoReconciliation: row.autoReconciliation,
      },
    });
  }

  return row;
}

export async function updateTrueNumerisSyncState(input: {
  status: string;
  message?: string;
}) {
  const model = trueNumerisModel();
  if (!model) return null;

  const existing = await model.findFirst({ orderBy: { createdAt: "asc" } });
  if (!existing) return null;

  return model.update({
    where: { id: existing.id },
    data: {
      lastSyncAt: new Date(),
      lastSyncStatus: input.status,
      lastSyncMessage: input.message?.slice(0, 500) ?? null,
    },
  });
}
