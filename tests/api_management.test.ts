import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Ensure encryption helpers have a secret in unit tests
process.env.AUTH_SECRET ??= "test-auth-secret-for-api-management-unit-tests";

/** NODE_ENV is typed read-only; tests need to toggle production SSRF rules. */
const env = process.env as NodeJS.ProcessEnv & { NODE_ENV?: string };
if (!env.NODE_ENV) env.NODE_ENV = "test";

import { decryptSecret, maskSecret } from "../src/lib/secrets";
import {
  API_SCOPES,
  validateScopes,
  parseScopesJson,
  hasRequiredScopes,
  isApiScope,
} from "../src/lib/api-management/scopes";
import {
  assertSafeExternalUrl,
  fetchSafeExternal,
  isPrivateOrBlockedIp,
  UnsafeUrlError,
} from "../src/lib/api-management/ssrf";
import {
  encryptCredentialForStorage,
  redactCredentialForResponse,
  buildAuthHeaders,
  parseAdditionalHeaders,
  validateBaseUrlForStorage,
} from "../src/lib/api-management/connections";
import {
  generateApiKeyMaterial,
  hashApiKey,
  mintApiKeyString,
  visibleKeyPrefix,
  isValidKeyFormat,
  environmentFromKey,
} from "../src/lib/api-management/generated-keys";
import {
  evaluateApiKeyAuth,
  redactedAuthAuditMetadata,
} from "../src/lib/api-management/auth";
import { checkRateLimit } from "../src/lib/api_guard";

const ROOT = process.cwd();

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

// ── Scopes ──────────────────────────────────────────────────────────

test("scopes: only api:read and api:write are valid", () => {
  assert.deepEqual(API_SCOPES, ["api:read", "api:write"]);
  assert.equal(isApiScope("api:read"), true);
  assert.equal(isApiScope("api:admin"), false);
  assert.deepEqual(validateScopes(["api:write", "api:read", "api:read"]), ["api:read", "api:write"]);
  assert.throws(() => validateScopes(["api:admin"]), /Invalid scope/);
  assert.throws(() => validateScopes([]), /At least one/);
  assert.deepEqual(parseScopesJson('["api:read"]'), ["api:read"]);
  assert.deepEqual(parseScopesJson("not-json"), []);
  assert.equal(hasRequiredScopes(["api:read", "api:write"], ["api:read"]), true);
  assert.equal(hasRequiredScopes(["api:read"], ["api:write"]), false);
});

// ── Credential encryption & redaction ───────────────────────────────

test("connected API credential encryption round-trip", () => {
  const secret = "sk-live-super-secret-credential-value";
  const { encryptedCredential, credentialHint } = encryptCredentialForStorage(secret);
  assert.notEqual(encryptedCredential, secret);
  assert.equal(decryptSecret(encryptedCredential), secret);
  assert.notEqual(credentialHint, secret);
  assert.match(credentialHint, /•/);
});

test("credential redaction never returns full secret", () => {
  const secret = "my-partner-api-token-abcdef";
  const redacted = redactCredentialForResponse(secret);
  assert.equal(redacted.neverReturnsFull, true);
  assert.notEqual(redacted.encrypted, secret);
  assert.notEqual(redacted.hint, secret);
  assert.equal(decryptSecret(redacted.encrypted), secret);
  assert.equal(maskSecret(secret).includes(secret.slice(8, 16)), false);
});

test("buildAuthHeaders does not leak into unexpected shapes", () => {
  assert.deepEqual(buildAuthHeaders({ authType: "none", credential: "x", headerName: null }), {});
  assert.equal(
    buildAuthHeaders({ authType: "bearer", credential: "tok", headerName: null }).Authorization,
    "Bearer tok",
  );
  assert.equal(
    buildAuthHeaders({ authType: "api_key_header", credential: "k", headerName: "X-Key" })["X-Key"],
    "k",
  );
});

