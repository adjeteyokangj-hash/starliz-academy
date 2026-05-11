import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { getInboxConfig, sendEmail } from "@/lib/imap-client";

export async function POST(req: NextRequest) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const cfg = await getInboxConfig(session.userId);
  if (!cfg) return NextResponse.json({ error: "Inbox not configured." }, { status: 400 });

  const { to, subject, body, cc } = await req.json() as {
    to: string; subject: string; body: string; cc?: string;
  };

  if (!to || !subject || !body) {
    return NextResponse.json({ error: "to, subject, and body are required." }, { status: 400 });
  }

  await sendEmail(session.userId, req.nextUrl.origin, { to, subject, html: body.replace(/\n/g, "<br>"), cc }).catch((e: Error) => {
    throw new Error(e.message);
  });

  return NextResponse.json({ sent: true });
}
