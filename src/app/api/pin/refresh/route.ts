import { NextResponse } from "next/server";
import {
  createParentUnlockToken,
  getParentUnlockCookieName,
  getParentUnlockMaxAgeSeconds,
} from "@/lib/auth";
import { requireParentUnlocked } from "@/lib/api_guard";

function withNoStore<T extends NextResponse>(response: T): T {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST() {
  const { session, response } = await requireParentUnlocked();
  if (!session) return withNoStore(response);
  if (session.role !== "parent") {
    return withNoStore(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  const token = await createParentUnlockToken(session.userId);
  const reply = NextResponse.json({ ok: true, refreshed: true });
  reply.cookies.set(getParentUnlockCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getParentUnlockMaxAgeSeconds(),
  });
  return withNoStore(reply);
}
