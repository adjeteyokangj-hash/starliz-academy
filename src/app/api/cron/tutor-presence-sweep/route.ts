import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sweepStaleTutorPresence } from "@/lib/schools/human-support-presence";

function hasCronAccess(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return (
    request.headers.get("authorization") === `Bearer ${secret}`
    || request.headers.get("x-cron-secret") === secret
  );
}

export async function POST(request: Request) {
  if (!hasCronAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  return NextResponse.json({
    ok: true,
    markedOffline: sweep.markedOffline,
    pausedQueue: sweep.pausedQueue,
    schoolsTouched: sweep.schoolsTouched,
    expiredWaiting: expired.count,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
