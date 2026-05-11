import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthCookieName, getParentUnlockCookieName, getRefreshCookieName, readSessionFromCookie } from "@/lib/auth";
import { hashOpaqueToken, revokeRefreshRecord, getRefreshRecord } from "@/lib/auth_sessions";

export async function POST() {
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

  const response = NextResponse.json({ ok: true });
  response.cookies.set(getAuthCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(refreshCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(getParentUnlockCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
