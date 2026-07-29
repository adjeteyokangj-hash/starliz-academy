import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { hasRequiredScopes, parseScopesJson, type ApiScope } from "./scopes";
import {
  environmentFromKey,
  findActiveKeyByHash,
  hashApiKey,
  isValidKeyFormat,
  touchLastUsedAt,
  visibleKeyPrefix,
  type GeneratedKeyPublic,
} from "./generated-keys";

export type AuthenticateExternalApiKeyOptions = {
  requiredScopes: readonly ApiScope[] | readonly string[];
};

export type AuthenticatedApiKey = {
  id: string;
  keyPrefix: string;
  environment: "test" | "live";
  scopes: ApiScope[];
  rateLimit: number;
  name: string;
};

export type AuthSuccess = {
  ok: true;
  key: AuthenticatedApiKey;
  response?: undefined;
};

export type AuthFailure = {
  ok: false;
  key?: undefined;
  response: NextResponse;
};

export type AuthResult = AuthSuccess | AuthFailure;

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match?.[1]) return null;
  return match[1].trim();
}

function fail(
  status: number,
  error: string,
  meta?: Record<string, unknown>,
): AuthFailure {
  return {
    ok: false,
    response: NextResponse.json({ error, ...meta }, { status }),
  };
}

/**
 * Authenticate an inbound request using a StarLiz-generated API key (Bearer).
 * Never logs or audits the full key — only the short visible prefix.
 */
export async function authenticateExternalApiKey(
  request: Request,
  options: AuthenticateExternalApiKeyOptions,
): Promise<AuthResult> {
  const token = extractBearerToken(request);
  const requiredScopes = options.requiredScopes ?? [];

  if (!token) {
    await writeAuditLog({
      action: "api_key_authentication_failed",
      entityType: "generated_api_key",
      metadata: { reason: "missing_bearer", keyPrefix: null },
    }).catch(() => undefined);
    return fail(401, "Missing or invalid Authorization Bearer token.");
  }

  if (!isValidKeyFormat(token)) {
    await writeAuditLog({
      action: "api_key_authentication_failed",
      entityType: "generated_api_key",
      metadata: { reason: "invalid_prefix", keyPrefix: visibleKeyPrefix(token).slice(0, 20) },
    }).catch(() => undefined);
    return fail(401, "Invalid API key.");
  }

  const keyPrefix = visibleKeyPrefix(token);
  const keyHash = hashApiKey(token);
  const row = await findActiveKeyByHash(keyHash);

  if (!row) {
    await writeAuditLog({
      action: "api_key_authentication_failed",
      entityType: "generated_api_key",
      metadata: { reason: "not_found", keyPrefix },
    }).catch(() => undefined);
    return fail(401, "Invalid API key.");
  }

  if (row.status === "revoked") {
    await writeAuditLog({
      action: "api_key_authentication_failed",
      entityType: "generated_api_key",
      entityId: row.id,
      metadata: { reason: "revoked", keyPrefix: row.keyPrefix },
    }).catch(() => undefined);
    return fail(401, "API key has been revoked.");
  }

  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    await writeAuditLog({
      action: "api_key_authentication_failed",
      entityType: "generated_api_key",
      entityId: row.id,
      metadata: { reason: "expired", keyPrefix: row.keyPrefix },
    }).catch(() => undefined);
    return fail(401, "API key has expired.");
  }

  if (row.status !== "active") {
    await writeAuditLog({
      action: "api_key_authentication_failed",
      entityType: "generated_api_key",
      entityId: row.id,
      metadata: { reason: "inactive", keyPrefix: row.keyPrefix, status: row.status },
    }).catch(() => undefined);
    return fail(401, "API key is not active.");
  }

  const scopes = parseScopesJson(row.scopesJson);
  if (!hasRequiredScopes(scopes, requiredScopes as string[])) {
    await writeAuditLog({
      action: "api_key_authentication_failed",
      entityType: "generated_api_key",
      entityId: row.id,
      metadata: {
        reason: "insufficient_scope",
        keyPrefix: row.keyPrefix,
        requiredScopes: [...requiredScopes],
        grantedScopes: scopes,
      },
    }).catch(() => undefined);
    return fail(403, "Insufficient API key scope.");
  }

  const rateLimit = Math.max(1, row.rateLimit || 60);
  const rateCheck = checkRateLimit({
    key: `external-api-key:${row.id}`,
    limit: rateLimit,
    windowMs: 60_000,
  });
  if (!rateCheck.allowed) {
    await writeAuditLog({
      action: "api_key_authentication_failed",
      entityType: "generated_api_key",
      entityId: row.id,
      metadata: { reason: "rate_limited", keyPrefix: row.keyPrefix },
    }).catch(() => undefined);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Rate limit exceeded." },
        {
          status: 429,
          headers: { "Retry-After": String(rateCheck.retryAfterSeconds) },
        },
      ),
    };
  }

  touchLastUsedAt(row.id);

  await writeAuditLog({
    action: "api_key_authenticated",
    entityType: "generated_api_key",
    entityId: row.id,
    metadata: {
      keyPrefix: row.keyPrefix,
      environment: row.environment,
      scopes,
    },
  }).catch(() => undefined);

  const env = environmentFromKey(token) ?? (row.environment === "live" ? "live" : "test");

  return {
    ok: true,
    key: {
      id: row.id,
      keyPrefix: row.keyPrefix,
      environment: env,
      scopes,
      rateLimit,
      name: row.name,
    },
  };
}

/**
 * Pure auth decision helper for unit tests (no DB / network).
 * Evaluates status, expiry, scopes, and rate-limit result.
 */
export function evaluateApiKeyAuth(input: {
  keyPrefix: string;
  status: string;
  expiresAt: Date | null;
  scopes: readonly string[];
  requiredScopes: readonly string[];
  rateLimitAllowed: boolean;
}): { ok: true } | { ok: false; reason: string; httpStatus: number } {
  if (input.status === "revoked") {
    return { ok: false, reason: "revoked", httpStatus: 401 };
  }
  if (input.expiresAt && input.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "expired", httpStatus: 401 };
  }
  if (input.status !== "active") {
    return { ok: false, reason: "inactive", httpStatus: 401 };
  }
  if (!hasRequiredScopes(input.scopes, input.requiredScopes)) {
    return { ok: false, reason: "insufficient_scope", httpStatus: 403 };
  }
  if (!input.rateLimitAllowed) {
    return { ok: false, reason: "rate_limited", httpStatus: 429 };
  }
  return { ok: true };
}

/** Build a redacted audit metadata object — never includes full key or credential. */
export function redactedAuthAuditMetadata(input: {
  keyPrefix: string;
  reason?: string;
  scopes?: string[];
}): Record<string, unknown> {
  const meta: Record<string, unknown> = { keyPrefix: input.keyPrefix };
  if (input.reason) meta.reason = input.reason;
  if (input.scopes) meta.scopes = input.scopes;
  return meta;
}

export type { GeneratedKeyPublic };
