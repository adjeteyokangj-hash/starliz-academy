import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { readParentUnlockFromCookie, readSessionFromCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  auditAdminAccessDenial,
  contextHasPermission,
  deniedAdminResponse,
  loadAdminAuthContext,
} from "@/lib/admin-permissions";
import type { AdminAuthContext } from "@/lib/admin-permissions";

type SessionLike = {
  userId: string;
  email: string;
  role: string;
};

/**
 * Placeholder response for the authorised path of the require* guards.
 * Callers use these guards as `if (!session) return response;`, so `response` is
 * only ever returned when the request is rejected. Typing it as a non-null
 * `NextResponse` keeps every route handler's inferred return type as
 * `Promise<NextResponse>` (required by the Next.js 16 route type contract).
 * The runtime value remains null on the authorised path and is never dereferenced.
 */
function nullGuardResponse(): NextResponse {
  return null as unknown as NextResponse;
}

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
    // `response` is only ever consumed via `if (!session) return response;` early-returns.
    // Typing it non-null keeps route handlers' return type `Promise<NextResponse>` (Next 16 route contract);
    // the runtime value stays null on the authorised path and is never dereferenced.
    return { session, response: nullGuardResponse() };
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
      return { session: devSession, response: nullGuardResponse() };
    }

    return { session: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!session) {
    return { session: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session, response: nullGuardResponse() };
}

export async function requireAdmin(): Promise<{
  session: SessionLike | null;
  response: NextResponse;
  context?: AdminAuthContext;
}> {
  const { session, response } = await requireSession();
  if (!session) return { session: null, response };

  const context = await loadAdminAuthContext(session.userId);
  if (!context) {
    await auditAdminAccessDenial({
      actorUserId: session.userId,
      action: "admin_access_denied",
      reason: "not_platform_admin",
    });
    return {
      session: null,
      response: NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 }),
    };
  }

  if (!context.active || context.isLocked) {
    await auditAdminAccessDenial({
      actorUserId: session.userId,
      action: "admin_access_denied",
      reason: context.isLocked ? "admin_locked" : "admin_inactive",
    });
    return {
      session: null,
      response: NextResponse.json({ error: "Forbidden: admin account is inactive." }, { status: 403 }),
    };
  }

  return { session, response: nullGuardResponse(), context };
}

/**
 * Canonical Admin permission gate.
 * Accepts canonical MANAGE_* tokens or legacy colon aliases; maps centrally.
 * Missing/invalid role assignment fails closed (no Super Admin bypass).
 */
export async function requireAdminPermission(permission: string): Promise<{
  session: SessionLike | null;
  response: NextResponse;
  context?: AdminAuthContext;
}> {
  const { session, response } = await requireSession();
  if (!session) return { session: null, response };

  const context = await loadAdminAuthContext(session.userId);
  if (!context) {
    await auditAdminAccessDenial({
      actorUserId: session.userId,
      action: "admin_access_denied",
      reason: "not_platform_admin",
      permission,
    });
    return {
      session: null,
      response: NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 }),
    };
  }

  if (!context.active || context.isLocked) {
    await auditAdminAccessDenial({
      actorUserId: session.userId,
      action: "admin_access_denied",
      reason: context.isLocked ? "admin_locked" : "admin_inactive",
      permission,
    });
    return {
      session: null,
      response: NextResponse.json({ error: "Forbidden: admin account is inactive." }, { status: 403 }),
    };
  }

  if (!context.roleId || !context.roleName) {
    await auditAdminAccessDenial({
      actorUserId: session.userId,
      action: "admin_permission_denied",
      reason: "missing_or_invalid_role",
      permission,
    });
    return {
      session: null,
      response: deniedAdminResponse("Your Admin account has no valid role assignment. Contact a Super Admin."),
    };
  }

  if (!contextHasPermission(context, permission)) {
    await auditAdminAccessDenial({
      actorUserId: session.userId,
      action: "admin_permission_denied",
      reason: "missing_permission",
      permission,
      metadata: { roleName: context.roleName },
    });
    if (permission === "MANAGE_SAFEGUARDING") {
      await auditAdminAccessDenial({
        actorUserId: session.userId,
        action: "safeguarding_access_denied",
        reason: "missing_permission",
        permission,
        metadata: { roleName: context.roleName },
      });
    }
    return {
      session: null,
      response: deniedAdminResponse(),
    };
  }

  return { session, response: nullGuardResponse(), context };
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

  return { session, response: nullGuardResponse() };
}
