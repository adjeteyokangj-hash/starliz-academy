import { prisma } from "@/lib/db";
import type { TutorAvailabilityStatus } from "@prisma/client";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import { resolveTutorShiftEligibility } from "@/lib/schools/tutor-support-shifts";

export type SupportPolicy = {
  id: string;
  schoolId: string;
  minimumSessionMinutes: number;
  maximumSessionMinutes: number;
  closeoutReserveMinutes: number;
  heartbeatIntervalSec: number;
  staleAfterSec: number;
  transitionMinutes: number;
  shiftEndGraceMinutes: number;
};

export async function getOrCreateSupportPolicy(schoolId: string): Promise<SupportPolicy> {
  const existing = await prisma.schoolSupportPolicy.findUnique({ where: { schoolId } });
  if (existing) return existing;
  return prisma.schoolSupportPolicy.create({
    data: { schoolId },
  });
}

function isFresh(lastHeartbeatAt: Date, staleAfterSec: number, now: Date): boolean {
  return now.getTime() - lastHeartbeatAt.getTime() <= staleAfterSec * 1000;
}

export type TutorCounts = {
  onlineTutorCount: number;
  availableTutorCount: number;
  busyTutorCount: number;
  pausedTutorCount: number;
};

export async function countOnlineTutors(input: {
  schoolId: string;
  staleAfterSec: number;
  now?: Date;
}): Promise<TutorCounts> {
  const now = input.now ?? new Date();
  const rows = await prisma.tutorPresence.findMany({
    where: {
      schoolId: input.schoolId,
      status: { in: ["available", "busy", "paused"] },
    },
    select: { status: true, lastHeartbeatAt: true },
  });

  let availableTutorCount = 0;
  let busyTutorCount = 0;
  let pausedTutorCount = 0;
  for (const row of rows) {
    if (!isFresh(row.lastHeartbeatAt, input.staleAfterSec, now)) continue;
    if (row.status === "available") availableTutorCount += 1;
    else if (row.status === "busy") busyTutorCount += 1;
    else if (row.status === "paused") pausedTutorCount += 1;
  }
  return {
    onlineTutorCount: availableTutorCount + busyTutorCount + pausedTutorCount,
    availableTutorCount,
    busyTutorCount,
    pausedTutorCount,
  };
}

