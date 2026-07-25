import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { getSchoolTeacherContext } from "@/lib/schools/rbac";
import {
  countOnlineTutors,
  getOrCreateSupportPolicy,
  heartbeatTutorPresence,
} from "@/lib/schools/human-support-presence";

/**
 * Automatic tutor presence for Live Classroom.
 * Opening / heartbeat → AVAILABLE (unless BUSY).
 * Close / offline flag → OFFLINE.
 */
export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ error: "No active school teacher membership." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const dayLessonId = typeof (body as { dayLessonId?: unknown }).dayLessonId === "string"
    ? (body as { dayLessonId: string }).dayLessonId
    : null;
  const pause = Boolean((body as { pause?: unknown }).pause);
  const offline = Boolean((body as { offline?: unknown }).offline);

  const result = await heartbeatTutorPresence({
    schoolId: ctx.schoolId,
    schoolTeacherId: ctx.schoolTeacherId,
    actorUserId: session.userId,
    dayLessonId,
    pause,
    offline,
  });

  const policy = await getOrCreateSupportPolicy(ctx.schoolId);
  const counts = await countOnlineTutors({
    schoolId: ctx.schoolId,
    staleAfterSec: policy.staleAfterSec,
  });

  return NextResponse.json({
    ok: true,
    presence: {
      status: result.status,
      lastHeartbeatAt: result.lastHeartbeatAt.toISOString(),
      changed: result.changed,
    },
    counts: {
      online: counts.onlineTutorCount,
      available: counts.availableTutorCount,
      busy: counts.busyTutorCount,
      paused: counts.pausedTutorCount,
    },
    policy: {
      heartbeatIntervalSec: policy.heartbeatIntervalSec,
      staleAfterSec: policy.staleAfterSec,
    },
  });
}

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ error: "No active school teacher membership." }, { status: 403 });
  }

  const policy = await getOrCreateSupportPolicy(ctx.schoolId);
  const counts = await countOnlineTutors({
    schoolId: ctx.schoolId,
    staleAfterSec: policy.staleAfterSec,
  });

  return NextResponse.json({
    ok: true,
    counts: {
      online: counts.onlineTutorCount,
      available: counts.availableTutorCount,
      busy: counts.busyTutorCount,
      paused: counts.pausedTutorCount,
    },
    policy: {
      heartbeatIntervalSec: policy.heartbeatIntervalSec,
      staleAfterSec: policy.staleAfterSec,
      minimumSessionMinutes: policy.minimumSessionMinutes,
      maximumSessionMinutes: policy.maximumSessionMinutes,
    },
  });
}
