import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  createSessionToken,
  getAccessTokenMaxAgeSeconds,
  getAuthCookieName,
  getRefreshCookieName,
} from "@/lib/auth";
import {
  buildDeviceFingerprint,
  getRefreshTokenMaxAgeSeconds,
  hashOpaqueToken,
  isRefreshRecordActive,
  isTeacherSuspended,
  issueRefreshToken,
  revokeAllRefreshSessions,
  revokeRefreshRecord,
  verifyRefreshToken,
} from "@/lib/auth_sessions";
import { getRequestIp } from "@/lib/api_guard";

function withNoStore<T extends NextResponse>(response: T): T {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function defaultPathForRole(role: string): string {
  if (role === "admin") return "/admin";
  if (role === "student") return "/student/dashboard";
  return "/parent/profiles";
}

function resolveRefreshNextPath(nextPath: string | null | undefined, role: string): string | null {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return null;
  }
  // Never dump a parent/student session onto /admin after access-token refresh.
  if (nextPath.startsWith("/admin") && role !== "admin") {
    return null;
  }
  if (nextPath.startsWith("/student") && role === "parent") {
    return "/parent/profiles";
  }
  return nextPath;
}

async function refreshSession(request: Request, nextPath?: string | null) {
  const refreshCookieName = getRefreshCookieName();
  const authCookieName = getAuthCookieName();
  const hasRedirect = Boolean(nextPath && nextPath.startsWith("/"));
  const loginTarget = nextPath?.startsWith("/admin") ? "/admin/login" : "/auth/login";

  const buildError = (status = 401, message = "Session expired", clearCookies = hasRedirect) => {
    const target = hasRedirect ? new URL(loginTarget, request.url) : null;
    const res = hasRedirect
      ? NextResponse.redirect(target!)
      : NextResponse.json({ error: message }, { status });
    if (hasRedirect && status >= 400) {
      res.headers.set("x-refresh-error", message);
    }
    if (clearCookies) {
      res.cookies.set(authCookieName, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
        expires: new Date(0),
      });
      res.cookies.set(refreshCookieName, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
        expires: new Date(0),
      });
    }
    return withNoStore(res);
  };

  const token = (await cookies()).get(refreshCookieName)?.value;
  if (!token) return buildError(401, "Missing refresh token", hasRedirect);

  const claims = await verifyRefreshToken(token);
  if (!claims?.userId) return buildError(401, "Invalid refresh token", hasRedirect);

  const ip = getRequestIp(request);
  const userAgent = request.headers.get("user-agent") ?? undefined;
  const fingerprint = buildDeviceFingerprint({ ip, userAgent });

  const state = await isRefreshRecordActive({
    userId: claims.userId,
    tokenHash: hashOpaqueToken(token),
    fingerprint,
    ipAddress: ip,
    userAgent,
  });

  if (!state.active || !state.rowId) {
    return buildError(401, "Refresh token is no longer valid", hasRedirect);
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: { id: true, email: true, role: true },
  });
  if (!user) return buildError(401, "User not found", hasRedirect);

  // Forced logout: suspended school accounts cannot continue refreshing sessions.
  if (user.role !== "admin") {
    const suspended = await isTeacherSuspended(user.id);
    if (suspended) {
      await revokeAllRefreshSessions(user.id, "school_suspension");
      return buildError(403, "Account suspended", true);
    }
  }

  // Rotate refresh token: old token revoked, new token issued in same session family.
  await revokeRefreshRecord(state.rowId, "rotated");
  const nextRefresh = await issueRefreshToken({
    userId: user.id,
    fingerprint,
    existingSid: state.sid ?? claims.sid,
    ipAddress: ip,
    userAgent,
  });

  const nextAccess = await createSessionToken(
    { userId: user.id, email: user.email, role: user.role },
    getAccessTokenMaxAgeSeconds()
  );

  const safeNext = resolveRefreshNextPath(nextPath, user.role) ?? defaultPathForRole(user.role);
  const response = hasRedirect
    ? NextResponse.redirect(new URL(safeNext, request.url))
    : NextResponse.json({
      ok: true,
      refreshed: true,
      user: { id: user.id, email: user.email, role: user.role },
    });

  response.cookies.set(authCookieName, nextAccess, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getAccessTokenMaxAgeSeconds(),
  });
  response.cookies.set(refreshCookieName, nextRefresh.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getRefreshTokenMaxAgeSeconds(),
  });

  return withNoStore(response);
}

export async function POST(request: Request) {
  try {
    return await refreshSession(request, null);
  } catch (error) {
    console.error("Auth refresh failed", error);
    return withNoStore(NextResponse.json({ error: "Session refresh failed" }, { status: 503 }));
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next");
  try {
    return await refreshSession(request, next);
  } catch (error) {
    console.error("Auth refresh failed", error);
    const hasRedirect = Boolean(next && next.startsWith("/"));
    const targetPath = hasRedirect && next?.startsWith("/admin") ? "/admin/login" : "/auth/login";
    const target = hasRedirect ? new URL(targetPath, request.url) : null;
    const res = hasRedirect
      ? NextResponse.redirect(target!)
      : NextResponse.json({ error: "Session refresh failed" }, { status: 503 });
    res.headers.set("x-refresh-error", "refresh_exception");
    res.cookies.set(getAuthCookieName(), "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });
    res.cookies.set(getRefreshCookieName(), "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });
    return withNoStore(res);
  }
}
