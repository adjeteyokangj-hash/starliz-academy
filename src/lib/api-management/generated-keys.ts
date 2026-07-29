import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import {
  type ApiScope,
  parseScopesJson,
  scopesToJson,
  validateScopes,
} from "./scopes";

export const KEY_ENVIRONMENTS = ["test", "live"] as const;
export type KeyEnvironment = (typeof KEY_ENVIRONMENTS)[number];

export const KEY_STATUSES = ["active", "revoked", "expired"] as const;
export type KeyStatus = (typeof KEY_STATUSES)[number];

const TEST_PREFIX = "sl_test_";
const LIVE_PREFIX = "sl_live_";
const RANDOM_BYTES = 32;

export type GeneratedKeyPublic = {
  id: string;
  name: string;
  description: string | null;
  keyPrefix: string;
  environment: KeyEnvironment;
  scopes: ApiScope[];
  status: KeyStatus;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  createdByAdminId: string | null;
  revokedAt: string | null;
  revokedByAdminId: string | null;
  rotationOfId: string | null;
  rateLimit: number;
};

export type GenerateKeyInput = {
  name: string;
  description?: string | null;
  environment: KeyEnvironment;
  scopes: unknown;
  expiresAt?: Date | string | null;
  rateLimit?: number;
  createdByAdminId?: string | null;
  rotationOfId?: string | null;
};

export type GenerateKeyResult = {
  record: GeneratedKeyPublic;
  /** Full plaintext key — returned ONLY once at generation time. */
  fullKey: string;
};

function hmacSecret(): string {
  return process.env.AUTH_SECRET || process.env.API_KEY_ENCRYPTION_SECRET || "dev-insecure-auth-secret";
}

/** Hash a full API key for storage/lookup (HMAC-SHA256 with AUTH_SECRET). */
export function hashApiKey(fullKey: string): string {
  return crypto.createHmac("sha256", hmacSecret()).update(fullKey).digest("hex");
}

/** Plain SHA-256 fallback hash (also accepted for verification if migrating). Prefer HMAC. */
export function hashApiKeySha256(fullKey: string): string {
  return crypto.createHash("sha256").update(fullKey).digest("hex");
}

export function keyPrefixForEnvironment(environment: KeyEnvironment): string {
  return environment === "live" ? LIVE_PREFIX : TEST_PREFIX;
}

export function isValidKeyFormat(fullKey: string): boolean {
  return fullKey.startsWith(TEST_PREFIX) || fullKey.startsWith(LIVE_PREFIX);
}

export function environmentFromKey(fullKey: string): KeyEnvironment | null {
  if (fullKey.startsWith(LIVE_PREFIX)) return "live";
  if (fullKey.startsWith(TEST_PREFIX)) return "test";
  return null;
}

/**
 * Visible short prefix stored for display (scheme + ~12 chars of secret material).
 * Example: sl_test_a1b2c3d4e5f6
 */
export function visibleKeyPrefix(fullKey: string): string {
  if (fullKey.startsWith(LIVE_PREFIX)) {
    return LIVE_PREFIX + fullKey.slice(LIVE_PREFIX.length, LIVE_PREFIX.length + 12);
  }
  if (fullKey.startsWith(TEST_PREFIX)) {
    return TEST_PREFIX + fullKey.slice(TEST_PREFIX.length, TEST_PREFIX.length + 12);
  }
  return fullKey.slice(0, 20);
}

/** Generate a cryptographically secure key string (not stored). */
export function mintApiKeyString(environment: KeyEnvironment): string {
  const scheme = keyPrefixForEnvironment(environment);
  const secret = crypto.randomBytes(RANDOM_BYTES).toString("base64url");
  return `${scheme}${secret}`;
}

function toPublic(row: {
  id: string;
  name: string;
  description: string | null;
  keyPrefix: string;
  environment: string;
  scopesJson: string;
  status: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  createdByAdminId: string | null;
  revokedAt: Date | null;
  revokedByAdminId: string | null;
  rotationOfId: string | null;
  rateLimit: number;
}): GeneratedKeyPublic {
  let status = row.status as KeyStatus;
  if (status === "active" && row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    status = "expired";
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    keyPrefix: row.keyPrefix,
    environment: (row.environment === "live" ? "live" : "test") as KeyEnvironment,
    scopes: parseScopesJson(row.scopesJson),
    status,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    createdByAdminId: row.createdByAdminId,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revokedByAdminId: row.revokedByAdminId,
    rotationOfId: row.rotationOfId,
    rateLimit: row.rateLimit,
  };
}

