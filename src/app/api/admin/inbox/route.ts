import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { getInboxConnection } from "@/lib/inbox-connection";
import { getInboxConfig, fetchMessages } from "@/lib/imap-client";

export async function GET(req: NextRequest) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  // Use the safe shared helper — has try/catch so DB saturation returns null
  const conn = await getInboxConnection(session.userId);
  if (!conn?.connected) {
    return NextResponse.json({ connected: false, messages: [] });
  }

  // Full config needed for Graph API calls (has microsoftUserId)
  const cfg = await getInboxConfig(session.userId);
  if (!cfg) {
    // Extremely unlikely: connection exists but secondary read failed
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

  return NextResponse.json({
    connected: true,
    account: { email: cfg.email },
    messages: result.messages,
    mailboxError: result.mailboxError,
  });
}
