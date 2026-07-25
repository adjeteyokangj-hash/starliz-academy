import { prisma } from "@/lib/db";
import type { HumanSupportOutcome, Prisma } from "@prisma/client";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import {
  calculateSessionBudgetMinutes,
  estimateWaitSeconds,
  shouldEnqueueStudent,
  rollingMedian,
} from "@/lib/schools/human-support-timing";
import {
  countOnlineTutors,
  getOrCreateSupportPolicy,
  markTutorAvailableAfterSession,
} from "@/lib/schools/human-support-presence";
import { resolveTutorShiftEligibility } from "@/lib/schools/tutor-support-shifts";
import {
  countShiftEligibleTutorCapacity,
  resolveEscalationQueueDecision,
} from "@/lib/schools/support-eligibility";
import {
  buildSupportContextSnapshot,
  emptySessionNotes,
  parseSessionMetadata,
  serializeSessionMetadata,
  validateUnresolvedReport,
  type SnapshotBuildInput,
  type SessionNotesState,
  type SupportContextSnapshot,
} from "@/lib/schools/human-support-session";

type Tx = Prisma.TransactionClient;

export async function syncEligibleStudentQueue(input: {
  schoolId: string;
  periodId: string;
  classroomId: string | null;
  minutesUntilPeriodEnd: number;
  eligibleStudents: Array<{
    childId: string;
    humanTutorEligible: boolean;
    assignmentId: string | null;
    questionKey: string | null;
  }>;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const policy = await getOrCreateSupportPolicy(input.schoolId);
  const [counts, capacity] = await Promise.all([
    countOnlineTutors({
      schoolId: input.schoolId,
      staleAfterSec: policy.staleAfterSec,
      now,
    }),
    countShiftEligibleTutorCapacity({ schoolId: input.schoolId, now }),
  ]);

  if (counts.onlineTutorCount === 0) {
    const paused = await prisma.humanSupportQueueEntry.updateMany({
      where: {
        schoolId: input.schoolId,
        periodId: input.periodId,
        status: "waiting",
      },
      data: { status: "paused_ai_only" },
    });
    return { counts, enqueued: 0, paused: paused.count, resumed: 0, budgetMinutes: 0 };
  }

  const eligibleCount = input.eligibleStudents.filter((s) => s.humanTutorEligible).length;
  const budgetMinutes = calculateSessionBudgetMinutes({
    minutesUntilPeriodEnd: input.minutesUntilPeriodEnd,
    eligibleStudentCount: Math.max(eligibleCount, 1),
    onlineTutorCount: counts.onlineTutorCount,
    policy,
  });

  const eligibleIds = new Set(
    input.eligibleStudents.filter((s) => s.humanTutorEligible).map((s) => s.childId),
  );
  const pausedRows = await prisma.humanSupportQueueEntry.findMany({
    where: {
      schoolId: input.schoolId,
      periodId: input.periodId,
      status: "paused_ai_only",
    },
  });
  let resumed = 0;
  for (const row of pausedRows) {
    if (!eligibleIds.has(row.childId)) {
      await prisma.humanSupportQueueEntry.update({
        where: { id: row.id },
        data: { status: "recovered" },
      });
      continue;
    }
    await prisma.humanSupportQueueEntry.update({
      where: { id: row.id },
      data: {
        status: "waiting",
        budgetMinutes,
        estimatedWaitSec: null,
      },
    });
    resumed += 1;
  }
  if (resumed > 0) {
    await writeSchoolAuditLog({
      schoolId: input.schoolId,
      actorType: "system",
      source: "api",
      action: "human_support_queue_resumed",
      entityType: "human_support",
      entityId: input.periodId,
      metadata: { resumed, periodId: input.periodId },
    });
  }

  let enqueued = 0;
  const waiting = await prisma.humanSupportQueueEntry.findMany({
    where: {
      schoolId: input.schoolId,
      periodId: input.periodId,
      status: "waiting",
    },
    orderBy: { enqueuedAt: "asc" },
  });

  for (const student of input.eligibleStudents) {
    if (!student.humanTutorEligible) {
      await prisma.humanSupportQueueEntry.updateMany({
        where: {
          schoolId: input.schoolId,
          periodId: input.periodId,
          childId: student.childId,
          status: { in: ["waiting", "paused_ai_only"] },
        },
        data: { status: "recovered" },
      });
      continue;
    }

    const existingOpen = await prisma.humanSupportQueueEntry.findFirst({
      where: {
        schoolId: input.schoolId,
        periodId: input.periodId,
        childId: student.childId,
        status: { in: ["waiting", "assigned", "in_session"] },
      },
    });
    if (existingOpen) continue;

    const queueDecision = resolveEscalationQueueDecision({
      student: {
        humanTutorEligible: student.humanTutorEligible,
        continueAi: !student.humanTutorEligible,
        reason: student.humanTutorEligible
          ? "Student eligible for human support."
          : "Student not human-tutor eligible.",
      },
      capacity,
    });
    if (
      !shouldEnqueueStudent({
        humanTutorEligible: student.humanTutorEligible,
        acceptReadyTutorCount: capacity.acceptReadyTutorCount,
      })
      || !queueDecision.shouldEnqueue
    ) {
      if (student.humanTutorEligible && queueDecision.unmetEscalation) {
        await writeSchoolAuditLog({
          schoolId: input.schoolId,
          actorType: "system",
          source: "api",
          action: "human_support_eligible",
          entityType: "student",
          entityId: student.childId,
          metadata: {
            periodId: input.periodId,
            queued: false,
            continueAi: true,
            unmetEscalation: true,
            reason: queueDecision.reason,
            acceptReadyTutorCount: capacity.acceptReadyTutorCount,
          },
        });
      }
      continue;
    }

    const waitingAhead = waiting.length + enqueued;
    const estimatedWaitSec = estimateWaitSeconds({
      waitingAhead,
      onlineTutorCount: counts.onlineTutorCount,
      sessionBudgetMinutes: budgetMinutes,
      minutesUntilPeriodEnd: input.minutesUntilPeriodEnd,
    });

    await prisma.humanSupportQueueEntry.create({
      data: {
        schoolId: input.schoolId,
        childId: student.childId,
        classroomId: input.classroomId,
        periodId: input.periodId,
        assignmentId: student.assignmentId,
        questionKey: student.questionKey,
        status: "waiting",
        expiresAt: new Date(now.getTime() + input.minutesUntilPeriodEnd * 60_000),
        estimatedWaitSec,
        budgetMinutes,
      },
    });
    enqueued += 1;

    await writeSchoolAuditLog({
      schoolId: input.schoolId,
      actorType: "system",
      source: "api",
      action: "human_support_enqueued",
      entityType: "student",
      entityId: student.childId,
      metadata: {
        periodId: input.periodId,
        estimatedWaitSec,
        budgetMinutes,
      },
    });
    await writeSchoolAuditLog({
      schoolId: input.schoolId,
      actorType: "system",
      source: "api",
      action: "human_support_eligible",
      entityType: "student",
      entityId: student.childId,
      metadata: { periodId: input.periodId, queued: true },
    });
  }

  return { counts, enqueued, paused: 0, resumed, budgetMinutes };
}

/**
 * ASSIGNMENT only — does not create a session or mark the tutor busy.
 * Tutor must ACCEPT separately to freeze snapshot and start the timed session.
 */
export async function assignHumanSupportStudent(input: {
  schoolId: string;
  schoolTeacherId: string;
  actorUserId: string;
  periodId: string;
  childId: string;
  classroomId: string | null;
  assignmentId: string | null;
  questionKey: string | null;
  minutesUntilPeriodEnd: number;
  eligibleStudentCount: number;
  /** AI-first gate — caller must prove eligibility. */
  humanTutorEligible: boolean;
  priorSessionId?: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (!input.humanTutorEligible) {
    return {
      ok: false as const,
      status: 403,
      error: "Join as human tutor is only available when AI support is exhausted and the student has not recovered.",
    };
  }

  const policy = await getOrCreateSupportPolicy(input.schoolId);
  const counts = await countOnlineTutors({
    schoolId: input.schoolId,
    staleAfterSec: policy.staleAfterSec,
    now,
  });
  if (counts.onlineTutorCount === 0) {
    return {
      ok: false as const,
      status: 409,
      error: "No tutors online — student remains on AI-only support.",
    };
  }

  const presence = await prisma.tutorPresence.findUnique({
    where: { schoolTeacherId: input.schoolTeacherId },
  });
  if (!presence || presence.status === "offline") {
    return {
      ok: false as const,
      status: 409,
      error: "Open Live Classroom to become available before claiming an assignment.",
    };
  }
  if (presence.status === "busy") {
    return {
      ok: false as const,
      status: 409,
      error: "You already have an active human support session.",
    };
  }

  const shiftEligibility = await resolveTutorShiftEligibility({
    schoolId: input.schoolId,
    schoolTeacherId: input.schoolTeacherId,
    presenceStatus: presence.status,
    lastHeartbeatAt: presence.lastHeartbeatAt,
    hasActiveSupportSession: Boolean(presence.activeSessionId),
    now,
  });
  if (!shiftEligibility.canAcceptStudent) {
    return {
      ok: false as const,
      status: 403,
      error: shiftEligibility.reason || "You can only accept students while on an active published support shift.",
    };
  }

  const activeForStudent = await prisma.humanSupportSession.findFirst({
    where: {
      schoolId: input.schoolId,
      childId: input.childId,
      status: "active",
    },
  });
  if (activeForStudent) {
    return {
      ok: false as const,
      status: 409,
      error: "Student already has an active human support session.",
      sessionId: activeForStudent.id,
    };
  }

  const existingAssigned = await prisma.humanSupportQueueEntry.findFirst({
    where: {
      schoolId: input.schoolId,
      periodId: input.periodId,
      childId: input.childId,
      status: "assigned",
    },
  });
  if (existingAssigned && existingAssigned.assignedTutorId && existingAssigned.assignedTutorId !== input.schoolTeacherId) {
    return {
      ok: false as const,
      status: 409,
      error: "Another tutor already holds this assignment.",
      queueEntryId: existingAssigned.id,
    };
  }
  if (existingAssigned && existingAssigned.assignedTutorId === input.schoolTeacherId) {
    return {
      ok: true as const,
      alreadyAssigned: true as const,
      queueEntryId: existingAssigned.id,
      childId: input.childId,
      budgetMinutesEstimate: existingAssigned.budgetMinutes,
    };
  }

  const inSession = await prisma.humanSupportQueueEntry.findFirst({
    where: {
      schoolId: input.schoolId,
      periodId: input.periodId,
      childId: input.childId,
      status: "in_session",
    },
  });
  if (inSession) {
    return {
      ok: false as const,
      status: 409,
      error: "Student is already in a human support session.",
    };
  }

  const budgetMinutes = calculateSessionBudgetMinutes({
    minutesUntilPeriodEnd: input.minutesUntilPeriodEnd,
    eligibleStudentCount: Math.max(input.eligibleStudentCount, 1),
    onlineTutorCount: Math.max(counts.onlineTutorCount, 1),
    policy,
    expectedTutorMinutes: presence.rollingMedianMinutes,
  });

  let queueEntry = await prisma.humanSupportQueueEntry.findFirst({
    where: {
      schoolId: input.schoolId,
      periodId: input.periodId,
      childId: input.childId,
      status: { in: ["waiting", "paused_ai_only"] },
    },
    orderBy: { enqueuedAt: "asc" },
  });

  const metadataJson = input.priorSessionId
    ? JSON.stringify({ priorSessionId: input.priorSessionId, assignedAt: now.toISOString() })
    : null;

  if (!queueEntry) {
    queueEntry = await prisma.humanSupportQueueEntry.create({
      data: {
        schoolId: input.schoolId,
        childId: input.childId,
        classroomId: input.classroomId,
        periodId: input.periodId,
        assignmentId: input.assignmentId,
        questionKey: input.questionKey,
        status: "assigned",
        assignedAt: now,
        assignedTutorId: input.schoolTeacherId,
        budgetMinutes,
        expiresAt: new Date(now.getTime() + input.minutesUntilPeriodEnd * 60_000),
        metadataJson,
      },
    });
  } else {
    queueEntry = await prisma.humanSupportQueueEntry.update({
      where: { id: queueEntry.id },
      data: {
        status: "assigned",
        assignedAt: now,
        assignedTutorId: input.schoolTeacherId,
        budgetMinutes,
        assignmentId: input.assignmentId ?? queueEntry.assignmentId,
        questionKey: input.questionKey ?? queueEntry.questionKey,
        metadataJson: metadataJson ?? queueEntry.metadataJson,
      },
    });
  }

  await writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    actorSchoolTeacherId: input.schoolTeacherId,
    actorType: "school_staff",
    source: "api",
    action: "human_support_assigned",
    entityType: "human_support",
    entityId: queueEntry.id,
    metadata: {
      childId: input.childId,
      periodId: input.periodId,
      schoolTeacherId: input.schoolTeacherId,
      budgetMinutesEstimate: budgetMinutes,
      priorSessionId: input.priorSessionId ?? null,
      note: "Assignment created — tutor must accept to start session.",
    },
  });

  return {
    ok: true as const,
    alreadyAssigned: false as const,
    queueEntryId: queueEntry.id,
    childId: input.childId,
    budgetMinutesEstimate: budgetMinutes,
  };
}

