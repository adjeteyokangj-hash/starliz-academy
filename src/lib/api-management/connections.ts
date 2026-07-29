import crypto from "node:crypto";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/secrets";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { assertSafeExternalUrl, fetchSafeExternal, UnsafeUrlError } from "./ssrf";

export const AUTH_TYPES = ["bearer", "api_key_header", "basic", "none"] as const;
export type AuthType = (typeof AUTH_TYPES)[number];

export const CONNECTION_STATUSES = [
  "connected",
  "auth_failed",
  "unreachable",
  "disabled",
  "not_tested",
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const CONNECTION_ENVIRONMENTS = ["test", "live"] as const;
export type ConnectionEnvironment = (typeof CONNECTION_ENVIRONMENTS)[number];

export type ConnectionPublic = {
  id: string;
  name: string;
  description: string | null;
  baseUrl: string;
  authType: AuthType;
  credentialHint: string | null;
  headerName: string | null;
  hasCredential: boolean;
  hasAdditionalHeaders: boolean;
  environment: ConnectionEnvironment;
  status: ConnectionStatus;
  enabled: boolean;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  createdAt: string;
  updatedAt: string;
  createdByAdminId: string | null;
};

export type CreateConnectionInput = {
  name: string;
  description?: string | null;
  baseUrl: string;
  authType: AuthType;
  credential?: string | null;
  headerName?: string | null;
  additionalHeaders?: Record<string, string> | null;
  environment?: ConnectionEnvironment;
  enabled?: boolean;
  createdByAdminId?: string | null;
};

export type UpdateConnectionInput = {
  name?: string;
  description?: string | null;
  baseUrl?: string;
  authType?: AuthType;
  credential?: string | null;
  clearCredential?: boolean;
  headerName?: string | null;
  additionalHeaders?: Record<string, string> | null;
  clearAdditionalHeaders?: boolean;
  environment?: ConnectionEnvironment;
  enabled?: boolean;
};

function isAuthType(v: unknown): v is AuthType {
  return typeof v === "string" && (AUTH_TYPES as readonly string[]).includes(v);
}

function isEnvironment(v: unknown): v is ConnectionEnvironment {
  return typeof v === "string" && (CONNECTION_ENVIRONMENTS as readonly string[]).includes(v);
}

/** Parse additional headers from JSON object or key=value lines. */
export function parseAdditionalHeaders(raw: unknown): Record<string, string> | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof k !== "string" || !k.trim()) continue;
      if (typeof v !== "string") throw new Error("Additional header values must be strings.");
      out[k.trim()] = v;
    }
    return Object.keys(out).length ? out : null;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("{")) {
      const parsed = JSON.parse(trimmed) as unknown;
      return parseAdditionalHeaders(parsed);
    }
    const out: Record<string, string> = {};
    for (const line of trimmed.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      const eq = t.indexOf("=");
      const colon = t.indexOf(":");
      let sep = -1;
      if (eq >= 0 && (colon < 0 || eq < colon)) sep = eq;
      else if (colon >= 0) sep = colon;
      if (sep < 0) throw new Error("Additional headers must be JSON or key=value lines.");
      const key = t.slice(0, sep).trim();
      const value = t.slice(sep + 1).trim();
      if (!key) throw new Error("Additional header keys must be non-empty.");
      out[key] = value;
    }
    return Object.keys(out).length ? out : null;
  }
  throw new Error("Invalid additional headers.");
}

export function validateBaseUrlForStorage(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new Error("Invalid base URL.");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("Only HTTPS base URLs are allowed in production.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Base URL must be HTTP or HTTPS.");
  }
  return url.toString().replace(/\/$/, "") === url.origin
    ? url.toString()
    : url.toString();
}

