import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { getInboxConnection } from "@/lib/inbox-connection";
import { fetchMessages } from "@/lib/imap-client";

export async function GET(req: NextRequest) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  let conn;
  try {
    conn = await getInboxConnection(session.userId);
  } catch (error) {
    console.error("Inbox API connection read failed", error);
    return NextResponse.json({ error: "Inbox connection temporarily unavailable." }, { status: 503 });
  }

  if (!conn?.connected) {
    console.log("Inbox API response", {
      connected: false,
      provider: "microsoft",
      email: conn?.email ?? null,
      hasAccessToken: conn?.hasAccessToken ?? false,
      hasRefreshToken: conn?.hasRefreshToken ?? false,
    });
    return NextResponse.json({ connected: false, messages: [] });
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
    email: conn.email,
    hasAccessToken: conn.hasAccessToken,
    hasRefreshToken: conn.hasRefreshToken,
  });

  return NextResponse.json({
    connected: true,
    account: { email: conn.email },
    messages: result.messages,
    mailboxError: result.mailboxError,
  });
}
