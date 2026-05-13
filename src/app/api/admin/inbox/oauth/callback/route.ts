import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exchangeAuthCodeAndStore, getGraphOrigin, readInboxOAuthState } from "@/lib/imap-client";
import { getInboxConnection, InboxTokenSaveError } from "@/lib/inbox-connection";

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthError = requestUrl.searchParams.get("error");
  const oauthErrorDescription = requestUrl.searchParams.get("error_description");

  const decodedState = state ? readInboxOAuthState(state) : null;
  if (!decodedState) {
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
    const adminUser = await prisma.user.findUnique({
      where: { id: decodedState.adminUserId },
      select: {
        role: true,
        adminProfile: {
          select: { active: true },
        },
      },
    });
    if (!adminUser || adminUser.role !== "admin" || adminUser.adminProfile?.active === false) {
      return NextResponse.redirect(new URL("/admin/inbox?error=oauth_failed", requestUrl));
    }

    const adminUserId = decodedState.adminUserId;
    console.log("[inbox-oauth-callback] starting exchange for adminUserId", adminUserId);
    const fallbackOrigin = requestUrl.origin;
    const origin = getGraphOrigin(fallbackOrigin);
    console.log("[inbox-oauth-callback] calling exchangeAuthCodeAndStore", { adminUserId, code: code?.substring(0, 10), origin });
    await exchangeAuthCodeAndStore({ adminUserId, code, origin });
    console.log("[inbox-oauth-callback] exchangeAuthCodeAndStore succeeded");

    console.log("[inbox-oauth-callback] verifying persistence");
    const persisted = await getInboxConnection(adminUserId);
    console.log("[inbox-oauth-callback] persisted connection", {
      connected: persisted?.connected,
      email: persisted?.email,
    });
    if (!persisted?.connected) {
      throw new InboxTokenSaveError("Inbox connection not persisted after OAuth callback.");
    }

    console.log("[inbox-oauth-callback] redirecting to /admin/inbox?connected=1");
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
    console.error("[inbox-oauth-callback] FAILED", {
      error: error instanceof Error ? error.message : String(error),
      adminUserId: decodedState?.adminUserId,
      code: code?.substring(0, 10),
    });
    const isTokenSaveFailure =
      error instanceof InboxTokenSaveError ||
      (error instanceof Error && /persist|OutlookToken|token storage/i.test(error.message));

    return NextResponse.redirect(
      new URL(
        isTokenSaveFailure
          ? "/admin/inbox?error=token_save_failed"
          : "/admin/inbox?error=oauth_failed",
        requestUrl
      )
    );
  }
}