test("parseAdditionalHeaders accepts JSON and key=value lines", () => {
  assert.deepEqual(parseAdditionalHeaders('{"X-A":"1"}'), { "X-A": "1" });
  assert.deepEqual(parseAdditionalHeaders("X-A=1\nX-B: two"), { "X-A": "1", "X-B": "two" });
});

// ── SSRF / HTTPS / private network ──────────────────────────────────

test("HTTPS validation: production rejects http", async () => {
  const prev = env.NODE_ENV;
  env.NODE_ENV = "production";
  try {
    await assert.rejects(
      () => assertSafeExternalUrl("http://example.com/api"),
      (err: unknown) => err instanceof UnsafeUrlError && /HTTPS/i.test((err as Error).message),
    );
  } finally {
    env.NODE_ENV = prev;
  }
});

test("validateBaseUrlForStorage rejects non-http(s)", () => {
  assert.throws(() => validateBaseUrlForStorage("ftp://files.example.com"), /HTTP or HTTPS/);
});

test("private-network blocking for literal IPs and hostnames", async () => {
  assert.equal(isPrivateOrBlockedIp("127.0.0.1"), true);
  assert.equal(isPrivateOrBlockedIp("10.0.0.5"), true);
  assert.equal(isPrivateOrBlockedIp("172.16.1.1"), true);
  assert.equal(isPrivateOrBlockedIp("192.168.1.1"), true);
  assert.equal(isPrivateOrBlockedIp("169.254.169.254"), true);
  assert.equal(isPrivateOrBlockedIp("8.8.8.8"), false);

  await assert.rejects(() => assertSafeExternalUrl("http://127.0.0.1/"), UnsafeUrlError);
  await assert.rejects(() => assertSafeExternalUrl("http://localhost/"), UnsafeUrlError);
  await assert.rejects(() => assertSafeExternalUrl("http://169.254.169.254/latest/meta-data/"), UnsafeUrlError);
  await assert.rejects(() => assertSafeExternalUrl("http://10.1.2.3/"), UnsafeUrlError);
});

test("connection test timeout (mock abort)", async () => {
  const fetchImpl: typeof fetch = async () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    throw err;
  };

  // Public hostname that resolves safely in DNS — we abort before body
  // Use example.com which is reserved and typically resolves to public docs IPs
  await assert.rejects(
    () =>
      fetchSafeExternal("https://example.com/", {
        fetchImpl,
        timeoutMs: 50,
      }),
    (err: unknown) => err instanceof Error && (err.name === "AbortError" || /abort/i.test(err.message)),
  );
});

test("fetchSafeExternal rejects redirect to private IP", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response(null, {
      status: 302,
      headers: { Location: "http://127.0.0.1/secret" },
    });
  };

  await assert.rejects(
    () => fetchSafeExternal("https://example.com/start", { fetchImpl }),
    UnsafeUrlError,
  );
  assert.equal(calls, 1);
});

// ── Key generation ──────────────────────────────────────────────────

test("key generation uses sl_test_ / sl_live_ prefixes and secure material", () => {
  const testKey = mintApiKeyString("test");
  const liveKey = mintApiKeyString("live");
  assert.ok(testKey.startsWith("sl_test_"));
  assert.ok(liveKey.startsWith("sl_live_"));
  assert.ok(isValidKeyFormat(testKey));
  assert.equal(environmentFromKey(testKey), "test");
  assert.equal(environmentFromKey(liveKey), "live");
  assert.notEqual(testKey, mintApiKeyString("test"));
});

test("one-time key display: full key returned once from generate helper; hash only in record", () => {
  const { fullKey, record } = generateApiKeyMaterial({
    name: "Unit test key",
    environment: "test",
    scopes: ["api:read"],
  });
  assert.ok(fullKey.startsWith("sl_test_"));
  assert.ok(record.keyHash);
  assert.equal(record.keyHash, hashApiKey(fullKey));
  assert.equal(record.keyHash.includes(fullKey), false);
  assert.ok(JSON.stringify(record).includes(fullKey) === false);
  assert.equal(record.keyPrefix, visibleKeyPrefix(fullKey));
  assert.ok(fullKey.length > record.keyPrefix.length);
});

