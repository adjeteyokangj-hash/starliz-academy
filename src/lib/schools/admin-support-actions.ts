/**
 * Admin Support Oversight mutations.
 * Admin never becomes a tutor — no claim/accept/guidance/teach paths.
 */

import { prisma } from "@/lib/db";
import type { HumanSupportOutcome } from "@prisma/client";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import {
  countOnlineTutors,
  getOrCreateSupportPolicy,
} from "@/lib/schools/human-support-presence";
import { mergeAdminFollowUp, type AdminFollowUpStatus } from "@/lib/schools/admin-support-follow-up";

const CLOSEABLE_OUTCOMES: HumanSupportOutcome[] = [
  "disconnected",
  "unresolved",
  "period_ended",
  "escalated",
  "partially_resolved",
];

export async function adminForceTutorOffline(input: {
  schoolId: string;
  schoolTeacherId: string;
  actorUserId: string;
  reason: string;
  closeActiveSession?: boolean;
  now?: Date;
}): Promise<{ ok: true; closedSessionId: string | null } | { ok: false; status: number; error: string }> {
  const reason = input.reason.trim();
  if (reason.length < 5) {
    return { ok: false, status: 400, error: "A reason of at least 5 characters is required." };
  }

  const teacher = await prisma.schoolTeacher.findFirst({
    where: { id: input.schoolTeacherId, schoolId: input.schoolId },
    select: { id: true },
  });
  if (!teacher) {
    return { ok: false, status: 404, error: "Tutor not found in this school." };
  }

  const now = input.now ?? new Date();
  const presence = await prisma.tutorPresence.findUnique({
    where: { schoolTeacherId: input.schoolTeacherId },
  });

  let closedSessionId: string | null = null;
  if (presence?.status === "busy" && presence.activeSessionId) {
    if (!input.closeActiveSession) {
      return {
        ok: false,
        status: 409,
        error: "Tutor has an active session. Confirm closeActiveSession to force offline without orphaning the student.",
      };
    }
    const closed = await adminCloseAbandonedSession({
      schoolId: input.schoolId,
      sessionId: presence.activeSessionId,
      actorUserId: input.actorUserId,
      reason: `Force offline: ${reason}`,
      outcome: "disconnected",
      now,
    });
    if (!closed.ok) return closed;
    closedSessionId = presence.activeSessionId;
  }

  await prisma.tutorPresence.upsert({
    where: { schoolTeacherId: input.schoolTeacherId },
    create: {
      schoolId: input.schoolId,
      schoolTeacherId: input.schoolTeacherId,
      status: "offline",
      lastHeartbeatAt: now,
    },
    update: {
      status: "offline",
      lastHeartbeatAt: now,
      availableSince: null,
      pausedAt: null,
      busySince: null,
      activeSessionId: null,
    },
  });

  await writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    actorAdminUserId: input.actorUserId,
    actorType: "admin_user",
    source: "api",
    action: "human_support_admin_force_offline",
    entityType: "teacher",
    entityId: input.schoolTeacherId,
    severity: "warning",
    metadata: {
      reason,
      previousStatus: presence?.status ?? "offline",
      closedSessionId,
      forcedByAdmin: true,
    },
  });

  const policy = await getOrCreateSupportPolicy(input.schoolId);
  const counts = await countOnlineTutors({
    schoolId: input.schoolId,
    staleAfterSec: policy.staleAfterSec,
    now,
  });
  if (counts.onlineTutorCount === 0) {
    const paused = await prisma.humanSupportQueueEntry.updateMany({
      where: { schoolId: input.schoolId, status: "waiting" },
      data: { status: "paused_ai_only" },
    });
    if (paused.count > 0) {
      await writeSchoolAuditLog({
        schoolId: input.schoolId,
        actorUserId: input.actorUserId,
        actorAdminUserId: input.actorUserId,
        actorType: "admin_user",
        source: "api",
        action: "human_support_queue_paused",
        entityType: "human_support",
        severity: "warning",
        metadata: { reason: "admin_force_offline_no_online_tutors", pausedCount: paused.count },
      });
    }
  }

  return { ok: true, closedSessionId };
}

