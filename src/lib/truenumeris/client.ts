import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { buildIdempotencyKey } from "@/lib/billing/invoice-number";
import { buildFinancialAuditMetadata } from "@/lib/billing/financial-event-builder";
import { getTrueNumerisRequestTimeoutMs, isTrueNumerisFeatureEnabled } from "@/lib/truenumeris/config";
import {
  getTrueNumerisSecretSettings,
  normalizeTrueNumerisApiBaseUrl,
  updateTrueNumerisSyncState,
} from "@/lib/truenumeris/integration";
import type {
  SyncHistoricalInput,
  TrueNumerisApiResult,
  TrueNumerisEventRequest,
  TrueNumerisInvoiceRequest,
} from "@/types/truenumeris";
import { syncHistoricalInputSchema } from "@/types/truenumeris";

const RETRY_DELAYS_MS = [0, 500, 1500] as const;

function regionRoutePrefix(region: string): string {
  return region === "GH" ? "/v1/ghana" : "/v1/uk";
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return "Unexpected error";
}

function maskApiKeyForLog(apiKey: string | null | undefined): string {
  if (!apiKey) return "tn_********";
  return `tn_********${apiKey.slice(-4)}`;
}

function buildTrueNumerisAuthHeaders(input: {
  apiKey: string;
  companyId?: string | null;
  includeJsonAccept?: boolean;
}): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(input.includeJsonAccept ? { Accept: "application/json" } : {}),
    Authorization: `Bearer ${input.apiKey}`,
    "X-API-Key": input.apiKey,
    "x-api-key": input.apiKey,
    ...(input.companyId ? { "X-Company-Id": input.companyId } : {}),
  };
}

function safeRemoteText(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const compact = input.trim().slice(0, 180);
  if (!compact) return null;
  if (/bearer|api[\s_-]?key|token|secret/i.test(compact)) {
    return "[redacted-sensitive-message]";
  }
  return compact;
}

function mapTestStatusMessage(statusCode: number): string {
  if (statusCode === 401) {
    return "TrueNumeris rejected the API key. Check or rotate the API key.";
  }
  if (statusCode === 403) {
    return "API key is valid but does not have the required scope or company access.";
  }
  if (statusCode === 404) {
    return "TrueNumeris endpoint was not found. Check the Base URL and API version.";
  }
  if (statusCode === 422) {
    return "TrueNumeris rejected the request details. Check company ID and region.";
  }
  return `TrueNumeris endpoint returned ${statusCode}.`;
}

async function requestWithRetry(input: {
  endpoint: string;
  method?: "GET" | "POST";
  body?: unknown;
  idempotencyKey?: string;
  actorUserId?: string;
}): Promise<TrueNumerisApiResult> {
  if (!isTrueNumerisFeatureEnabled()) {
    return { ok: false, statusCode: 412, message: "TrueNumeris feature disabled." };
  }

  const settings = await getTrueNumerisSecretSettings();
  if (!settings?.enabled) {
    return { ok: false, statusCode: 412, message: "Integration not enabled." };
  }

  if (!settings.baseUrl || !settings.apiKey) {
    return { ok: false, statusCode: 412, message: "TrueNumeris configuration incomplete." };
  }

  const timeoutMs = getTrueNumerisRequestTimeoutMs();
  const basePath = regionRoutePrefix(settings.region);
  const target = `${settings.baseUrl}${basePath}${input.endpoint}`;

  let lastError = "Request failed";

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    await sleep(RETRY_DELAYS_MS[attempt]);

    try {
      const response = await fetch(target, {
        method: input.method ?? "POST",
        headers: {
          ...buildTrueNumerisAuthHeaders({ apiKey: settings.apiKey, companyId: settings.companyId }),
          "X-Region": settings.region,
          ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });

      const payload = await response.json().catch(() => null);
      if (response.ok) {
        await updateTrueNumerisSyncState({ status: "ok", message: "Last request successful." });
        return {
          ok: true,
          statusCode: response.status,
          message: "Synced",
          payload,
          reference: (payload as { reference?: string } | null)?.reference,
        };
      }

      lastError = `HTTP ${response.status}`;
      if (response.status < 500 && response.status !== 429) {
        await updateTrueNumerisSyncState({ status: "failed", message: lastError });
        return { ok: false, statusCode: response.status, message: lastError, payload };
      }
    } catch (error) {
      lastError = sanitizeError(error);
    }
  }

  await updateTrueNumerisSyncState({ status: "failed", message: lastError });
  if (input.actorUserId) {
    await writeAuditLog({
      actorUserId: input.actorUserId,
      action: "truenumeris.sync.failed",
      entityType: "TrueNumerisIntegration",
      metadata: { endpoint: input.endpoint, error: lastError },
    });
  }

  return {
    ok: false,
    statusCode: 503,
    message: lastError,
  };
}

