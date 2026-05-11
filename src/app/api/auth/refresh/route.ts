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

export async function POST(request: Request) {
  const refreshCookieName = getRefreshCookieName();
  const authCookieName = getAuthCookieName();

  const clearAndDeny = (status = 401, message = "Session expired") => {
    const res = NextResponse.json({ error: message }, { status });
    res.cookies.set(authCookieName, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    res.cookies.set(refreshCookieName, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return res;
  };

  const token = (await cookies()).get(refreshCookieName)?.value;
  if (!token) return clearAndDeny(401, "Missing refresh token");

  const claims = await verifyRefreshToken(token);
  if (!claims?.userId) return clearAndDeny(401, "Invalid refresh token");

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
    return clearAndDeny(401, "Refresh token is no longer valid");
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: { id: true, email: true, role: true },
  });
  if (!user) return clearAndDeny(401, "User not found");

  // Forced logout: suspended school accounts cannot continue refreshing sessions.
  if (user.role !== "admin") {
    const suspended = await isTeacherSuspended(user.id);
    if (suspended) {
      await revokeAllRefreshSessions(user.id, "school_suspension");
      return clearAndDeny(403, "Account suspended");
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

  const response = NextResponse.json({
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

  return response;
}
