import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { dispatchPendingNotificationEvents } from "@/lib/notifications/dispatcher";

export async function POST() {
  const { session, response } = await requireAdminPermission("MANAGE_INBOX");
  if (!session) return response;

  const processed = await dispatchPendingNotificationEvents(50);
  return NextResponse.json({ processed });
}