function toPublic(row: {
  id: string;
  name: string;
  description: string | null;
  baseUrl: string;
  authType: string;
  encryptedCredential: string | null;
  credentialHint: string | null;
  headerName: string | null;
  encryptedHeaders: string | null;
  environment: string;
  status: string;
  enabled: boolean;
  lastTestedAt: Date | null;
  lastTestStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByAdminId: string | null;
}): ConnectionPublic {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    baseUrl: row.baseUrl,
    authType: (isAuthType(row.authType) ? row.authType : "none") as AuthType,
    credentialHint: row.credentialHint,
    headerName: row.headerName,
    hasCredential: Boolean(row.encryptedCredential),
    hasAdditionalHeaders: Boolean(row.encryptedHeaders),
    environment: (isEnvironment(row.environment) ? row.environment : "test") as ConnectionEnvironment,
    status: (CONNECTION_STATUSES.includes(row.status as ConnectionStatus)
      ? row.status
      : "not_tested") as ConnectionStatus,
    enabled: row.enabled,
    lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
    lastTestStatus: row.lastTestStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdByAdminId: row.createdByAdminId,
  };
}

export function buildAuthHeaders(input: {
  authType: AuthType;
  credential: string | null;
  headerName: string | null;
}): Record<string, string> {
  const headers: Record<string, string> = {};
  const cred = input.credential?.trim() ?? "";
  if (input.authType === "none" || !cred) return headers;
  if (input.authType === "bearer") {
    headers.Authorization = `Bearer ${cred}`;
  } else if (input.authType === "api_key_header") {
    const name = (input.headerName ?? "X-API-Key").trim() || "X-API-Key";
    headers[name] = cred;
  } else if (input.authType === "basic") {
    // credential may be "user:pass" or already base64 — if contains ':', encode; else treat as raw token
    const encoded = cred.includes(":")
      ? Buffer.from(cred, "utf8").toString("base64")
      : cred;
    headers.Authorization = `Basic ${encoded}`;
  }
  return headers;
}

/** Encrypt credential for storage; returns hint (never full value). */
export function encryptCredentialForStorage(credential: string): {
  encryptedCredential: string;
  credentialHint: string;
} {
  const trimmed = credential.trim();
  return {
    encryptedCredential: encryptSecret(trimmed),
    credentialHint: maskSecret(trimmed),
  };
}

export function encryptHeadersForStorage(headers: Record<string, string>): string {
  return encryptSecret(JSON.stringify(headers));
}

export function decryptHeadersFromStorage(encrypted: string | null | undefined): Record<string, string> {
  if (!encrypted) return {};
  try {
    const raw = decryptSecret(encrypted);
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export async function listConnections(): Promise<ConnectionPublic[]> {
  const rows = await prisma.externalApiConnection.findMany({
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toPublic);
}

export async function getConnection(id: string): Promise<ConnectionPublic | null> {
  const row = await prisma.externalApiConnection.findUnique({ where: { id } });
  return row ? toPublic(row) : null;
}

export async function createConnection(
  input: CreateConnectionInput,
  actorUserId?: string,
): Promise<ConnectionPublic> {
  if (!input.name?.trim()) throw new Error("Name is required.");
  if (!isAuthType(input.authType)) throw new Error("Invalid auth type.");
  const baseUrl = validateBaseUrlForStorage(input.baseUrl);
  const environment = input.environment ?? "test";
  if (!isEnvironment(environment)) throw new Error("Invalid environment.");

  let encryptedCredential: string | null = null;
  let credentialHint: string | null = null;
  if (input.credential?.trim()) {
    const enc = encryptCredentialForStorage(input.credential);
    encryptedCredential = enc.encryptedCredential;
    credentialHint = enc.credentialHint;
  }

  let encryptedHeaders: string | null = null;
  if (input.additionalHeaders && Object.keys(input.additionalHeaders).length) {
    encryptedHeaders = encryptHeadersForStorage(input.additionalHeaders);
  }

  const row = await prisma.externalApiConnection.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      baseUrl,
      authType: input.authType,
      encryptedCredential,
      credentialHint,
      headerName: input.headerName?.trim() || null,
      encryptedHeaders,
      environment,
      enabled: input.enabled ?? true,
      status: input.enabled === false ? "disabled" : "not_tested",
      createdByAdminId: input.createdByAdminId ?? null,
    },
  });

  await writeAuditLog({
    actorUserId,
    action: "api_connection_created",
    entityType: "external_api_connection",
    entityId: row.id,
    metadata: {
      name: row.name,
      authType: row.authType,
      environment: row.environment,
      credentialHint: row.credentialHint,
    },
  });

  return toPublic(row);
}