test("plaintext key is not stored — only hash in record", () => {
  const { fullKey, record } = generateApiKeyMaterial({
    name: "Hash only",
    environment: "live",
    scopes: ["api:read", "api:write"],
  });
  const serialised = JSON.stringify(record);
  assert.equal(serialised.includes(fullKey), false);
  assert.match(record.keyHash, /^[a-f0-9]{64}$/);
  assert.ok(record.keyPrefix.startsWith("sl_live_"));
});

// ── Auth evaluation ─────────────────────────────────────────────────

test("valid key authentication decision", () => {
  const result = evaluateApiKeyAuth({
    keyPrefix: "sl_test_abc",
    status: "active",
    expiresAt: null,
    scopes: ["api:read"],
    requiredScopes: ["api:read"],
    rateLimitAllowed: true,
  });
  assert.deepEqual(result, { ok: true });
});

test("invalid / inactive key rejected", () => {
  const result = evaluateApiKeyAuth({
    keyPrefix: "sl_test_x",
    status: "inactive",
    expiresAt: null,
    scopes: ["api:read"],
    requiredScopes: ["api:read"],
    rateLimitAllowed: true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "inactive");
});

test("expired key rejected", () => {
  const result = evaluateApiKeyAuth({
    keyPrefix: "sl_test_x",
    status: "active",
    expiresAt: new Date(Date.now() - 60_000),
    scopes: ["api:read"],
    requiredScopes: ["api:read"],
    rateLimitAllowed: true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "expired");
    assert.equal(result.httpStatus, 401);
  }
});

test("revoked key rejected", () => {
  const result = evaluateApiKeyAuth({
    keyPrefix: "sl_test_x",
    status: "revoked",
    expiresAt: null,
    scopes: ["api:read", "api:write"],
    requiredScopes: ["api:read"],
    rateLimitAllowed: true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "revoked");
});

test("wrong scope rejected (permission enforcement helper)", () => {
  const result = evaluateApiKeyAuth({
    keyPrefix: "sl_test_x",
    status: "active",
    expiresAt: null,
    scopes: ["api:read"],
    requiredScopes: ["api:write"],
    rateLimitAllowed: true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "insufficient_scope");
    assert.equal(result.httpStatus, 403);
  }
});

test("rate limiting blocks excess requests", () => {
  const key = `api-mgmt-test-rl-${Date.now()}`;
  for (let i = 0; i < 3; i++) {
    const r = checkRateLimit({ key, limit: 3, windowMs: 60_000 });
    assert.equal(r.allowed, true);
  }
  const blocked = checkRateLimit({ key, limit: 3, windowMs: 60_000 });
  assert.equal(blocked.allowed, false);

  const authBlocked = evaluateApiKeyAuth({
    keyPrefix: "sl_test_rl",
    status: "active",
    expiresAt: null,
    scopes: ["api:read"],
    requiredScopes: ["api:read"],
    rateLimitAllowed: false,
  });
  assert.equal(authBlocked.ok, false);
  if (!authBlocked.ok) assert.equal(authBlocked.httpStatus, 429);
});

test("rotation material creates new key distinct from previous", () => {
  const first = generateApiKeyMaterial({
    name: "Rotate me",
    environment: "test",
    scopes: ["api:read"],
  });
  const second = generateApiKeyMaterial({
    name: "Rotate me",
    environment: "test",
    scopes: ["api:read"],
  });
  assert.notEqual(first.fullKey, second.fullKey);
  assert.notEqual(first.record.keyHash, second.record.keyHash);
});

// ── Audit redaction ─────────────────────────────────────────────────

test("audit redaction metadata must not contain credential/full key", () => {
  const fullKey = mintApiKeyString("live");
  const meta = redactedAuthAuditMetadata({
    keyPrefix: visibleKeyPrefix(fullKey),
    reason: "not_found",
    scopes: ["api:read"],
  });
  const json = JSON.stringify(meta);
  assert.equal(json.includes(fullKey), false);
  assert.ok(typeof meta.keyPrefix === "string");
  assert.ok(!("credential" in meta));
  assert.ok(!("fullKey" in meta));
  assert.ok(!("encryptedCredential" in meta));
});

// ── Ping endpoint + permission wiring (source contracts) ────────────

test("ping endpoint requires api:read via authenticateExternalApiKey", () => {
  const src = read("src/app/api/external/v1/ping/route.ts");
  assert.match(src, /authenticateExternalApiKey/);
  assert.match(src, /api:read/);
  assert.match(src, /StarLiz Academy/);
  assert.match(src, /ok:\s*true/);
  assert.match(src, /timestamp/);
  assert.doesNotMatch(src, /childProfile|subscription|assignment/i);
});

test("admin API routes enforce MANAGE_API_KEYS", () => {
  const files = [
    "src/app/api/admin/settings/api-management/connections/route.ts",
    "src/app/api/admin/settings/api-management/connections/[id]/route.ts",
    "src/app/api/admin/settings/api-management/connections/[id]/test/route.ts",
    "src/app/api/admin/settings/api-management/keys/route.ts",
    "src/app/api/admin/settings/api-management/keys/[id]/rotate/route.ts",
    "src/app/api/admin/settings/api-management/keys/[id]/revoke/route.ts",
  ];
  for (const f of files) {
    const src = read(f);
    assert.match(src, /requireAdminPermission\("MANAGE_API_KEYS"\)/, f);
    assert.doesNotMatch(src, /MANAGE_API_ACCESS/);
  }
});

test("SUPER_ADMIN has MANAGE_API_KEYS; ordinary ADMIN does not", () => {
  const rbac = read("src/lib/rbac.ts");
  const superStart = rbac.indexOf("SUPER_ADMIN:");
  const adminStart = rbac.indexOf("\n  ADMIN:");
  const managerStart = rbac.indexOf("MANAGER:");
  assert.ok(superStart >= 0 && adminStart > superStart && managerStart > adminStart);
  const superBlock = rbac.slice(superStart, adminStart);
  const adminBlock = rbac.slice(adminStart, managerStart);
  assert.match(superBlock, /MANAGE_API_KEYS/);
  assert.doesNotMatch(adminBlock, /MANAGE_API_KEYS/);
});

test("settings page links API Management without merging provider cards", () => {
  const settings = read("src/app/admin/(secure)/settings/page.tsx");
  assert.match(settings, /API Management/);
  assert.match(settings, /\/admin\/settings\/api-management/);
  assert.match(settings, /provider: "openai"/);
  assert.match(settings, /provider: "payment"/);

  const page = read("src/app/admin/(secure)/settings/api-management/page.tsx");
  assert.match(page, /Store and test credentials for an external API/);
  assert.match(page, /Create credentials that another authorised system can use/);
  assert.match(page, /does not mean StarLiz features work without separate code mapping/);
});

test("schema and additive migration exist for ExternalApiConnection and GeneratedApiKey", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model ExternalApiConnection/);
  assert.match(schema, /model GeneratedApiKey/);
  assert.match(schema, /scopesJson/);
  assert.match(schema, /encryptedCredential/);

  const migration = read("prisma/migrations/20260728230000_api_management/migration.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "ExternalApiConnection"/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "GeneratedApiKey"/);
  assert.doesNotMatch(migration, /DROP TABLE/i);
  assert.doesNotMatch(migration, /TRUNCATE/i);
});

test("no OpsWatch-specific wiring in api-management lib or routes", () => {
  const files = [
    "src/lib/api-management/connections.ts",
    "src/lib/api-management/generated-keys.ts",
    "src/lib/api-management/auth.ts",
    "src/app/api/external/v1/ping/route.ts",
    "src/app/admin/(secure)/settings/api-management/page.tsx",
  ];
  for (const f of files) {
    assert.doesNotMatch(read(f), /opswatch/i, f);
  }
});
