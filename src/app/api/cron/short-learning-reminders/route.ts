import { NextResponse } from "next/server";
import { hasCronAccess } from "@/lib/cron-auth";
import { enqueueDueShortLearningReminders } from "@/lib/schools/short-learning-notifications";
import { dispatchPendingNotificationEvents } from "@/lib/notifications/dispatcher";
import { startJobLog, finishJobLog, failJobLog } from "@/lib/jobs/logger";

export const SHORT_LEARNING_REMINDERS_JOB = "short-learning-reminders";

/**
 * Shared handler for Vercel Cron (GET) and manual ops (POST).
 * Exported for focused auth tests without spinning up Next.
 * Requires CRON_SECRET in production.
 */
export async function handleShortLearningRemindersCron(request: Request) {
  if (!hasCronAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobLog = await startJobLog(SHORT_LEARNING_REMINDERS_JOB);
  try {
    const reminders = await enqueueDueShortLearningReminders();
    const dispatched = await dispatchPendingNotificationEvents(50);
    const summary = { reminders, dispatched };
    await finishJobLog(jobLog.id, summary as Record<string, unknown>);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    await failJobLog(jobLog.id, error);
    throw error;
  }
}

/** Vercel Cron invokes GET with Authorization: Bearer ${CRON_SECRET}. */
export async function GET(request: Request) {
  return handleShortLearningRemindersCron(request);
}

/** Manual/ops triggers may use POST with the same secret. */
export async function POST(request: Request) {
  return handleShortLearningRemindersCron(request);
}