export async function testTrueNumerisConnection(
  actorUserId?: string,
): Promise<TrueNumerisApiResult & { checkedAt?: string; endpointPath?: string }> {
  const checkedAt = new Date().toISOString();

  if (!isTrueNumerisFeatureEnabled()) {
    return {
      ok: false,
      statusCode: 412,
      message: "TrueNumeris integration is disabled in StarLiz.",
      checkedAt,
      endpointPath: "/integrations/ping",
    };
  }

  let settings: Awaited<ReturnType<typeof getTrueNumerisSecretSettings>>;
  try {
    settings = await getTrueNumerisSecretSettings();
  } catch {
    return {
      ok: false,
      statusCode: 500,
      message: "Could not read TrueNumeris settings. The stored API key may be corrupt or the encryption key has changed.",
      checkedAt,
      endpointPath: "/integrations/ping",
    };
  }
  if (!settings?.enabled) {
    return {
      ok: false,
      statusCode: 412,
      message: "Integration not enabled.",
      checkedAt,
      endpointPath: "/integrations/ping",
    };
  }

  if (!settings.baseUrl || !settings.apiKey) {
    return {
      ok: false,
      statusCode: 412,
      message: "TrueNumeris configuration incomplete.",
      checkedAt,
      endpointPath: "/integrations/ping",
    };
  }

  const normalizedBaseUrl = normalizeTrueNumerisApiBaseUrl(settings.baseUrl);
  if (!normalizedBaseUrl) {
    return {
      ok: false,
      statusCode: 422,
      message: "Could not reach TrueNumeris from StarLiz. Check the Base URL.",
      checkedAt,
      endpointPath: "/integrations/ping",
    };
  }

  const endpointPath = "/integrations/ping";
  const target = `${normalizedBaseUrl}${endpointPath}`;
  const timeoutMs = getTrueNumerisRequestTimeoutMs();
  const maskedApiKey = maskApiKeyForLog(settings.apiKey);

  try {
    const response = await fetch(target, {
      method: "GET",
      headers: buildTrueNumerisAuthHeaders({
        apiKey: settings.apiKey,
        companyId: settings.companyId,
        includeJsonAccept: true,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const payload = await response.json().catch(() => null);
    const remoteErrorCode =
      safeRemoteText((payload as { code?: unknown; errorCode?: unknown } | null)?.code) ??
      safeRemoteText((payload as { code?: unknown; errorCode?: unknown } | null)?.errorCode);
    const remoteErrorMessage =
      safeRemoteText((payload as { message?: unknown; error?: unknown } | null)?.message) ??
      safeRemoteText((payload as { message?: unknown; error?: unknown } | null)?.error);

    const safeMessage = response.ok
      ? "Connected to TrueNumeris successfully."
      : mapTestStatusMessage(response.status);

    await updateTrueNumerisSyncState({
      status: response.ok ? "ok" : "failed",
      message: safeMessage,
    });

    console.info("TrueNumeris test connection", {
      normalizedBaseUrl,
      endpointPath,
      statusCode: response.status,
      remoteErrorCode,
      remoteErrorMessage,
      maskedApiKey,
      companyId: settings.companyId ?? null,
    });

    const result: TrueNumerisApiResult & { checkedAt?: string; endpointPath?: string } = {
      ok: response.ok,
      statusCode: response.status,
      message: safeMessage,
      checkedAt,
      endpointPath,
    };

    if (response.ok) {
      result.payload = payload;
    }

    if (actorUserId) {
      await writeAuditLog({
        actorUserId,
        action: "truenumeris.connection.test",
        entityType: "TrueNumerisIntegration",
        metadata: { ok: result.ok, statusCode: result.statusCode },
      });
    }

    return result;
  } catch (error) {
    const safeMessage = "Could not reach TrueNumeris from StarLiz. Check the Base URL.";
    await updateTrueNumerisSyncState({ status: "failed", message: safeMessage });
    console.warn("TrueNumeris test connection network failure", {
      normalizedBaseUrl,
      endpointPath,
      statusCode: null,
      remoteErrorCode: null,
      remoteErrorMessage: safeRemoteText(error instanceof Error ? error.message : null),
      maskedApiKey,
      companyId: settings.companyId ?? null,
    });

    const result: TrueNumerisApiResult & { checkedAt?: string; endpointPath?: string } = {
      ok: false,
      statusCode: 503,
      message: safeMessage,
      checkedAt,
      endpointPath,
    };

    if (actorUserId) {
      await writeAuditLog({
        actorUserId,
        action: "truenumeris.connection.test",
        entityType: "TrueNumerisIntegration",
        metadata: { ok: result.ok, statusCode: result.statusCode },
      });
    }

    return result;
  }
}

export async function sendFinancialEventToTrueNumeris(input: {
  request: TrueNumerisEventRequest;
  syncEventId?: string;
  actorUserId?: string;
}): Promise<TrueNumerisApiResult> {
  const result = await requestWithRetry({
    endpoint: "/events",
    body: input.request,
    idempotencyKey: input.request.idempotencyKey,
    actorUserId: input.actorUserId,
  });

  if (input.syncEventId) {
    await prisma.financialSyncEvent.update({
      where: { id: input.syncEventId },
      data: {
        syncStatus: result.ok ? "synced" : "failed",
        syncAttempts: { increment: 1 },
        syncedAt: result.ok ? new Date() : null,
        errorMessage: result.ok ? null : result.message ?? "Sync failed",
      },
    });
  }

  if (input.actorUserId) {
    await writeAuditLog({
      actorUserId: input.actorUserId,
      action: "truenumeris.event.sent",
      entityType: "FinancialSyncEvent",
      entityId: input.syncEventId,
      metadata: buildFinancialAuditMetadata({
        invoiceNumber: input.request.event.invoiceNumber,
        paymentReference: input.request.event.paymentReference,
        eventType: input.request.event.eventType,
        syncStatus: result.ok ? "synced" : "failed",
        attempts: 1,
        message: result.message,
      }),
    });
  }

  return result;
}

export async function createTrueNumerisInvoice(input: {
  request: TrueNumerisInvoiceRequest;
  actorUserId?: string;
}): Promise<TrueNumerisApiResult> {
  const result = await requestWithRetry({
    endpoint: "/invoices",
    body: input.request,
    idempotencyKey: input.request.idempotencyKey,
    actorUserId: input.actorUserId,
  });

  if (input.actorUserId) {
    await writeAuditLog({
      actorUserId: input.actorUserId,
      action: "truenumeris.invoice.sent",
      entityType: "FinancialInvoice",
      entityId: input.request.invoiceNumber,
      metadata: {
        ok: result.ok,
        statusCode: result.statusCode,
        invoiceNumber: input.request.invoiceNumber,
      },
    });
  }

  return result;
}

export async function syncHistoricalTransactions(input: {
  payload?: SyncHistoricalInput;
  actorUserId?: string;
}) {
  const parsed = syncHistoricalInputSchema.parse(input.payload ?? {});
  const start = new Date(Date.now() - parsed.lookbackDays * 24 * 60 * 60 * 1000);

  const rows = await prisma.financialSyncEvent.findMany({
    where: {
      createdAt: { gte: start },
      syncStatus: { in: ["pending", "failed"] },
    },
    orderBy: { createdAt: "asc" },
    take: parsed.limit,
  });

  let synced = 0;
  let failed = 0;

  for (const row of rows) {
    const payload = row.payloadJson as Record<string, unknown> | null;
    const eventPayload = payload?.event as TrueNumerisEventRequest["event"] | undefined;
    if (!eventPayload) {
      failed += 1;
      await prisma.financialSyncEvent.update({
        where: { id: row.id },
        data: {
          syncStatus: "failed",
          syncAttempts: { increment: 1 },
          errorMessage: "Missing event payload",
        },
      });
      continue;
    }

    const request: TrueNumerisEventRequest = {
      idempotencyKey: buildIdempotencyKey([
        row.source,
        row.sourceId,
        row.eventType,
        row.paymentProvider,
        row.paymentReference,
      ]),
      event: eventPayload,
    };

    const result = await sendFinancialEventToTrueNumeris({ request, syncEventId: row.id, actorUserId: input.actorUserId });
    if (result.ok) synced += 1;
    else failed += 1;
  }

  if (input.actorUserId) {
    await writeAuditLog({
      actorUserId: input.actorUserId,
      action: "truenumeris.historical.sync",
      entityType: "FinancialSyncEvent",
      metadata: { synced, failed, lookbackDays: parsed.lookbackDays, limit: parsed.limit },
    });
  }

  return { ok: true, synced, failed, scanned: rows.length };
}

export async function createOrUpdateFinancialInvoice(input: {
  invoiceNumber: string;
  parentId?: string | null;
  studentId?: string | null;
  status: string;
  currency: string;
  grossAmount: number;
  vatAmount: number;
  netAmount: number;
  providerReference?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const existingByProviderRef = input.providerReference
    ? await prisma.financialInvoice.findFirst({ where: { providerReference: input.providerReference } })
    : null;

  const whereByNumber = { invoiceNumber: input.invoiceNumber };
  const data = {
    parentId: input.parentId ?? null,
    studentId: input.studentId ?? null,
    status: input.status,
    currency: input.currency,
    grossAmount: new Prisma.Decimal(input.grossAmount.toFixed(2)),
    vatAmount: new Prisma.Decimal(input.vatAmount.toFixed(2)),
    netAmount: new Prisma.Decimal(input.netAmount.toFixed(2)),
    issuedAt: new Date(),
    paidAt: input.status === "paid" ? new Date() : null,
    providerReference: input.providerReference ?? null,
    metadataJson: JSON.parse(JSON.stringify(input.metadata ?? {})) as Prisma.InputJsonValue,
  };

  if (existingByProviderRef) {
    return prisma.financialInvoice.update({ where: { id: existingByProviderRef.id }, data });
  }

  return prisma.financialInvoice.upsert({
    where: whereByNumber,
    update: data,
    create: {
      invoiceNumber: input.invoiceNumber,
      ...data,
    },
  });
}