/**
 * RELEASE / DECLINE — tutor returns an assigned (not yet accepted) entry to waiting.
 * Does not create or end sessions. Does not invent queue language for students.
 */
export async function releaseHumanSupportAssignment(input: {
  schoolId: string;
  schoolTeacherId: string;
  actorUserId: string;
  queueEntryId: string;
  reason?: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const entry = await prisma.humanSupportQueueEntry.findFirst({
    where: {
      id: input.queueEntryId,
      schoolId: input.schoolId,
    },
  });
  if (!entry) {
    return { ok: false as const, status: 404, error: "Assignment not found." };
  }
  if (entry.status !== "assigned") {
    return {
      ok: false as const,
      status: 409,
      error: "Only claimed (not yet accepted) assignments can be released.",
    };
  }
  if (entry.assignedTutorId !== input.schoolTeacherId) {
    return {
      ok: false as const,
      status: 403,
      error: "You can only release your own assignment.",
    };
  }

  const updated = await prisma.humanSupportQueueEntry.update({
    where: { id: entry.id },
    data: {
      status: "waiting",
      assignedAt: null,
      assignedTutorId: null,
      metadataJson: JSON.stringify({
        ...(safeJsonObject(entry.metadataJson) ?? {}),
        releasedAt: now.toISOString(),
        releasedBySchoolTeacherId: input.schoolTeacherId,
        releaseReason: input.reason?.trim() || null,
      }),
    },
  });

  await writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    actorSchoolTeacherId: input.schoolTeacherId,
    actorType: "school_staff",
    source: "api",
    action: "human_support_released",
    entityType: "human_support",
    entityId: updated.id,
    metadata: {
      childId: updated.childId,
      periodId: updated.periodId,
      reason: input.reason?.trim() || null,
    },
  });

  return {
    ok: true as const,
    queueEntryId: updated.id,
    childId: updated.childId,
    periodId: updated.periodId,
  };
}

function safeJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function assertNoConcurrentActive(tx: Tx, input: {
  schoolId: string;
  schoolTeacherId: string;
  childId: string;
}) {
  const tutorBusy = await tx.humanSupportSession.findFirst({
    where: {
      schoolId: input.schoolId,
      schoolTeacherId: input.schoolTeacherId,
      status: "active",
    },
    select: { id: true },
  });
  if (tutorBusy) {
    return { ok: false as const, error: "You already have an active human support session.", sessionId: tutorBusy.id };
  }
  const studentBusy = await tx.humanSupportSession.findFirst({
    where: {
      schoolId: input.schoolId,
      childId: input.childId,
      status: "active",
    },
    select: { id: true },
  });
  if (studentBusy) {
    return { ok: false as const, error: "Student already has an active human support session.", sessionId: studentBusy.id };
  }
  return { ok: true as const };
}

/**
 * ACCEPTANCE — freezes budget + immutable snapshot, marks tutor busy, session ACTIVE.
 * Must run in a transaction with concurrency guards.
 */
export async function acceptHumanSupportAssignment(input: {
  schoolId: string;
  schoolTeacherId: string;
  actorUserId: string;
  queueEntryId?: string | null;
  childId?: string | null;
  periodId: string;
  minutesUntilPeriodEnd: number;
  eligibleStudentCount: number;
  /** AI-first gate re-checked at accept. */
  humanTutorEligible: boolean;
  snapshotInput: Omit<SnapshotBuildInput, "budgetMinutes" | "plannedEndsAt" | "acceptedAt" | "minutesRemainingAtAccept"> & {
    minutesRemainingAtAccept?: number;
  };
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (!input.humanTutorEligible) {
    return {
      ok: false as const,
      status: 403,
      error: "Cannot accept — student is no longer human-tutor eligible (AI-first gate).",
    };
  }

  const policy = await getOrCreateSupportPolicy(input.schoolId);
  const countsPreview = await countOnlineTutors({
    schoolId: input.schoolId,
    staleAfterSec: policy.staleAfterSec,
    now,
  });
  if (countsPreview.onlineTutorCount === 0) {
    return {
      ok: false as const,
      status: 409,
      error: "No tutors online — student remains on AI-only support.",
    };
  }

  const prePresence = await prisma.tutorPresence.findUnique({
    where: { schoolTeacherId: input.schoolTeacherId },
  });
  const shiftEligibility = await resolveTutorShiftEligibility({
    schoolId: input.schoolId,
    schoolTeacherId: input.schoolTeacherId,
    presenceStatus: prePresence?.status ?? "offline",
    lastHeartbeatAt: prePresence?.lastHeartbeatAt ?? null,
    hasActiveSupportSession: Boolean(prePresence?.activeSessionId),
    now,
  });
  if (!shiftEligibility.canAcceptStudent) {
    return {
      ok: false as const,
      status: 403,
      error: shiftEligibility.reason || "You can only accept students while on an active published support shift.",
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const presence = await tx.tutorPresence.findUnique({
        where: { schoolTeacherId: input.schoolTeacherId },
      });
      if (!presence || presence.status === "offline") {
        throw Object.assign(new Error("Open Live Classroom before accepting."), { status: 409 });
      }
      if (presence.status === "busy") {
        throw Object.assign(new Error("You already have an active human support session."), { status: 409 });
      }

      const queueEntry = input.queueEntryId
        ? await tx.humanSupportQueueEntry.findUnique({ where: { id: input.queueEntryId } })
        : await tx.humanSupportQueueEntry.findFirst({
            where: {
              schoolId: input.schoolId,
              periodId: input.periodId,
              childId: input.childId ?? undefined,
              status: "assigned",
              assignedTutorId: input.schoolTeacherId,
            },
            orderBy: { assignedAt: "desc" },
          });

      if (!queueEntry || queueEntry.schoolId !== input.schoolId) {
        throw Object.assign(new Error("Assignment not found."), { status: 404 });
      }
      if (queueEntry.status === "in_session") {
        const existing = await tx.humanSupportSession.findUnique({
          where: { queueEntryId: queueEntry.id },
        });
        if (existing?.status === "active" && existing.schoolTeacherId === input.schoolTeacherId) {
          return { idempotent: true as const, session: existing, queueEntry, snapshot: null as SupportContextSnapshot | null };
        }
        throw Object.assign(new Error("Assignment already in session."), { status: 409 });
      }
      if (queueEntry.status !== "assigned") {
        throw Object.assign(new Error("Assignment is not awaiting acceptance."), { status: 409 });
      }
      if (queueEntry.assignedTutorId && queueEntry.assignedTutorId !== input.schoolTeacherId) {
        throw Object.assign(new Error("This assignment belongs to another tutor."), { status: 403 });
      }

      const concurrency = await assertNoConcurrentActive(tx, {
        schoolId: input.schoolId,
        schoolTeacherId: input.schoolTeacherId,
        childId: queueEntry.childId,
      });
      if (!concurrency.ok) {
        throw Object.assign(new Error(concurrency.error), { status: 409, sessionId: concurrency.sessionId });
      }

      const budgetMinutes = calculateSessionBudgetMinutes({
        minutesUntilPeriodEnd: input.minutesUntilPeriodEnd,
        eligibleStudentCount: Math.max(input.eligibleStudentCount, 1),
        onlineTutorCount: Math.max(countsPreview.onlineTutorCount, 1),
        policy,
        expectedTutorMinutes: presence.rollingMedianMinutes,
      });
      const plannedEndsAt = new Date(now.getTime() + budgetMinutes * 60_000);
      const acceptedAt = now.toISOString();
      const snapshot = buildSupportContextSnapshot({
        ...input.snapshotInput,
        schoolId: input.schoolId,
        dayLessonId: input.periodId,
        minutesRemainingAtAccept: input.snapshotInput.minutesRemainingAtAccept ?? input.minutesUntilPeriodEnd,
        budgetMinutes,
        plannedEndsAt: plannedEndsAt.toISOString(),
        acceptedAt,
      });

      const claimed = await tx.humanSupportQueueEntry.updateMany({
        where: {
          id: queueEntry.id,
          status: "assigned",
          OR: [
            { assignedTutorId: input.schoolTeacherId },
            { assignedTutorId: null },
          ],
        },
        data: {
          status: "in_session",
          assignedTutorId: input.schoolTeacherId,
          assignedAt: queueEntry.assignedAt ?? now,
          budgetMinutes,
        },
      });
      if (claimed.count !== 1) {
        throw Object.assign(new Error("Could not claim assignment (concurrent accept)."), { status: 409 });
      }

      const meta = serializeSessionMetadata({
        metaVersion: 1,
        supportContextSnapshot: snapshot,
        sessionNotes: emptySessionNotes(),
        guidanceMessages: [],
        returnAction: "resume_current",
        priorSessionId: (() => {
          try {
            const qMeta = queueEntry.metadataJson ? JSON.parse(queueEntry.metadataJson) as { priorSessionId?: string } : null;
            return qMeta?.priorSessionId ?? null;
          } catch {
            return null;
          }
        })(),
      });

      const session = await tx.humanSupportSession.create({
        data: {
          schoolId: input.schoolId,
          queueEntryId: queueEntry.id,
          schoolTeacherId: input.schoolTeacherId,
          childId: queueEntry.childId,
          periodId: input.periodId,
          budgetMinutes,
          plannedEndsAt,
          status: "active",
          metadataJson: meta,
        },
      });

      const busy = await tx.tutorPresence.updateMany({
        where: {
          schoolTeacherId: input.schoolTeacherId,
          status: { in: ["available", "paused"] },
        },
        data: {
          status: "busy",
          busySince: now,
          activeSessionId: session.id,
          lastHeartbeatAt: now,
          availableSince: null,
          pausedAt: null,
        },
      });
      if (busy.count !== 1) {
        throw Object.assign(new Error("Tutor presence could not move to busy (already busy/offline)."), { status: 409 });
      }

      return { idempotent: false as const, session, queueEntry, snapshot };
    }, {
      // ReadCommitted + conditional updateMany claims work on Supabase poolers;
      // Serializable interactive txs often hang/fail under transaction pooling.
      isolationLevel: "ReadCommitted",
      maxWait: 5_000,
      timeout: 15_000,
    });

    if (!result.idempotent) {
      await writeSchoolAuditLog({
        schoolId: input.schoolId,
        actorUserId: input.actorUserId,
        actorSchoolTeacherId: input.schoolTeacherId,
        actorType: "school_staff",
        source: "api",
        action: "human_support_accepted",
        entityType: "human_support",
        entityId: result.queueEntry.id,
        metadata: {
          sessionId: result.session.id,
          childId: result.session.childId,
          budgetMinutes: result.session.budgetMinutes,
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
        entityId: result.session.id,
        metadata: { schoolTeacherId: input.schoolTeacherId, sessionId: result.session.id },
      });
      await writeSchoolAuditLog({
        schoolId: input.schoolId,
        actorUserId: input.actorUserId,
        actorSchoolTeacherId: input.schoolTeacherId,
        actorType: "school_staff",
        source: "api",
        action: "human_support_session_started",
        entityType: "human_support",
        entityId: result.session.id,
        metadata: {
          childId: result.session.childId,
          periodId: input.periodId,
          queueEntryId: result.queueEntry.id,
          budgetMinutes: result.session.budgetMinutes,
          plannedEndsAt: result.session.plannedEndsAt?.toISOString() ?? null,
          snapshotAcceptedAt: result.snapshot?.acceptedAt ?? null,
          note: "Session budget and supportContextSnapshot frozen at accept.",
        },
        severity: "warning",
      });
    }

    return {
      ok: true as const,
      idempotent: result.idempotent,
      session: {
        id: result.session.id,
        budgetMinutes: result.session.budgetMinutes,
        plannedEndsAt: result.session.plannedEndsAt?.toISOString() ?? null,
        startedAt: result.session.startedAt.toISOString(),
        childId: result.session.childId,
        periodId: result.session.periodId,
        queueEntryId: result.queueEntry.id,
      },
      snapshot: result.snapshot ?? parseSessionMetadata(result.session.metadataJson).supportContextSnapshot,
      queueEntryId: result.queueEntry.id,
    };
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error
      ? Number((error as { status?: number }).status) || 500
      : 500;
    const message = error instanceof Error ? error.message : "Unable to accept assignment.";
    if (String(message).includes("could not serialize") || String(message).includes("write conflict")) {
      return {
        ok: false as const,
        status: 409,
        error: "Concurrent accept conflict — retry once.",
      };
    }
    return { ok: false as const, status, error: message };
  }
}

export async function updateHumanSupportSessionNotes(input: {
  schoolId: string;
  schoolTeacherId: string;
  sessionId: string;
  notes: Partial<SessionNotesState>;
}) {
  const session = await prisma.humanSupportSession.findUnique({ where: { id: input.sessionId } });
  if (!session || session.schoolId !== input.schoolId) {
    return { ok: false as const, status: 404, error: "Session not found." };
  }
  if (session.schoolTeacherId !== input.schoolTeacherId) {
    return { ok: false as const, status: 403, error: "Not your session." };
  }
  if (session.status !== "active") {
    return { ok: false as const, status: 409, error: "Session is not active." };
  }
  const meta = parseSessionMetadata(session.metadataJson);
  meta.sessionNotes = {
    privateNotes: typeof input.notes.privateNotes === "string"
      ? input.notes.privateNotes.slice(0, 4000)
      : meta.sessionNotes.privateNotes,
    misconception: typeof input.notes.misconception === "string"
      ? input.notes.misconception.slice(0, 1000)
      : meta.sessionNotes.misconception,
    actionsTaken: Array.isArray(input.notes.actionsTaken)
      ? input.notes.actionsTaken.map((item) => String(item).slice(0, 200)).slice(0, 20)
      : meta.sessionNotes.actionsTaken,
    followUpNeeded: typeof input.notes.followUpNeeded === "boolean"
      ? input.notes.followUpNeeded
      : meta.sessionNotes.followUpNeeded,
  };
  // Never overwrite snapshot.
  await prisma.humanSupportSession.update({
    where: { id: session.id },
    data: { metadataJson: serializeSessionMetadata(meta) },
  });
  return { ok: true as const, notes: meta.sessionNotes };
}

export async function sendHumanSupportGuidance(input: {
  schoolId: string;
  schoolTeacherId: string;
  sessionId: string;
  text: string;
}) {
  const text = input.text.trim().slice(0, 280);
  if (text.length < 2) {
    return { ok: false as const, status: 400, error: "Guidance text is required." };
  }
  const session = await prisma.humanSupportSession.findUnique({ where: { id: input.sessionId } });
  if (!session || session.schoolId !== input.schoolId) {
    return { ok: false as const, status: 404, error: "Session not found." };
  }
  if (session.schoolTeacherId !== input.schoolTeacherId) {
    return { ok: false as const, status: 403, error: "Not your session." };
  }
  if (session.status !== "active") {
    return { ok: false as const, status: 409, error: "Session is not active." };
  }
  const meta = parseSessionMetadata(session.metadataJson);
  const message = {
    id: `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    text,
    createdAt: new Date().toISOString(),
    authorTeacherId: input.schoolTeacherId,
  };
  // Deduplicate identical guidance within 30s
  const last = meta.guidanceMessages[meta.guidanceMessages.length - 1];
  if (last && last.text === text && Date.now() - Date.parse(last.createdAt) < 30_000) {
    return { ok: true as const, message: last, deduped: true as const };
  }
  meta.guidanceMessages = [...meta.guidanceMessages, message].slice(-20);
  await prisma.humanSupportSession.update({
    where: { id: session.id },
    data: { metadataJson: serializeSessionMetadata(meta) },
  });
  await writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorSchoolTeacherId: input.schoolTeacherId,
    actorType: "school_staff",
    source: "api",
    action: "human_support_guidance_sent",
    entityType: "human_support",
    entityId: session.id,
    metadata: { guidanceId: message.id, childId: session.childId },
  });
  return { ok: true as const, message, deduped: false as const };
}

export async function endHumanSupportSession(input: {
  schoolId: string;
  schoolTeacherId: string;
  actorUserId: string;
  sessionId: string;
  outcome: HumanSupportOutcome;
  outcomeNotes?: string | null;
  unresolvedReport?: unknown;
  sessionNotes?: Partial<SessionNotesState> | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const session = await prisma.humanSupportSession.findUnique({
    where: { id: input.sessionId },
  });
  if (!session || session.schoolId !== input.schoolId) {
    return { ok: false as const, status: 404, error: "Session not found." };
  }
  if (session.schoolTeacherId !== input.schoolTeacherId) {
    return { ok: false as const, status: 403, error: "Not your session." };
  }
  if (session.status !== "active") {
    return { ok: false as const, status: 409, error: "Session is not active." };
  }

  let unresolvedReportJson: string | null = null;
  if (input.outcome === "unresolved") {
    const validated = validateUnresolvedReport(input.unresolvedReport);
    if (!validated.ok) {
      return { ok: false as const, status: 400, error: validated.error };
    }
    unresolvedReportJson = JSON.stringify(validated.report);
  }

  const meta = parseSessionMetadata(session.metadataJson);
  if (input.sessionNotes) {
    meta.sessionNotes = {
      privateNotes: typeof input.sessionNotes.privateNotes === "string"
        ? input.sessionNotes.privateNotes.slice(0, 4000)
        : meta.sessionNotes.privateNotes,
      misconception: typeof input.sessionNotes.misconception === "string"
        ? input.sessionNotes.misconception.slice(0, 1000)
        : meta.sessionNotes.misconception,
      actionsTaken: Array.isArray(input.sessionNotes.actionsTaken)
        ? input.sessionNotes.actionsTaken.map((item) => String(item).slice(0, 200)).slice(0, 20)
        : meta.sessionNotes.actionsTaken,
      followUpNeeded: typeof input.sessionNotes.followUpNeeded === "boolean"
        ? input.sessionNotes.followUpNeeded
        : meta.sessionNotes.followUpNeeded,
    };
  }

  const durationMin = (now.getTime() - session.startedAt.getTime()) / 60_000;
  const exceededBudget = Boolean(
    session.plannedEndsAt && now.getTime() > session.plannedEndsAt.getTime(),
  );

  await prisma.humanSupportSession.update({
    where: { id: session.id },
    data: {
      status: "completed",
      endedAt: now,
      outcome: input.outcome,
      outcomeNotes: input.outcomeNotes ?? null,
      unresolvedReportJson,
      exceededBudget,
      metadataJson: serializeSessionMetadata(meta),
    },
  });

  await prisma.humanSupportQueueEntry.update({
    where: { id: session.queueEntryId },
    data: { status: "completed" },
  });

  await markTutorAvailableAfterSession({
    schoolId: input.schoolId,
    schoolTeacherId: input.schoolTeacherId,
    actorUserId: input.actorUserId,
    now,
  });

  const recent = await prisma.humanSupportSession.findMany({
    where: {
      schoolTeacherId: input.schoolTeacherId,
      status: "completed",
      endedAt: { not: null },
    },
    orderBy: { endedAt: "desc" },
    take: 20,
    select: { startedAt: true, endedAt: true, outcome: true },
  });
  const durations = recent
    .filter((row) => row.endedAt)
    .map((row) => (row.endedAt!.getTime() - row.startedAt.getTime()) / 60_000);
  const median = rollingMedian(durations);
  const resolvedCount = recent.filter(
    (row) => row.outcome === "resolved" || row.outcome === "student_recovered",
  ).length;
  const resolutionRate = recent.length ? resolvedCount / recent.length : null;

  await prisma.tutorPresence.update({
    where: { schoolTeacherId: input.schoolTeacherId },
    data: {
      rollingMedianMinutes: median,
      sessionsCompleted: { increment: 1 },
      resolutionRate,
    },
  });

  await writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    actorSchoolTeacherId: input.schoolTeacherId,
    actorType: "school_staff",
    source: "api",
    action: "human_support_session_ended",
    entityType: "human_support",
    entityId: session.id,
    metadata: {
      outcome: input.outcome,
      durationMinutes: Math.round(durationMin * 10) / 10,
      budgetMinutes: session.budgetMinutes,
      exceededBudget,
      childId: session.childId,
      returnAction: "resume_current",
    },
    severity: input.outcome === "unresolved" || input.outcome === "escalated" ? "warning" : "info",
  });

  if (input.outcome === "unresolved") {
    await writeSchoolAuditLog({
      schoolId: input.schoolId,
      actorUserId: input.actorUserId,
      actorSchoolTeacherId: input.schoolTeacherId,
      actorType: "school_staff",
      source: "api",
      action: "human_support_unresolved",
      entityType: "human_support",
      entityId: session.id,
      metadata: {
        childId: session.childId,
        periodId: session.periodId,
        report: unresolvedReportJson ? JSON.parse(unresolvedReportJson) : null,
      },
      severity: "warning",
    });
  }

  // Escalation: only re-queue when on-shift tutor capacity exists; otherwise continue AI.
  let escalatedQueueEntryId: string | null = null;
  if (input.outcome === "escalated" && session.periodId) {
    const capacity = await countShiftEligibleTutorCapacity({
      schoolId: input.schoolId,
      now,
    });
    if (capacity.hasEligibleCapacity) {
      const queue = await prisma.humanSupportQueueEntry.create({
        data: {
          schoolId: input.schoolId,
          childId: session.childId,
          classroomId: meta.supportContextSnapshot?.classroomId ?? null,
          periodId: session.periodId,
          assignmentId: meta.supportContextSnapshot?.assignmentId ?? null,
          questionKey: meta.supportContextSnapshot?.questionKey ?? null,
          status: "waiting",
          priority: 10,
          budgetMinutes: session.budgetMinutes,
          expiresAt: session.plannedEndsAt ?? new Date(now.getTime() + 15 * 60_000),
          metadataJson: JSON.stringify({
            priorSessionId: session.id,
            escalatedAt: now.toISOString(),
            preservedSnapshot: true,
          }),
        },
      });
      escalatedQueueEntryId = queue.id;
    } else {
      await writeSchoolAuditLog({
        schoolId: input.schoolId,
        actorUserId: input.actorUserId,
        actorSchoolTeacherId: input.schoolTeacherId,
        actorType: "school_staff",
        source: "api",
        action: "human_support_eligible",
        entityType: "student",
        entityId: session.childId,
        metadata: {
          periodId: session.periodId,
          priorSessionId: session.id,
          queued: false,
          continueAi: true,
          unmetEscalation: true,
          acceptReadyTutorCount: capacity.acceptReadyTutorCount,
        },
      });
    }
  }

  // Auto-ASSIGN (not accept) next waiting student to this freed tutor.
  let nextAssigned: { childId: string; queueEntryId: string } | null = null;
  if (session.periodId && input.outcome !== "period_ended") {
    const next = await prisma.humanSupportQueueEntry.findFirst({
      where: {
        schoolId: input.schoolId,
        periodId: session.periodId,
        status: "waiting",
      },
      orderBy: [{ priority: "desc" }, { enqueuedAt: "asc" }],
    });
    if (next) {
      const minutesLeft = next.expiresAt
        ? Math.max(1, Math.ceil((next.expiresAt.getTime() - now.getTime()) / 60_000))
        : 15;
      const assigned = await assignHumanSupportStudent({
        schoolId: input.schoolId,
        schoolTeacherId: input.schoolTeacherId,
        actorUserId: input.actorUserId,
        periodId: session.periodId,
        childId: next.childId,
        classroomId: next.classroomId,
        assignmentId: next.assignmentId,
        questionKey: next.questionKey,
        minutesUntilPeriodEnd: minutesLeft,
        eligibleStudentCount: 1,
        humanTutorEligible: true,
        now,
      });
      if (assigned.ok) {
        nextAssigned = { childId: next.childId, queueEntryId: assigned.queueEntryId };
      }
    }
  }

  return {
    ok: true as const,
    durationMinutes: durationMin,
    exceededBudget,
    nextAssigned,
    escalatedQueueEntryId,
    returnAction: "resume_current" as const,
  };
}

export async function closeHumanSupportForPeriodEnd(input: {
  schoolId: string;
  periodId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();

  const expired = await prisma.humanSupportQueueEntry.updateMany({
    where: {
      schoolId: input.schoolId,
      periodId: input.periodId,
      status: { in: ["waiting", "paused_ai_only", "assigned"] },
    },
    data: { status: "expired" },
  });

  const active = await prisma.humanSupportSession.findMany({
    where: {
      schoolId: input.schoolId,
      periodId: input.periodId,
      status: "active",
    },
  });

  for (const session of active) {
    await prisma.humanSupportSession.update({
      where: { id: session.id },
      data: {
        status: "completed",
        outcome: "period_ended",
        endedAt: now,
      },
    });
    await prisma.humanSupportQueueEntry.updateMany({
      where: { id: session.queueEntryId },
      data: { status: "expired" },
    });
    await markTutorAvailableAfterSession({
      schoolId: input.schoolId,
      schoolTeacherId: session.schoolTeacherId,
      now,
    });
    await writeSchoolAuditLog({
      schoolId: input.schoolId,
      actorType: "system",
      source: "worker",
      action: "human_support_session_ended",
      entityType: "human_support",
      entityId: session.id,
      metadata: { outcome: "period_ended", periodId: input.periodId },
    });
  }

  return { expiredWaiting: expired.count, closedSessions: active.length };
}

/** Load active session for a student (student guidance poll). */
export async function getActiveGuidanceForChild(input: {
  schoolId: string;
  childId: string;
}) {
  const session = await prisma.humanSupportSession.findFirst({
    where: {
      schoolId: input.schoolId,
      childId: input.childId,
      status: "active",
    },
    orderBy: { startedAt: "desc" },
  });
  if (!session) return null;
  const meta = parseSessionMetadata(session.metadataJson);
  const latest = meta.guidanceMessages[meta.guidanceMessages.length - 1] ?? null;
  return {
    sessionId: session.id,
    plannedEndsAt: session.plannedEndsAt?.toISOString() ?? null,
    guidance: latest,
    returnAction: "resume_current" as const,
  };
}

/**
 * @deprecated Prefer assignHumanSupportStudent + acceptHumanSupportAssignment.
 * Compatibility shim for older UAT scripts: assign then accept with a minimal snapshot.
 */
export async function acceptHumanSupportStudent(input: {
  schoolId: string;
  schoolTeacherId: string;
  actorUserId: string;
  periodId: string;
  childId: string;
  classroomId: string | null;
  assignmentId: string | null;
  questionKey: string | null;
  minutesUntilPeriodEnd: number;
  eligibleStudentCount: number;
  now?: Date;
}) {
  const assigned = await assignHumanSupportStudent({
    ...input,
    humanTutorEligible: true,
  });
  if (!assigned.ok) {
    return assigned;
  }
  return acceptHumanSupportAssignment({
    schoolId: input.schoolId,
    schoolTeacherId: input.schoolTeacherId,
    actorUserId: input.actorUserId,
    periodId: input.periodId,
    queueEntryId: assigned.queueEntryId,
    childId: input.childId,
    minutesUntilPeriodEnd: input.minutesUntilPeriodEnd,
    eligibleStudentCount: input.eligibleStudentCount,
    humanTutorEligible: true,
    now: input.now,
    snapshotInput: {
      schoolId: input.schoolId,
      classroomId: input.classroomId,
      dayLessonId: input.periodId,
      lessonId: null,
      subject: "Unknown",
      lessonTitle: null,
      curriculumSkill: null,
      periodEndsAt: null,
      student: {
        activeContentId: null,
        activeAssignmentId: input.assignmentId,
        currentQuestionKey: input.questionKey,
        aiSupportState: "exhausted",
        misconception: null,
        stages: [],
        attempts: [],
        tutorHistory: [],
      },
    },
  });
}
