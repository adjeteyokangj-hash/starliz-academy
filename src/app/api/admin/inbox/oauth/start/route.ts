import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { buildMicrosoftAuthorizeUrl, generateOAuthState, getGraphOrigin } from "@/lib/imap-client";

export async function GET(req: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const state = generateOAuthState();
  const fallbackOrigin = new URL(req.url).origin;
  const origin = getGraphOrigin(fallbackOrigin);
  const authorizeUrl = buildMicrosoftAuthorizeUrl({ origin, state });

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set("inbox_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  return res;
}
