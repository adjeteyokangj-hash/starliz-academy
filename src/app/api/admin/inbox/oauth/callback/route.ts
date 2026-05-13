import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exchangeAuthCodeAndStore, getGraphOrigin, readInboxOAuthState } from "@/lib/imap-client";

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
    console.log("Inbox OAuth save adminUserId", adminUserId);
    const fallbackOrigin = requestUrl.origin;
    const origin = getGraphOrigin(fallbackOrigin);
    await exchangeAuthCodeAndStore({ adminUserId, code, origin });
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
