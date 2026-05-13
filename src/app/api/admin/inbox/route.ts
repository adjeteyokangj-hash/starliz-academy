import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { getInboxConnection } from "@/lib/inbox-connection";
import { getInboxConfig, fetchMessages } from "@/lib/imap-client";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  let tokenRow:
    | {
        accessToken: string;
        refreshToken: string;
        email: string;
      }
    | null = null;
  try {
    tokenRow = await prisma.outlookToken.findUnique({
      where: { adminUserId: session.userId },
      select: {
        accessToken: true,
        refreshToken: true,
        email: true,
      },
    });
  } catch {
    // Temporary diagnostics should never block API responses.
    tokenRow = null;
  }

  // Use the safe shared helper — has try/catch so DB saturation returns null
  const conn = await getInboxConnection(session.userId);
  if (!conn?.connected) {
    console.log("Inbox API response", {
      connected: false,
      provider: "microsoft",
      email: tokenRow?.email ?? null,
      hasAccessToken: !!tokenRow?.accessToken?.trim(),
      hasRefreshToken: !!tokenRow?.refreshToken?.trim(),
    });
    return NextResponse.json({ connected: false, messages: [] });
  }

  // Full config needed for Graph API calls (has microsoftUserId)
  const cfg = await getInboxConfig(session.userId);
  if (!cfg) {
    // Extremely unlikely: connection exists but secondary read failed
    console.log("Inbox API response", {
      connected: true,
      provider: "microsoft",
      email: conn.email,
      hasAccessToken: !!tokenRow?.accessToken?.trim(),
      hasRefreshToken: !!tokenRow?.refreshToken?.trim(),
    });
    return NextResponse.json({
      connected: true,
      account: { email: conn.email },
      messages: [],
      mailboxError: "Could not load mailbox config. Please try refreshing.",
    });
  }

  const { searchParams } = req.nextUrl;
  const folder = searchParams.get("folder") ?? "inbox";
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 100);

  const result = await fetchMessages(session.userId, req.nextUrl.origin, folder, limit)
    .then((messages) => ({ messages, mailboxError: null as string | null }))
    .catch((e: Error) => ({ messages: [] as Awaited<ReturnType<typeof fetchMessages>>, mailboxError: e.message }));

  console.log("Inbox API response", {
    connected: true,
    provider: "microsoft",
    email: cfg.email,
    hasAccessToken: !!tokenRow?.accessToken?.trim(),
    hasRefreshToken: !!tokenRow?.refreshToken?.trim(),
  });

  return NextResponse.json({
    connected: true,
    account: { email: cfg.email },
    messages: result.messages,
    mailboxError: result.mailboxError,
  });
}