export async function adminReassignQueueEntry(input: {
  schoolId: string;
  queueEntryId: string;
  actorUserId: string;
  targetSchoolTeacherId: string;
  reason?: string | null;
  now?: Date;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const now = input.now ?? new Date();
  const entry = await prisma.humanSupportQueueEntry.findFirst({
    where: { id: input.queueEntryId, schoolId: input.schoolId },
  });
  if (!entry) {
    return { ok: false, status: 404, error: "Queue entry not found." };
  }
  if (entry.status !== "waiting" && entry.status !== "assigned" && entry.status !== "paused_ai_only") {
    return {
      ok: false,
      status: 409,
      error: "Only waiting or assigned (unaccepted) work can be reassigned. Active sessions are out of scope.",
    };
  }

  const target = await prisma.schoolTeacher.findFirst({
    where: { id: input.targetSchoolTeacherId, schoolId: input.schoolId, status: "active" },
    select: { id: true },
  });
  if (!target) {
    return { ok: false, status: 404, error: "Target tutor not found." };
  }

  const policy = await getOrCreateSupportPolicy(input.schoolId);
  const presence = await prisma.tutorPresence.findUnique({
    where: { schoolTeacherId: input.targetSchoolTeacherId },
  });
  const fresh =
    presence
    && presence.status === "available"
    && (now.getTime() - presence.lastHeartbeatAt.getTime() <= policy.staleAfterSec * 1000);
  if (!fresh) {
    return { ok: false, status: 409, error: "Target tutor must be available with a fresh heartbeat." };
  }

  const concurrent = await prisma.humanSupportSession.count({
    where: {
      schoolId: input.schoolId,
      schoolTeacherId: input.targetSchoolTeacherId,
      status: "active",
    },
  });
  if (concurrent > 0) {
    return { ok: false, status: 409, error: "Target tutor already has an active session." };
  }

  let meta: Record<string, unknown> = {};
  if (entry.metadataJson) {
    try {
      const parsed = JSON.parse(entry.metadataJson);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        meta = { ...(parsed as Record<string, unknown>) };
      }
    } catch {
      meta = {};
    }
  }
  meta.adminReassignedAt = now.toISOString();
  meta.adminReassignedByUserId = input.actorUserId;
  meta.adminReassignReason = input.reason?.trim() || null;
  meta.previousAssignedTutorId = entry.assignedTutorId;

  await prisma.humanSupportQueueEntry.update({
    where: { id: entry.id },
    data: {
      status: "assigned",
      assignedTutorId: input.targetSchoolTeacherId,
      assignedAt: now,
      metadataJson: JSON.stringify(meta),
    },
  });

  await writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    actorAdminUserId: input.actorUserId,
    actorType: "admin_user",
    source: "api",
    action: "human_support_admin_reassign",
    entityType: "human_support",
    entityId: entry.id,
    severity: "warning",
    metadata: {
      childId: entry.childId,
      previousAssignedTutorId: entry.assignedTutorId,
      targetSchoolTeacherId: input.targetSchoolTeacherId,
      reason: input.reason?.trim() || null,
      previousStatus: entry.status,
    },
  });

  return { ok: true };
}

