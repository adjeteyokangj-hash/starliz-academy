import { createHmac, randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/secrets";
import { OPSWATCH_DEFAULT_API_URL, type OpsWatchSettingsInput } from "@/types/opswatch";

type OpsWatchRow = {
  id: string;
  enabled: boolean;
  baseUrl: string | null;
  projectSlug: string | null;
  environment: string;
  apiKeyEncrypted: string | null;
  signingSecretEncrypted: string | null;
  lastHeartbeatAt: Date | null;
  lastHeartbeatStatus: string | null;
  lastHeartbeatMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type OpsWatchDelegate = {
  findFirst: (args?: unknown) => Promise<OpsWatchRow | null>;
  update: (args: unknown) => Promise<OpsWatchRow>;
  create: (args: unknown) => Promise<OpsWatchRow>;
};

export type OpsWatchOutboundConfig = {
  baseUrl: string;
  apiKey: string;
  signingSecret: string;
  projectSlug: string;
  environment: string;
  appName: string;
};

function opsWatchModel(): OpsWatchDelegate | null {
  const model = (prisma as unknown as { opsWatchIntegration?: OpsWatchDelegate }).opsWatchIntegration;
  return model ?? null;
}

export function resolveOpsWatchApiBaseUrl(baseUrl: string | null | undefined): string {
  const trimmed = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return OPSWATCH_DEFAULT_API_URL;
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

function sanitizeBaseUrl(value: string | undefined): string | null {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return null;
  try {
    return resolveOpsWatchApiBaseUrl(new URL(cleaned).toString());
  } catch {
    return null;
  }
}

function defaultSettings() {
  return {
    id: null as string | null,
    enabled: false,
    baseUrl: OPSWATCH_DEFAULT_API_URL,
    projectSlug: null as string | null,
    environment: "production" as const,
    maskedApiKey: null as string | null,
    hasApiKey: false,
    hasSigningSecret: false,
    lastHeartbeatAt: null as string | null,
    lastHeartbeatStatus: null as string | null,
    lastHeartbeatMessage: null as string | null,
    fromEnvFallback: false,
  };
}

function envOutboundConfig(): OpsWatchOutboundConfig | null {
  const apiKey = (process.env.OPSWATCH_API_KEY ?? "").trim();
  const signingSecret = (process.env.OPSWATCH_SIGNING_SECRET ?? "").trim();
  const projectSlug = (process.env.OPSWATCH_PROJECT_SLUG ?? "").trim();
  const baseUrl = resolveOpsWatchApiBaseUrl(process.env.OPSWATCH_API_URL);
  const environment = (process.env.OPSWATCH_ENVIRONMENT ?? "production").trim().toLowerCase() || "production";

  if (!apiKey || !signingSecret || !projectSlug) return null;

  return {
    baseUrl,
    apiKey,
    signingSecret,
    projectSlug,
    environment: environment === "staging" || environment === "development" ? environment : "production",
    appName: "StarLiz Academy",
  };
}

export async function getOpsWatchSettings() {
  const model = opsWatchModel();
  if (!model) {
    const env = envOutboundConfig();
    return {
      ...defaultSettings(),
      enabled: Boolean(env),
      projectSlug: env?.projectSlug ?? null,
      baseUrl: env?.baseUrl ?? OPSWATCH_DEFAULT_API_URL,
      hasApiKey: Boolean(env?.apiKey),
      hasSigningSecret: Boolean(env?.signingSecret),
      fromEnvFallback: Boolean(env),
    };
  }

  const row = await model.findFirst({ orderBy: { createdAt: "asc" } });
  if (!row) {
    const env = envOutboundConfig();
    if (env) {
      return {
        ...defaultSettings(),
        enabled: true,
        projectSlug: env.projectSlug,
        baseUrl: env.baseUrl,
        hasApiKey: true,
        hasSigningSecret: true,
        fromEnvFallback: true,
      };
    }
    return defaultSettings();
  }

  return {
    id: row.id,
    enabled: row.enabled,
    baseUrl: row.baseUrl || OPSWATCH_DEFAULT_API_URL,
    projectSlug: row.projectSlug,
    environment:
      row.environment === "staging" || row.environment === "development"
        ? row.environment
        : ("production" as const),
    maskedApiKey: row.apiKeyEncrypted ? maskSecret(decryptSecret(row.apiKeyEncrypted)) : null,
    hasApiKey: Boolean(row.apiKeyEncrypted),
    hasSigningSecret: Boolean(row.signingSecretEncrypted),
    lastHeartbeatAt: row.lastHeartbeatAt ? row.lastHeartbeatAt.toISOString() : null,
    lastHeartbeatStatus: row.lastHeartbeatStatus,
    lastHeartbeatMessage: row.lastHeartbeatMessage,
    fromEnvFallback: false,
  };
}

export async function resolveOpsWatchOutboundConfig(options?: {
  requireEnabled?: boolean;
}): Promise<OpsWatchOutboundConfig | null> {
  const requireEnabled = options?.requireEnabled !== false;
  const model = opsWatchModel();

  if (model) {
    const row = await model.findFirst({ orderBy: { createdAt: "asc" } });
    if (row && (!requireEnabled || row.enabled)) {
      const apiKey = row.apiKeyEncrypted ? decryptSecret(row.apiKeyEncrypted).trim() : "";
      const signingSecret = row.signingSecretEncrypted
        ? decryptSecret(row.signingSecretEncrypted).trim()
        : "";
      const projectSlug = (row.projectSlug ?? "").trim();
      const baseUrl = resolveOpsWatchApiBaseUrl(row.baseUrl);
      if (apiKey && signingSecret && projectSlug) {
        return {
          baseUrl,
          apiKey,
          signingSecret,
          projectSlug,
          environment:
            row.environment === "staging" || row.environment === "development"
              ? row.environment
              : "production",
          appName: "StarLiz Academy",
        };
      }
    }
  }

  const env = envOutboundConfig();
  if (!env) return null;
  if (requireEnabled) {
    // Env-only config is treated as enabled when all required vars are present.
    return env;
  }
  return env;
}

export async function saveOpsWatchSettings(input: OpsWatchSettingsInput, actorUserId?: string) {
  const model = opsWatchModel();
  if (!model) {
    throw new Error("OpsWatch integration model is unavailable. Run prisma migrate / generate first.");
  }

  const existing = await model.findFirst({ orderBy: { createdAt: "asc" } });
  const apiKeyEncrypted = input.apiKey?.trim()
    ? encryptSecret(input.apiKey.trim())
    : existing?.apiKeyEncrypted ?? null;
  const signingSecretEncrypted = input.signingSecret?.trim()
    ? encryptSecret(input.signingSecret.trim())
    : existing?.signingSecretEncrypted ?? null;

  const data = {
    enabled: input.enabled,
    baseUrl: sanitizeBaseUrl(input.baseUrl) ?? existing?.baseUrl ?? OPSWATCH_DEFAULT_API_URL,
    projectSlug: input.projectSlug?.trim() || existing?.projectSlug || null,
    environment: input.environment,
    apiKeyEncrypted,
    signingSecretEncrypted,
  };

  const row = existing
    ? await model.update({ where: { id: existing.id }, data })
    : await model.create({ data });

  if (actorUserId) {
    await writeAuditLog({
      actorUserId,
      action: "opswatch.settings.saved",
      entityType: "OpsWatchIntegration",
      entityId: row.id,
      metadata: {
        enabled: row.enabled,
        projectSlug: row.projectSlug,
        environment: row.environment,
        baseUrl: row.baseUrl,
      },
    });
  }

  return row;
}

export async function sendOpsWatchHeartbeat(
  config: OpsWatchOutboundConfig,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const timestamp = new Date().toISOString();
  const nonce = randomUUID();
  const body = JSON.stringify({
    projectSlug: config.projectSlug,
    environment: config.environment,
    status: "HEALTHY",
    message: `${config.appName} heartbeat via OpsWatch integration`,
    appVersion: process.env.npm_package_version || "starliz-academy",
    payload: {
      component: "starliz-academy",
      source: "opswatch-integration",
    },
  });
  const signature = createHmac("sha256", config.signingSecret)
    .update(`${timestamp}.${nonce}.${body}`)
    .digest("hex");

  const response = await fetch(`${config.baseUrl}/heartbeat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "x-opswatch-timestamp": timestamp,
      "x-opswatch-nonce": nonce,
      "x-opswatch-signature": signature,
      "x-opswatch-environment": config.environment,
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      ok: false,
      status: response.status,
      message: `OpsWatch heartbeat failed (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ""}`,
    };
  }

  return { ok: true };
}

export async function sendConfiguredOpsWatchHeartbeat(options?: {
  requireEnabled?: boolean;
}): Promise<{ ok: boolean; responseCode: number | null; message: string }> {
  const config = await resolveOpsWatchOutboundConfig(options);
  if (!config) {
    return {
      ok: false,
      responseCode: null,
      message:
        "OpsWatch needs Base URL, API key, Signing secret, and Project slug. Paste credentials from the OpsWatch Connect wizard, then enable the integration.",
    };
  }

  const result = await sendOpsWatchHeartbeat(config);
  const model = opsWatchModel();
  if (model) {
    const row = await model.findFirst({ orderBy: { createdAt: "asc" } });
    if (row) {
      await model.update({
        where: { id: row.id },
        data: {
          lastHeartbeatAt: new Date(),
          lastHeartbeatStatus: result.ok ? "ok" : "failed",
          lastHeartbeatMessage: result.ok
            ? "OpsWatch heartbeat accepted."
            : result.message.slice(0, 500),
        },
      });
    }
  }

  if (!result.ok) {
    return { ok: false, responseCode: result.status, message: result.message };
  }

  return {
    ok: true,
    responseCode: 200,
    message: "OpsWatch heartbeat accepted. Connect wizard should detect this app shortly.",
  };
}