export async function updateConnection(
  id: string,
  input: UpdateConnectionInput,
  actorUserId?: string,
): Promise<ConnectionPublic> {
  const existing = await prisma.externalApiConnection.findUnique({ where: { id } });
  if (!existing) throw new Error("Connection not found.");

  const data: Record<string, unknown> = {};

  if (input.name !== undefined) {
    if (!input.name.trim()) throw new Error("Name is required.");
    data.name = input.name.trim();
  }
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.baseUrl !== undefined) data.baseUrl = validateBaseUrlForStorage(input.baseUrl);
  if (input.authType !== undefined) {
    if (!isAuthType(input.authType)) throw new Error("Invalid auth type.");
    data.authType = input.authType;
  }
  if (input.headerName !== undefined) data.headerName = input.headerName?.trim() || null;
  if (input.environment !== undefined) {
    if (!isEnvironment(input.environment)) throw new Error("Invalid environment.");
    data.environment = input.environment;
  }
  if (input.enabled !== undefined) {
    data.enabled = input.enabled;
    if (!input.enabled) {
      data.status = "disabled";
    } else if (existing.status === "disabled") {
      data.status = "not_tested";
    }
  }

  if (input.clearCredential) {
    data.encryptedCredential = null;
    data.credentialHint = null;
  } else if (input.credential?.trim()) {
    const enc = encryptCredentialForStorage(input.credential);
    data.encryptedCredential = enc.encryptedCredential;
    data.credentialHint = enc.credentialHint;
  }

  if (input.clearAdditionalHeaders) {
    data.encryptedHeaders = null;
  } else if (input.additionalHeaders) {
    data.encryptedHeaders = Object.keys(input.additionalHeaders).length
      ? encryptHeadersForStorage(input.additionalHeaders)
      : null;
  }

  const row = await prisma.externalApiConnection.update({ where: { id }, data });

  const action =
    input.enabled === false
      ? "api_connection_disabled"
      : "api_connection_updated";

  await writeAuditLog({
    actorUserId,
    action,
    entityType: "external_api_connection",
    entityId: row.id,
    metadata: {
      name: row.name,
      authType: row.authType,
      environment: row.environment,
      enabled: row.enabled,
      credentialHint: row.credentialHint,
    },
  });

  return toPublic(row);
}

export async function deleteConnection(id: string, actorUserId?: string): Promise<void> {
  const existing = await prisma.externalApiConnection.findUnique({ where: { id } });
  if (!existing) throw new Error("Connection not found.");

  await prisma.externalApiConnection.delete({ where: { id } });

  await writeAuditLog({
    actorUserId,
    action: "api_connection_deleted",
    entityType: "external_api_connection",
    entityId: id,
    metadata: { name: existing.name, environment: existing.environment },
  });
}

export type ConnectionTestResult = {
  status: ConnectionStatus;
  message: string;
  httpStatus: number | null;
  lastTestedAt: string;
};

/**
 * Test reachability + auth only. Does NOT claim StarLiz feature integration.
 */