export async function adminCloseAbandonedSession(input: {
  schoolId: string;
  sessionId: string;
  actorUserId: string;
  reason: string;
  outcome?: HumanSupportOutcome;
  now?: Date;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const reason = input.reason.trim();
  if (reason.length < 5) {
    return { ok: false, status: 400, error: "A reason of at least 5 characters is required." };
  }
  const outcome = input.outcome ?? "disconnected";
  if (!CLOSEABLE_OUTCOMES.includes(outcome)) {
    return { ok: false, status: 400, error: "Outcome not allowed for admin close-abandoned." };
  }

  const now = input.now ?? new Date();
  const session = await prisma.humanSupportSession.findFirst({
    where: { id: input.sessionId, schoolId: input.schoolId },
  });
  if (!session) {
    return { ok: false, status: 404, error: "Session not found." };
  }
  if (session.status === "completed" || session.status === "timed_out" || session.status === "handed_over") {
    return { ok: false, status: 409, error: "Completed sessions cannot be reopened or re-closed." };
  }
  if (session.status !== "active" && session.status !== "abandoned") {
    return { ok: false, status: 409, error: "Only active or abandoned sessions can be closed by Admin." };
  }

  await prisma.humanSupportSession.update({
    where: { id: session.id },
    data: {
      status: session.status === "abandoned" ? "abandoned" : "abandoned",
      outcome,
      outcomeNotes: reason.slice(0, 2000),
      endedAt: session.endedAt ?? now,
    },
  });

  await prisma.humanSupportQueueEntry.updateMany({
    where: { id: session.queueEntryId, schoolId: input.schoolId },
    data: { status: "completed" },
  });

  await prisma.tutorPresence.updateMany({
    where: {
      schoolId: input.schoolId,
      schoolTeacherId: session.schoolTeacherId,
      activeSessionId: session.id,
    },
    data: {
      activeSessionId: null,
      status: "offline",
      busySince: null,
      availableSince: null,
      lastHeartbeatAt: now,
    },
  });

  await writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    actorAdminUserId: input.actorUserId,
    actorType: "admin_user",
    source: "api",
    action: "human_support_admin_close_abandoned",
    entityType: "human_support",
    entityId: session.id,
    severity: "warning",
    metadata: {
      childId: session.childId,
      schoolTeacherId: session.schoolTeacherId,
      reason,
      outcome,
      previousStatus: session.status,
    },
  });

  await writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    actorAdminUserId: input.actorUserId,
    actorType: "admin_user",
    source: "api",
    action: "human_support_session_ended",
    entityType: "human_support",
    entityId: session.id,
    severity: "info",
    metadata: {
      childId: session.childId,
      outcome,
      closedByAdmin: true,
    },
  });

  return { ok: true };
}

export async function adminUpdateUnresolvedFollowUp(input: {
  schoolId: string;
  sessionId: string;
  actorUserId: string;
  status: AdminFollowUpStatus;
  ownerUserId?: string | null;
  dueAt?: string | null;
  adminNote?: string | null;
  now?: Date;
}): Promise<{ ok: true; followUp: ReturnType<typeof mergeAdminFollowUp>["followUp"] } | { ok: false; status: number; error: string }> {
  const session = await prisma.humanSupportSession.findFirst({
    where: { id: input.sessionId, schoolId: input.schoolId },
    select: { id: true, childId: true, metadataJson: true, outcome: true },
  });
  if (!session) {
    return { ok: false, status: 404, error: "Session not found." };
  }

  const { metadataJson, followUp } = mergeAdminFollowUp(session.metadataJson, {
    status: input.status,
    ownerUserId: input.ownerUserId,
    dueAt: input.dueAt,
    adminNote: input.adminNote,
    updatedByUserId: input.actorUserId,
    now: input.now,
  });

  await prisma.humanSupportSession.update({
    where: { id: session.id },
    data: { metadataJson },
  });

  await writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    actorAdminUserId: input.actorUserId,
    actorType: "admin_user",
    source: "api",
    action: "human_support_admin_follow_up",
    entityType: "human_support",
    entityId: session.id,
    metadata: {
      childId: session.childId,
      followUp,
      sessionOutcome: session.outcome,
    },
  });

  return { ok: true, followUp };
}

/** Pure guards exported for unit tests. */
export function canAdminReassignQueueStatus(status: string): boolean {
  return status === "waiting" || status === "assigned" || status === "paused_ai_only";
}

export function requiresCloseActiveSessionForForceOffline(input: {
  status: string | null | undefined;
  activeSessionId: string | null | undefined;
}): boolean {
  return input.status === "busy" && Boolean(input.activeSessionId);
}