export async function listGeneratedKeys(): Promise<GeneratedKeyPublic[]> {
  const rows = await prisma.generatedApiKey.findMany({
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toPublic);
}

export async function generateApiKey(
  input: GenerateKeyInput,
  actorUserId?: string,
): Promise<GenerateKeyResult> {
  if (!input.name?.trim()) throw new Error("Name is required.");
  if (input.environment !== "test" && input.environment !== "live") {
    throw new Error("Environment must be test or live.");
  }
  const scopes = validateScopes(input.scopes);
  const rateLimit =
    typeof input.rateLimit === "number" && Number.isFinite(input.rateLimit)
      ? Math.max(1, Math.min(10_000, Math.floor(input.rateLimit)))
      : 60;

  let expiresAt: Date | null = null;
  if (input.expiresAt) {
    expiresAt = typeof input.expiresAt === "string" ? new Date(input.expiresAt) : input.expiresAt;
    if (Number.isNaN(expiresAt.getTime())) throw new Error("Invalid expiry date.");
  }

  const fullKey = mintApiKeyString(input.environment);
  const keyHash = hashApiKey(fullKey);
  const keyPrefix = visibleKeyPrefix(fullKey);

  const row = await prisma.generatedApiKey.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      keyPrefix,
      keyHash,
      environment: input.environment,
      scopesJson: scopesToJson(scopes),
      status: "active",
      expiresAt,
      rateLimit,
      createdByAdminId: input.createdByAdminId ?? null,
      rotationOfId: input.rotationOfId ?? null,
    },
  });

  await writeAuditLog({
    actorUserId,
    action: input.rotationOfId ? "api_key_rotated" : "api_key_generated",
    entityType: "generated_api_key",
    entityId: row.id,
    metadata: {
      name: row.name,
      keyPrefix: row.keyPrefix,
      environment: row.environment,
      scopes,
      rateLimit: row.rateLimit,
      rotationOfId: row.rotationOfId,
    },
  });

  return {
    record: toPublic(row),
    fullKey,
  };
}

/**
 * Pure generate helper for unit tests — no DB.
 * Returns full key once; record contains hash only (never plaintext).
 */
export function generateApiKeyMaterial(input: {
  name: string;
  environment: KeyEnvironment;
  scopes: ApiScope[];
  rateLimit?: number;
}): {
  fullKey: string;
  record: {
    name: string;
    keyPrefix: string;
    keyHash: string;
    environment: KeyEnvironment;
    scopesJson: string;
    status: "active";
    rateLimit: number;
  };
} {
  const scopes = validateScopes(input.scopes);
  const fullKey = mintApiKeyString(input.environment);
  return {
    fullKey,
    record: {
      name: input.name,
      keyPrefix: visibleKeyPrefix(fullKey),
      keyHash: hashApiKey(fullKey),
      environment: input.environment,
      scopesJson: scopesToJson(scopes),
      status: "active",
      rateLimit: input.rateLimit ?? 60,
    },
  };
}

export async function revokeApiKey(
  id: string,
  actorUserId?: string,
): Promise<GeneratedKeyPublic> {
  const existing = await prisma.generatedApiKey.findUnique({ where: { id } });
  if (!existing) throw new Error("API key not found.");
  if (existing.status === "revoked") {
    return toPublic(existing);
  }

  const row = await prisma.generatedApiKey.update({
    where: { id },
    data: {
      status: "revoked",
      revokedAt: new Date(),
      revokedByAdminId: actorUserId ?? null,
    },
  });

  await writeAuditLog({
    actorUserId,
    action: "api_key_revoked",
    entityType: "generated_api_key",
    entityId: row.id,
    metadata: {
      name: row.name,
      keyPrefix: row.keyPrefix,
      environment: row.environment,
    },
  });

  return toPublic(row);
}

export async function rotateApiKey(
  id: string,
  actorUserId?: string,
): Promise<GenerateKeyResult> {
  const existing = await prisma.generatedApiKey.findUnique({ where: { id } });
  if (!existing) throw new Error("API key not found.");

  // Revoke old key first
  await prisma.generatedApiKey.update({
    where: { id },
    data: {
      status: "revoked",
      revokedAt: new Date(),
      revokedByAdminId: actorUserId ?? null,
    },
  });

  await writeAuditLog({
    actorUserId,
    action: "api_key_revoked",
    entityType: "generated_api_key",
    entityId: id,
    metadata: {
      name: existing.name,
      keyPrefix: existing.keyPrefix,
      reason: "rotated",
    },
  });

  return generateApiKey(
    {
      name: existing.name,
      description: existing.description,
      environment: (existing.environment === "live" ? "live" : "test") as KeyEnvironment,
      scopes: parseScopesJson(existing.scopesJson),
      expiresAt: existing.expiresAt,
      rateLimit: existing.rateLimit,
      createdByAdminId: actorUserId ?? existing.createdByAdminId,
      rotationOfId: existing.id,
    },
    actorUserId,
  );
}

export async function findActiveKeyByHash(keyHash: string) {
  return prisma.generatedApiKey.findUnique({ where: { keyHash } });
}

export function touchLastUsedAt(id: string): void {
  void prisma.generatedApiKey
    .update({ where: { id }, data: { lastUsedAt: new Date() } })
    .catch(() => {
      /* non-blocking */
    });
}
