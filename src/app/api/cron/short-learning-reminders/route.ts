import { NextResponse } from "next/server";
import { hasCronAccess } from "@/lib/cron-auth";
import { enqueueDueShortLearningReminders } from "@/lib/schools/short-learning-notifications";
import { dispatchPendingNotificationEvents } from "@/lib/notifications/dispatcher";

/**
 * Shared handler for Vercel Cron (GET) and manual ops (POST).
 * Exported for focused auth tests without spinning up Next.
 */
export async function handleShortLearningRemindersCron(request: Request) {
  if (!hasCronAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reminders = await enqueueDueShortLearningReminders();
  const dispatched = await dispatchPendingNotificationEvents(50);
  return NextResponse.json({ ok: true, reminders, dispatched });
}

/** Vercel Cron invokes GET with Authorization: Bearer ${CRON_SECRET}. */
export async function GET(request: Request) {
  return handleShortLearningRemindersCron(request);
}

/** Manual/ops triggers may use POST with the same secret. */
export async function POST(request: Request) {
  return handleShortLearningRemindersCron(request);
}