export async function heartbeatTutorPresence(input: {
  schoolId: string;
  schoolTeacherId: string;
  actorUserId?: string;
  dayLessonId?: string | null;
  /** Manual pause while remaining on the workspace. */
  pause?: boolean;
  /** Explicit go offline (page close). */
  offline?: boolean;
  now?: Date;
}): Promise<{
  status: TutorAvailabilityStatus;
  lastHeartbeatAt: Date;
  changed: boolean;
}> {
  const now = input.now ?? new Date();
  const existing = await prisma.tutorPresence.findUnique({
    where: { schoolTeacherId: input.schoolTeacherId },
  });

  if (input.offline) {
    const updated = await prisma.tutorPresence.upsert({
      where: { schoolTeacherId: input.schoolTeacherId },
      create: {
        schoolId: input.schoolId,
        schoolTeacherId: input.schoolTeacherId,
        status: "offline",
        lastHeartbeatAt: now,
        dayLessonId: input.dayLessonId ?? null,
      },
      update: {
        status: "offline",
        lastHeartbeatAt: now,
        availableSince: null,
        pausedAt: null,
        busySince: null,
        activeSessionId: null,
        dayLessonId: input.dayLessonId ?? null,
      },
    });
    if (existing && existing.status !== "offline") {
      await writeSchoolAuditLog({
        schoolId: input.schoolId,
        actorUserId: input.actorUserId,
        actorSchoolTeacherId: input.schoolTeacherId,
        actorType: "school_staff",
        source: "api",
        action: "tutor_offline",
        entityType: "teacher",
        entityId: input.schoolTeacherId,
        metadata: { dayLessonId: input.dayLessonId ?? null, previousStatus: existing.status },
      });
    }
    return { status: updated.status, lastHeartbeatAt: updated.lastHeartbeatAt, changed: existing?.status !== "offline" };
  }

  if (input.pause) {
    const updated = await prisma.tutorPresence.upsert({
      where: { schoolTeacherId: input.schoolTeacherId },
      create: {
        schoolId: input.schoolId,
        schoolTeacherId: input.schoolTeacherId,
        status: "paused",
        lastHeartbeatAt: now,
        pausedAt: now,
        dayLessonId: input.dayLessonId ?? null,
      },
      update: {
        status: existing?.status === "busy" ? "busy" : "paused",
        lastHeartbeatAt: now,
        pausedAt: now,
        dayLessonId: input.dayLessonId ?? existing?.dayLessonId ?? null,
      },
    });
    if (existing?.status !== "paused" && existing?.status !== "busy") {
      await writeSchoolAuditLog({
        schoolId: input.schoolId,
        actorUserId: input.actorUserId,
        actorSchoolTeacherId: input.schoolTeacherId,
        actorType: "school_staff",
        source: "api",
        action: "tutor_paused",
        entityType: "teacher",
        entityId: input.schoolTeacherId,
        metadata: { dayLessonId: input.dayLessonId ?? null },
      });
    }
    return { status: updated.status, lastHeartbeatAt: updated.lastHeartbeatAt, changed: true };
  }

  // Auto-available on Live Classroom workspace heartbeat.
  // Do not override busy — accepting a student owns that state until session ends.
  if (existing?.status === "busy") {
    const updated = await prisma.tutorPresence.update({
      where: { schoolTeacherId: input.schoolTeacherId },
      data: {
        lastHeartbeatAt: now,
        dayLessonId: input.dayLessonId ?? existing.dayLessonId,
      },
    });
    return { status: updated.status, lastHeartbeatAt: updated.lastHeartbeatAt, changed: false };
  }

  const eligibility = await resolveTutorShiftEligibility({
    schoolId: input.schoolId,
    schoolTeacherId: input.schoolTeacherId,
    presenceStatus: existing?.status ?? "offline",
    lastHeartbeatAt: now,
    hasActiveSupportSession: Boolean(existing?.activeSessionId),
    now,
  });

  if (!eligibility.canBecomeAvailable) {
    const forcedStatus: TutorAvailabilityStatus = existing?.status === "paused" ? "paused" : "offline";
    const updated = await prisma.tutorPresence.upsert({
      where: { schoolTeacherId: input.schoolTeacherId },
      create: {
        schoolId: input.schoolId,
        schoolTeacherId: input.schoolTeacherId,
        status: forcedStatus,
        lastHeartbeatAt: now,
        pausedAt: forcedStatus === "paused" ? now : null,
        dayLessonId: input.dayLessonId ?? null,
      },
      update: {
        status: forcedStatus,
        lastHeartbeatAt: now,
        availableSince: null,
        pausedAt: forcedStatus === "paused" ? (existing?.pausedAt ?? now) : null,
        busySince: null,
        dayLessonId: input.dayLessonId ?? existing?.dayLessonId ?? null,
      },
    });
    return {
      status: updated.status,
      lastHeartbeatAt: updated.lastHeartbeatAt,
      changed: existing?.status !== forcedStatus,
    };
  }

  const becomingAvailable = !existing || existing.status === "offline" || existing.status === "paused";
  const updated = await prisma.tutorPresence.upsert({
    where: { schoolTeacherId: input.schoolTeacherId },
    create: {
      schoolId: input.schoolId,
      schoolTeacherId: input.schoolTeacherId,
      status: "available",
      lastHeartbeatAt: now,
      availableSince: now,
      dayLessonId: input.dayLessonId ?? null,
    },
    update: {
      status: "available",
      lastHeartbeatAt: now,
      availableSince: becomingAvailable ? now : existing?.availableSince ?? now,
      pausedAt: null,
      dayLessonId: input.dayLessonId ?? existing?.dayLessonId ?? null,
    },
  });

  if (becomingAvailable) {
    await writeSchoolAuditLog({
      schoolId: input.schoolId,
      actorUserId: input.actorUserId,
      actorSchoolTeacherId: input.schoolTeacherId,
      actorType: "school_staff",
      source: "api",
      action: existing?.status === "offline" || !existing ? "tutor_online" : "tutor_available",
      entityType: "teacher",
      entityId: input.schoolTeacherId,
      metadata: {
        dayLessonId: input.dayLessonId ?? null,
        previousStatus: existing?.status ?? "offline",
        shiftId: eligibility.activeShift?.id ?? null,
      },
    });
  }

  return { status: updated.status, lastHeartbeatAt: updated.lastHeartbeatAt, changed: becomingAvailable };
}

