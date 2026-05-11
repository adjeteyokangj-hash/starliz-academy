import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { disconnectInbox, getInboxConfig } from "@/lib/imap-client";

// GET — check if configured
export async function GET() {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const cfg = await getInboxConfig(session.userId);
  if (!cfg) return NextResponse.json({ configured: false });

  return NextResponse.json({
    configured: true,
    email: cfg.email,
    displayName: cfg.displayName,
  });
}

// POST — password-based IMAP setup is deprecated; OAuth should be used instead.
export async function POST(req: NextRequest) {
  void req;
  return NextResponse.json(
    { error: "Password-based setup is no longer supported. Use /api/admin/inbox/oauth/start." },
    { status: 410 }
  );
}

// DELETE — disconnect
export async function DELETE() {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  await disconnectInbox(session.userId);
  return NextResponse.json({ disconnected: true });
}
