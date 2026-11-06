import { NextResponse } from "next/server";
import { hasCronAccess } from "@/lib/cron-auth";
import { sweepShortLearningBookingLifecycle } from "@/lib/schools/short-learning-booking-lifecycle";
import { startJobLog, finishJobLog, failJobLog } from "@/lib/jobs/logger";

export const SHORT_LEARNING_LIFECYCLE_JOB = "short-learning-lifecycle";

/**
 * Shared handler for Vercel Cron (GET) and manual ops (POST).
 * Advances Short Learning booking lifecycle from wall-clock windows.
 * Requires CRON_SECRET in production.
 */
export async function handleShortLearningLifecycleCron(request: Request) {
  if (!hasCronAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobLog = await startJobLog(SHORT_LEARNING_LIFECYCLE_JOB);
  try {
    const result = await sweepShortLearningBookingLifecycle();
    await finishJobLog(jobLog.id, result as Record<string, unknown>);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    await failJobLog(jobLog.id, error);
    throw error;
  }
}

/** Vercel Cron invokes GET with Authorization: Bearer ${CRON_SECRET}. */
export async function GET(request: Request) {
  return handleShortLearningLifecycleCron(request);
}

/** Manual/ops triggers may use POST with the same secret. */
export async function POST(request: Request) {
  return handleShortLearningLifecycleCron(request);
}
