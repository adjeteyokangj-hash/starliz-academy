import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { exchangeAuthCodeAndStore, getGraphOrigin } from "@/lib/imap-client";

export async function GET(req: NextRequest) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthError = requestUrl.searchParams.get("error");
  const oauthErrorDescription = requestUrl.searchParams.get("error_description");

  const savedState = req.cookies.get("inbox_oauth_state")?.value;
  if (!savedState || !state || savedState !== state) {
    return NextResponse.redirect(new URL("/admin/inbox?error=oauth_failed", requestUrl));
  }

  if (oauthError) {
    void oauthErrorDescription;
    void oauthError;
    return NextResponse.redirect(new URL("/admin/inbox?error=oauth_failed", requestUrl));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/admin/inbox?error=oauth_failed", requestUrl));
  }

  try {
    const fallbackOrigin = requestUrl.origin;
    const origin = getGraphOrigin(fallbackOrigin);
    await exchangeAuthCodeAndStore({ adminUserId: session.userId, code, origin });
    const res = NextResponse.redirect(new URL("/admin/inbox?connected=1", requestUrl));
    res.cookies.set("inbox_oauth_state", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (error) {
    void error;
    return NextResponse.redirect(new URL("/admin/inbox?error=oauth_failed", requestUrl));
  }
}
