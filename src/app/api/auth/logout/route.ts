import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getAuthCookieName,
  getChildSelectionCookieName,
  getParentUnlockCookieName,
  getRefreshCookieName,
  readSessionFromCookie,
} from "@/lib/auth";
import { hashOpaqueToken, revokeRefreshRecord, getRefreshRecord } from "@/lib/auth_sessions";
import { PORTAL_MODE_COOKIE } from "@/lib/schools/portal-routing";

async function clearSessionCookies(response: NextResponse) {
  const session = await readSessionFromCookie();
  const refreshCookieName = getRefreshCookieName();
  const refreshToken = (await cookies()).get(refreshCookieName)?.value;

  if (session?.userId && refreshToken) {
    const found = await getRefreshRecord({
      userId: session.userId,
      tokenHash: hashOpaqueToken(refreshToken),
    });
    if (found?.row?.id) {
      await revokeRefreshRecord(found.row.id, "user_logout");
    }
  }

  const cleared = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };

  response.cookies.set(getAuthCookieName(), "", cleared);
  response.cookies.set(refreshCookieName, "", cleared);
  response.cookies.set(getParentUnlockCookieName(), "", cleared);
  response.cookies.set(getChildSelectionCookieName(), "", cleared);
  response.cookies.set(PORTAL_MODE_COOKIE, "", {
    ...cleared,
    httpOnly: true,
  });

  return response;
}

/** JSON logout used by fetch() clients (Navbar, Parent portal, Admin, etc.). */
export async function POST() {
  return clearSessionCookies(NextResponse.json({ ok: true }));
}

/**
 * Link-friendly logout for Teacher / School Admin nav `<a href="/api/auth/logout">`.
 * Without this, browsers GET the route, get 405, and show ERR_INVALID_RESPONSE —
 * leaving the session intact and blocking parent login (middleware redirects
 * authenticated teachers away from /auth/login and /parent).
 */
export async function GET(request: Request) {
  const loginUrl = new URL("/auth/login", request.url);
  loginUrl.searchParams.set("loggedOut", "1");
  return clearSessionCookies(NextResponse.redirect(loginUrl));
}
