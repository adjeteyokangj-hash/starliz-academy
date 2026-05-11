import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { getInboxConfig, fetchMessages } from "@/lib/imap-client";

export async function GET(req: NextRequest) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const cfg = await getInboxConfig(session.userId);
  if (!cfg) {
    return NextResponse.json({ connected: false, messages: [] });
  }

  const { searchParams } = req.nextUrl;
  const folder = searchParams.get("folder") ?? "inbox";
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 100);

  const messages = await fetchMessages(session.userId, req.nextUrl.origin, folder, limit).catch((e: Error) =>
    NextResponse.json({ error: e.message }, { status: 502 })
  );
  if (messages instanceof NextResponse) return messages;

  return NextResponse.json({
    connected: true,
    account: { email: cfg.email },
    messages,
  });
}
