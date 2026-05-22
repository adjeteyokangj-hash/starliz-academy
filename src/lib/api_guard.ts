import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { readParentUnlockFromCookie, readSessionFromCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";

type SessionLike = {
  userId: string;
  email: string;
  role: string;
};

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitRecord>();

function sweepRateLimitStore(now: number): void {
  if (rateLimitStore.size < 2000) return;
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

export function getRequestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function checkRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
}): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  sweepRateLimitStore(now);

  const existing = rateLimitStore.get(input.key);
  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(input.key, { count: 1, resetAt: now + input.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= input.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  rateLimitStore.set(input.key, existing);
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function requireSession() {
  const session = await readSessionFromCookie();
  if (session) {
    return { session, response: null as NextResponse | null };
  }

  // Local development fallback only.
  // This must never be enabled in shared, preview, staging, or production environments.
  const devFallbackEnabled = String(process.env.STARLIZ_ENABLE_DEV_ADMIN_FALLBACK ?? "").trim().toLowerCase() === "true";

  if (process.env.NODE_ENV === "development" && devFallbackEnabled) {
    const requestHeaders = await headers();
    const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
    const hostHeader = (forwardedHost || requestHeaders.get("host") || "").trim();
    const hostWithoutPort = hostHeader.startsWith("[")
      ? hostHeader.slice(1).split("]")[0]
      : hostHeader.split(":")[0];

    const isLocalHost = hostWithoutPort === "localhost" || hostWithoutPort === "127.0.0.1" || hostWithoutPort === "::1";
    if (!isLocalHost) {
      return { session: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }

    const configuredEmail = (process.env.STARLIZ_DEV_ADMIN_EMAIL ?? "").trim().toLowerCase();
    if (!configuredEmail) {
      return { session: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }

    const devAdmin = await prisma.user.findFirst({
      where: {
        role: "admin",
        email: configuredEmail,
      },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    if (devAdmin) {
      const devSession: SessionLike = {
        userId: devAdmin.id,
        email: devAdmin.email,
        role: devAdmin.role,
      };
      return { session: devSession, response: null as NextResponse | null };
    }

    return { session: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!session) {
    return { session: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session, response: null as NextResponse | null };
}

export async function requireAdmin() {
  const { session, response } = await requireSession();
  if (!session) return { session: null, response };

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      role: true,
      adminProfile: {
        select: {
          active: true,
        },
      },
    },
  });

  if (!user || user.role !== "admin" || user.adminProfile?.active === false) {
    return {
      session: null,
      response: NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 }),
    };
  }
  return { session, response: null as NextResponse | null };
}

export async function requireAdminPermission(permission: string) {
  const { session, response } = await requireAdmin();
  if (!session) return { session: null, response };

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      adminProfile: {
        select: {
          role: { select: { name: true, permissions: true } },
        },
      },
    },
  });

  const role = user?.adminProfile?.role;
  const normalizedRoleName = String(role?.name ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (!role) {
    // Admin user with no AdminProfile row (e.g. seed-created admins) → treat as Super Admin
    return { session, response: null as NextResponse | null };
  }
  if (normalizedRoleName === "SUPER_ADMIN") {
    return { session, response: null as NextResponse | null };
  }

  let perms: string[] = [];
  try {
    const parsed = JSON.parse(role.permissions);
    perms = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    perms = [];
  }

  if (!perms.includes(permission)) {
    return {
      session: null,
      response: NextResponse.json({ error: `Forbidden: missing permission ${permission}` }, { status: 403 }),
    };
  }

  return { session, response: null as NextResponse | null };
}

export async function requireParentUnlocked() {
  const { session, response } = await requireSession();
  if (!session) {
    return { session: null, response };
  }

  const unlocked = await readParentUnlockFromCookie(session.userId);
  if (!unlocked) {
    return { session: null, response: NextResponse.json({ error: "Parent PIN required." }, { status: 403 }) };
  }

  return { session, response: null as NextResponse | null };
}
