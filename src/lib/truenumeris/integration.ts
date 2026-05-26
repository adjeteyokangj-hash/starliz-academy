import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/secrets";
import { getTrueNumerisDefaultRegion } from "@/lib/truenumeris/config";
import type { TrueNumerisSettingsInput } from "@/types/truenumeris";

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
  const row = await prisma.trueNumerisIntegration.findFirst({ orderBy: { createdAt: "asc" } });
  if (!row) {
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
  const row = await prisma.trueNumerisIntegration.findFirst({ orderBy: { createdAt: "asc" } });
  if (!row) return null;
  return {
    ...row,
    apiKey: row.apiKeyEncrypted ? decryptSecret(row.apiKeyEncrypted) : null,
  };
}

export async function saveTrueNumerisSettings(input: TrueNumerisSettingsInput, actorUserId?: string) {
  const existing = await prisma.trueNumerisIntegration.findFirst({ orderBy: { createdAt: "asc" } });
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
    ? await prisma.trueNumerisIntegration.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.trueNumerisIntegration.create({ data });

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
  const existing = await prisma.trueNumerisIntegration.findFirst({ orderBy: { createdAt: "asc" } });
  if (!existing) return null;

  return prisma.trueNumerisIntegration.update({
    where: { id: existing.id },
    data: {
      lastSyncAt: new Date(),
      lastSyncStatus: input.status,
      lastSyncMessage: input.message?.slice(0, 500) ?? null,
    },
  });
}
