import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hasCronAccess } from "@/lib/cron-auth";
import { sweepStaleTutorPresence } from "@/lib/schools/human-support-presence";
import { startJobLog, finishJobLog, failJobLog } from "@/lib/jobs/logger";

export const TUTOR_PRESENCE_SWEEP_JOB = "tutor-presence-sweep";

/**
 * Shared handler for Vercel Cron (GET) and manual ops (POST).
 * Requires CRON_SECRET in production.
 */
export async function handleTutorPresenceSweepCron(request: Request) {
  if (!hasCronAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobLog = await startJobLog(TUTOR_PRESENCE_SWEEP_JOB);
  try {
    const sweep = await sweepStaleTutorPresence();

    // Expire waiting entries past period/expiry.
    const now = new Date();
    const expired = await prisma.humanSupportQueueEntry.updateMany({
      where: {
        status: "waiting",
        expiresAt: { lte: now },
      },
      data: { status: "expired" },
    });

    const summary = {
      markedOffline: sweep.markedOffline,
      pausedQueue: sweep.pausedQueue,
      schoolsTouched: sweep.schoolsTouched,
      expiredWaiting: expired.count,
    };
    await finishJobLog(jobLog.id, summary);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    await failJobLog(jobLog.id, error);
    throw error;
  }
}

/** Vercel Cron invokes GET with Authorization: Bearer ${CRON_SECRET}. */
export async function GET(request: Request) {
  return handleTutorPresenceSweepCron(request);
}

/** Manual/ops triggers may use POST with the same secret. */
export async function POST(request: Request) {
  return handleTutorPresenceSweepCron(request);
}