export async function markTutorBusy(input: {
  schoolId: string;
  schoolTeacherId: string;
  sessionId: string;
  actorUserId?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  await prisma.tutorPresence.update({
    where: { schoolTeacherId: input.schoolTeacherId },
    data: {
      status: "busy",
      busySince: now,
      activeSessionId: input.sessionId,
      lastHeartbeatAt: now,
      availableSince: null,
      pausedAt: null,
    },
  });
  await writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    actorSchoolTeacherId: input.schoolTeacherId,
    actorType: "school_staff",
    source: "api",
    action: "tutor_busy",
    entityType: "human_support",
    entityId: input.sessionId,
    metadata: { schoolTeacherId: input.schoolTeacherId, sessionId: input.sessionId },
  });
}

export async function markTutorAvailableAfterSession(input: {
  schoolId: string;
  schoolTeacherId: string;
  actorUserId?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  await prisma.tutorPresence.update({
    where: { schoolTeacherId: input.schoolTeacherId },
    data: {
      status: "available",
      availableSince: now,
      busySince: null,
      activeSessionId: null,
      lastHeartbeatAt: now,
      pausedAt: null,
    },
  });
  await writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    actorSchoolTeacherId: input.schoolTeacherId,
    actorType: "school_staff",
    source: "api",
    action: "tutor_available",
    entityType: "teacher",
    entityId: input.schoolTeacherId,
    metadata: { reason: "session_ended" },
  });
}

/**
 * Stale heartbeat → offline. If online count hits 0, pause waiting queue entries.
 */
export async function sweepStaleTutorPresence(input?: { now?: Date }) {
  const now = input?.now ?? new Date();
  const policies = await prisma.schoolSupportPolicy.findMany();
  const policyBySchool = new Map(policies.map((p) => [p.schoolId, p]));
  const defaultStale = 75;

  const active = await prisma.tutorPresence.findMany({
    where: { status: { in: ["available", "busy", "paused"] } },
  });

  let markedOffline = 0;
  const schoolsTouched = new Set<string>();

  for (const row of active) {
    const staleAfter = policyBySchool.get(row.schoolId)?.staleAfterSec ?? defaultStale;
    if (isFresh(row.lastHeartbeatAt, staleAfter, now)) continue;

    await prisma.tutorPresence.update({
      where: { id: row.id },
      data: {
        status: "offline",
        availableSince: null,
        pausedAt: null,
        busySince: null,
        activeSessionId: null,
      },
    });
    markedOffline += 1;
    schoolsTouched.add(row.schoolId);

    await writeSchoolAuditLog({
      schoolId: row.schoolId,
      actorSchoolTeacherId: row.schoolTeacherId,
      actorType: "system",
      source: "worker",
      action: "tutor_offline_stale",
      entityType: "teacher",
      entityId: row.schoolTeacherId,
      metadata: { lastHeartbeatAt: row.lastHeartbeatAt.toISOString(), previousStatus: row.status },
      severity: "warning",
    });

    if (row.status === "busy" && row.activeSessionId) {
      await prisma.humanSupportSession.updateMany({
        where: { id: row.activeSessionId, status: "active" },
        data: {
          status: "abandoned",
          outcome: "disconnected",
          endedAt: now,
        },
      });
    }
  }

  let pausedQueue = 0;
  for (const schoolId of schoolsTouched) {
    const policy = policyBySchool.get(schoolId) ?? await getOrCreateSupportPolicy(schoolId);
    const counts = await countOnlineTutors({ schoolId, staleAfterSec: policy.staleAfterSec, now });
    if (counts.onlineTutorCount > 0) continue;
    const result = await prisma.humanSupportQueueEntry.updateMany({
      where: { schoolId, status: "waiting" },
      data: { status: "paused_ai_only" },
    });
    pausedQueue += result.count;
    if (result.count > 0) {
      await writeSchoolAuditLog({
        schoolId,
        actorType: "system",
        source: "worker",
        action: "human_support_queue_paused",
        entityType: "human_support",
        metadata: { reason: "no_online_tutors", pausedCount: result.count },
        severity: "warning",
      });
    }
  }

  return { markedOffline, pausedQueue, schoolsTouched: [...schoolsTouched] };
}