export async function testConnection(
  id: string,
  actorUserId?: string,
  deps?: { fetchImpl?: typeof fetch },
): Promise<ConnectionTestResult> {
  const row = await prisma.externalApiConnection.findUnique({ where: { id } });
  if (!row) throw new Error("Connection not found.");

  if (!row.enabled) {
    const now = new Date();
    await prisma.externalApiConnection.update({
      where: { id },
      data: { status: "disabled", lastTestedAt: now, lastTestStatus: "disabled" },
    });
    await writeAuditLog({
      actorUserId,
      action: "api_connection_tested",
      entityType: "external_api_connection",
      entityId: id,
      metadata: { status: "disabled", name: row.name },
    });
    return {
      status: "disabled",
      message: "Connection is disabled. Enable it before testing.",
      httpStatus: null,
      lastTestedAt: now.toISOString(),
    };
  }

  let status: ConnectionStatus = "unreachable";
  let message = "Could not reach the external API.";
  let httpStatus: number | null = null;

  try {
    await assertSafeExternalUrl(row.baseUrl);

    let credential: string | null = null;
    if (row.encryptedCredential) {
      try {
        credential = decryptSecret(row.encryptedCredential);
      } catch {
        status = "auth_failed";
        message = "Stored credential could not be decrypted.";
      }
    }

    if (status !== "auth_failed") {
      const authHeaders = buildAuthHeaders({
        authType: (isAuthType(row.authType) ? row.authType : "none") as AuthType,
        credential,
        headerName: row.headerName,
      });
      const extra = decryptHeadersFromStorage(row.encryptedHeaders);
      const headers = { ...extra, ...authHeaders };

      try {
        const result = await fetchSafeExternal(row.baseUrl, {
          method: "GET",
          headers,
          timeoutMs: 10_000,
          fetchImpl: deps?.fetchImpl,
        });
        httpStatus = result.status;

        if (result.status === 401 || result.status === 403) {
          status = "auth_failed";
          message =
            "Authentication failed. The endpoint rejected the credentials. This only verifies reachability and auth — it does not mean StarLiz features are integrated.";
        } else if (result.ok || (result.status >= 200 && result.status < 500)) {
          // 2xx–4xx (except 401/403) means reachable; auth likely accepted or endpoint doesn't require it
          status = result.status === 401 || result.status === 403 ? "auth_failed" : "connected";
          if (status === "connected") {
            message =
              "Connected. Reachability and authentication check succeeded. Connecting successfully does not mean features work without code mapping.";
          }
        } else {
          status = "unreachable";
          message = `External API returned HTTP ${result.status}. Endpoint may be unreachable or misconfigured.`;
        }
      } catch (err) {
        if (err instanceof UnsafeUrlError) {
          status = "unreachable";
          message = "URL failed safety checks and was not requested.";
        } else if (err instanceof Error && (err.name === "AbortError" || /aborted|timeout/i.test(err.message))) {
          status = "unreachable";
          message = "Connection test timed out.";
        } else {
          status = "unreachable";
          message = "Could not reach the external API.";
        }
      }
    }
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      status = "unreachable";
      message = "URL failed safety checks and was not requested.";
    } else {
      status = "unreachable";
      message = "Could not reach the external API.";
    }
  }

  // Never include credentials in message
  const safeMessage = message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");

  const now = new Date();
  await prisma.externalApiConnection.update({
    where: { id },
    data: { status, lastTestedAt: now, lastTestStatus: status },
  });

  await writeAuditLog({
    actorUserId,
    action: "api_connection_tested",
    entityType: "external_api_connection",
    entityId: id,
    metadata: {
      name: row.name,
      status,
      httpStatus,
      credentialHint: row.credentialHint,
    },
  });

  return {
    status,
    message: safeMessage,
    httpStatus,
    lastTestedAt: now.toISOString(),
  };
}

/** Pure helper for tests: encrypt then produce public-safe view fields. */
export function redactCredentialForResponse(credential: string): {
  encrypted: string;
  hint: string;
  neverReturnsFull: true;
} {
  const { encryptedCredential, credentialHint } = encryptCredentialForStorage(credential);
  return {
    encrypted: encryptedCredential,
    hint: credentialHint,
    neverReturnsFull: true,
  };
}

/** Deterministic id helper for tests that don't need prisma create. */
export function newConnectionId(): string {
  return crypto.randomBytes(12).toString("hex");
}
