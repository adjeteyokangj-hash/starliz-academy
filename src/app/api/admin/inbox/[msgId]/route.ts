import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { getInboxConfig, fetchMessageBody, deleteMessage } from "@/lib/imap-client";

type Params = { params: Promise<{ msgId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const cfg = await getInboxConfig(session.userId);
  if (!cfg) return NextResponse.json({ error: "Inbox not configured." }, { status: 400 });

  const { msgId } = await params;

  const message = await fetchMessageBody(session.userId, req.nextUrl.origin, msgId).catch((e: Error) =>
    NextResponse.json({ error: e.message }, { status: 502 })
  );
  if (message instanceof NextResponse) return message;
  if (!message) return NextResponse.json({ error: "Message not found." }, { status: 404 });

  return NextResponse.json(message);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const cfg = await getInboxConfig(session.userId);
  if (!cfg) return NextResponse.json({ error: "Inbox not configured." }, { status: 400 });

  const { msgId } = await params;

  await deleteMessage(session.userId, req.nextUrl.origin, msgId).catch((e: Error) => {
    throw new Error(e.message);
  });

  return NextResponse.json({ deleted: true });
}
