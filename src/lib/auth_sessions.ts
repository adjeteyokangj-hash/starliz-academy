import { createHash, randomBytes } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/db";
import { evaluateSuspiciousLoginRisk } from "@/lib/schools/governance_rules";

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const ACCESS_TTL_SECONDS = 60 * 15; // 15 mins

type RefreshClaims = {
  userId: string;
  sid: string;
  jti: string;
  fp: string;
};

function getJwtSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (!raw) {
    throw new Error("AUTH_SECRET is required. Set it in your environment before starting the app.");
  }
  return new TextEncoder().encode(raw);
}

export function getAccessTokenMaxAgeSeconds(): number {
  return ACCESS_TTL_SECONDS;
}

export function getRefreshTokenMaxAgeSeconds(): number {
  return REFRESH_TTL_SECONDS;
}

export function getRefreshCookieName(): string {
  return "starliz_refresh";
}

export function hashOpaqueToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function buildDeviceFingerprint(input: { ip?: string; userAgent?: string | null }): string {
  const raw = `${input.ip ?? ""}|${input.userAgent ?? ""}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

async function signRefreshToken(claims: RefreshClaims): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL_SECONDS}s`)
    .sign(getJwtSecret());
}

export async function verifyRefreshToken(token: string): Promise<RefreshClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return {
      userId: String(payload.userId ?? ""),
      sid: String(payload.sid ?? ""),
      jti: String(payload.jti ?? ""),
      fp: String(payload.fp ?? ""),
    };
  } catch {
    return null;
  }
}

export async function issueRefreshToken(input: {
  userId: string;
  fingerprint: string;
  existingSid?: string;
  ipAddress?: string;
  userAgent?: string | null;
}): Promise<{ token: string; sid: string; jti: string; tokenHash: string; expiresAt: Date; recordId: string }> {
  const sid = input.existingSid ?? randomBytes(16).toString("hex");
  const jti = randomBytes(16).toString("hex");
  const token = await signRefreshToken({ userId: input.userId, sid, jti, fp: input.fingerprint });
  const tokenHash = hashOpaqueToken(token);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);

  const created = await prisma.authSession.create({
    data: {
      userId: input.userId,
      sessionFamilyId: sid,
      tokenId: jti,
      refreshTokenHash: tokenHash,
      deviceFingerprint: input.fingerprint,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent ?? null,
      expiresAt,
      lastSeenAt: new Date(),
    },
  });

  return { token, sid, jti, tokenHash, expiresAt, recordId: created.id };
}

export async function getRefreshRecord(input: { userId: string; tokenHash: string }) {
  const row = await prisma.authSession.findFirst({
    where: {
      userId: input.userId,
      refreshTokenHash: input.tokenHash,
    },
    orderBy: { createdAt: "desc" },
  });

  return row ? { row } : null;
}

export async function revokeRefreshRecord(rowId: string, reason: string) {
  const existing = await prisma.authSession.findUnique({ where: { id: rowId } });
  if (!existing) return;

  await prisma.authSession.update({
    where: { id: rowId },
    data: {
      revokedAt: existing.revokedAt ?? new Date(),
      revokeReason: reason,
    },
  });
}

export async function revokeAllRefreshSessions(userId: string, reason: string) {
  await prisma.authSession.updateMany({
    where: { userId, revokedAt: null },
    data: {
      revokedAt: new Date(),
      revokeReason: reason,
    },
  });
}

export async function isRefreshRecordActive(input: {
  userId: string;
  tokenHash: string;
  fingerprint: string;
  ipAddress?: string;
  userAgent?: string | null;
}) {
  const found = await getRefreshRecord({ userId: input.userId, tokenHash: input.tokenHash });
  if (!found) return { active: false as const, reason: "not_found" as const, sid: null as string | null };

  const { row } = found;
  if (row.revokedAt) return { active: false as const, reason: "revoked" as const, sid: row.sessionFamilyId };
  if (row.expiresAt.getTime() < Date.now()) {
    return { active: false as const, reason: "expired" as const, sid: row.sessionFamilyId };
  }

  // Device binding for refresh tokens: warn on mismatch but allow refresh
  // This handles normal network changes (IP switch, VPN, browser updates) while still tracking device info
  let hadFingerprintMismatch = false;
  if (row.deviceFingerprint && row.deviceFingerprint !== input.fingerprint) {
    // Log mismatch but don't reject - normal network transitions should be allowed
    console.warn(`[auth] fingerprint_mismatch for userId=${input.userId}, stored=${row.deviceFingerprint?.slice(0, 8)}, current=${input.fingerprint?.slice(0, 8)}`);
    hadFingerprintMismatch = true;
  }

  await prisma.authSession.update({
    where: { id: row.id },
    data: {
      lastSeenAt: new Date(),
      ipAddress: input.ipAddress,
      userAgent: input.userAgent ?? null,
      // Update device fingerprint on each refresh to track device changes
      deviceFingerprint: input.fingerprint,
    },
  });

  return { active: true as const, reason: null, sid: row.sessionFamilyId, rowId: row.id, hadFingerprintMismatch };
}

export async function detectSuspiciousLogin(input: {
  userId: string;
  ipAddress?: string;
  userAgent?: string | null;
}) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const failureCount = await prisma.schoolLoginHistory.count({
    where: {
      userId: input.userId,
      success: false,
      createdAt: { gte: since },
    },
  });

  const recentSuccess = await prisma.schoolLoginHistory.findFirst({
    where: { userId: input.userId, success: true },
    orderBy: { createdAt: "desc" },
    select: { ipAddress: true, userAgent: true, createdAt: true },
  });

  const ipChanged = Boolean(
    input.ipAddress && recentSuccess?.ipAddress && input.ipAddress !== recentSuccess.ipAddress
  );
  const uaChanged = Boolean(
    input.userAgent && recentSuccess?.userAgent && input.userAgent !== recentSuccess.userAgent
  );

  const evaluation = evaluateSuspiciousLoginRisk({
    failureCount,
    ipChanged,
    userAgentChanged: uaChanged,
  });

  return {
    suspicious: evaluation.suspicious,
    reason: evaluation.reason,
    failureCount,
    previousSuccessAt: recentSuccess?.createdAt?.toISOString() ?? null,
  };
}

export async function isTeacherSuspended(userId: string): Promise<boolean> {
  const [activeCount, suspendedCount] = await Promise.all([
    prisma.schoolTeacher.count({ where: { userId, status: "active" } }),
    prisma.schoolTeacher.count({ where: { userId, status: { in: ["suspended", "archived"] } } }),
  ]);

  return activeCount === 0 && suspendedCount > 0;
}
