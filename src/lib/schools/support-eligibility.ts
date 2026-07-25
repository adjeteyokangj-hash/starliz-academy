import { prisma } from "@/lib/db";
import type { AiSupportState } from "@/lib/schools/live-classroom-signals";
import { deriveHumanTutorEligible } from "@/lib/schools/live-classroom-signals";
import {
  countOnlineTutors,
  getOrCreateSupportPolicy,
} from "@/lib/schools/human-support-presence";
import { resolveTutorShiftEligibility } from "@/lib/schools/tutor-support-shifts";

export type SupportEligibilityMode = "DAY_SCHOOL" | "SHORT_LEARNING";

export type DaySchoolEligibilityContext = {
  mode: "DAY_SCHOOL";
  aiSupportState: AiSupportState;
  studentRecovered: boolean;
  assignmentStillActive: boolean;
  periodStillActive: boolean;
};

export type ShortLearningEligibilityContext = {
  mode: "SHORT_LEARNING";
  aiExhausted: boolean;
  studentRecovered: boolean;
  bookingActive: boolean;
};

export type StudentHumanSupportEligibilityInput =
  | DaySchoolEligibilityContext
  | ShortLearningEligibilityContext;

export type StudentHumanSupportEligibility = {
  humanTutorEligible: boolean;
  continueAi: boolean;
  reason: string;
};

export type TutorCapacitySnapshot = {
  onlineTutorCount: number;
  availableTutorCount: number;
  acceptReadyTutorCount: number;
  hasEligibleCapacity: boolean;
};

export type EscalationQueueDecision = {
  shouldEnqueue: boolean;
  continueAi: boolean;
  unmetEscalation: boolean;
  reason: string;
};

const ACTIVE_BOOKING_STATUSES = new Set(["booked", "confirmed", "attended"]);

/** Whether a Short Learning booking window is active (with optional early entry). */
export function isShortLearningBookingActive(input: {
  startsAt: Date;
  endsAt: Date;
  status: string;
  now?: Date;
  earlyEntryMinutes?: number;
}): boolean {
  const now = input.now ?? new Date();
  if (!ACTIVE_BOOKING_STATUSES.has(input.status)) return false;
  const earlyMs = (input.earlyEntryMinutes ?? 10) * 60_000;
  return now.getTime() >= input.startsAt.getTime() - earlyMs && now.getTime() <= input.endsAt.getTime();
}

/** Pure student-side gate — does not consider tutor capacity. */
export function resolveStudentHumanSupportEligibility(
  input: StudentHumanSupportEligibilityInput,
): StudentHumanSupportEligibility {
  if (input.mode === "DAY_SCHOOL") {
    const humanTutorEligible = deriveHumanTutorEligible({
      aiSupportState: input.aiSupportState,
      studentRecovered: input.studentRecovered,
      assignmentStillActive: input.assignmentStillActive,
      periodStillActive: input.periodStillActive,
    });
    return {
      humanTutorEligible,
      continueAi: !humanTutorEligible,
      reason: humanTutorEligible
        ? "AI exhausted during active Day School period."
        : "Day School human support gate not met.",
    };
  }

  if (!input.bookingActive) {
    return {
      humanTutorEligible: false,
      continueAi: true,
      reason: "No active Short Learning booking.",
    };
  }
  if (!input.aiExhausted) {
    return {
      humanTutorEligible: false,
      continueAi: true,
      reason: "AI support not exhausted.",
    };
  }
  if (input.studentRecovered) {
    return {
      humanTutorEligible: false,
      continueAi: true,
      reason: "Student recovered on AI support.",
    };
  }

  return {
    humanTutorEligible: true,
    continueAi: false,
    reason: "Short Learning AI exhausted with active booking.",
  };
}

/** Whether any on-shift tutor can accept a student right now. */
export function hasEligibleTutorCapacity(capacity: TutorCapacitySnapshot): boolean {
  return capacity.acceptReadyTutorCount > 0;
}

/** Decide queue vs continue-AI once student eligibility and tutor capacity are known. */
export function resolveEscalationQueueDecision(input: {
  student: StudentHumanSupportEligibility;
  capacity: TutorCapacitySnapshot;
}): EscalationQueueDecision {
  if (!input.student.humanTutorEligible) {
    return {
      shouldEnqueue: false,
      continueAi: true,
      unmetEscalation: false,
      reason: input.student.reason,
    };
  }

  if (!hasEligibleTutorCapacity(input.capacity)) {
    return {
      shouldEnqueue: false,
      continueAi: true,
      unmetEscalation: true,
      reason: "No on-shift, available tutor capacity — continue AI tutoring.",
    };
  }

  return {
    shouldEnqueue: true,
    continueAi: false,
    unmetEscalation: false,
    reason: "Eligible tutor capacity available.",
  };
}

export async function countShiftEligibleTutorCapacity(input: {
  schoolId: string;
  now?: Date;
}): Promise<TutorCapacitySnapshot> {
  const now = input.now ?? new Date();
  const policy = await getOrCreateSupportPolicy(input.schoolId);
  const counts = await countOnlineTutors({
    schoolId: input.schoolId,
    staleAfterSec: policy.staleAfterSec,
    now,
  });

  const presenceRows = await prisma.tutorPresence.findMany({
    where: {
      schoolId: input.schoolId,
      status: { in: ["available", "busy", "paused"] },
    },
    select: {
      schoolTeacherId: true,
      status: true,
      lastHeartbeatAt: true,
      activeSessionId: true,
    },
  });

  let acceptReadyTutorCount = 0;
  for (const row of presenceRows) {
    if (row.status !== "available") continue;
    const eligibility = await resolveTutorShiftEligibility({
      schoolId: input.schoolId,
      schoolTeacherId: row.schoolTeacherId,
      presenceStatus: row.status,
      lastHeartbeatAt: row.lastHeartbeatAt,
      hasActiveSupportSession: Boolean(row.activeSessionId),
      now,
    });
    if (eligibility.canAcceptStudent) acceptReadyTutorCount += 1;
  }

  return {
    onlineTutorCount: counts.onlineTutorCount,
    availableTutorCount: counts.availableTutorCount,
    acceptReadyTutorCount,
    hasEligibleCapacity: acceptReadyTutorCount > 0,
  };
}

export async function loadActiveShortLearningBooking(input: {
  schoolId: string;
  childId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const booking = await prisma.studentLearningBooking.findFirst({
    where: {
      schoolId: input.schoolId,
      status: { in: ["booked", "confirmed", "attended"] },
      schoolStudent: { childId: input.childId, status: "active" },
      startsAt: { lte: new Date(now.getTime() + 10 * 60_000) },
      endsAt: { gte: now },
    },
    orderBy: { startsAt: "asc" },
  });
  if (!booking) return null;
  return {
    booking,
    bookingActive: isShortLearningBookingActive({
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      status: booking.status,
      now,
    }),
  };
}

export async function resolveShortLearningStudentEligibility(input: {
  schoolId: string;
  childId: string;
  aiExhausted: boolean;
  studentRecovered: boolean;
  now?: Date;
}): Promise<StudentHumanSupportEligibility> {
  const active = await loadActiveShortLearningBooking({
    schoolId: input.schoolId,
    childId: input.childId,
    now: input.now,
  });
  return resolveStudentHumanSupportEligibility({
    mode: "SHORT_LEARNING",
    aiExhausted: input.aiExhausted,
    studentRecovered: input.studentRecovered,
    bookingActive: active?.bookingActive ?? false,
  });
}
