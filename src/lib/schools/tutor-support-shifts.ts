import { prisma } from "@/lib/db";
import type { TutorSupportShift, TutorSupportShiftStatus } from "@prisma/client";
import { getOrCreateSupportPolicy } from "@/lib/schools/human-support-presence";

export type DerivedShiftState =
  | "off-shift"
  | "scheduled"
  | "on-shift"
  | "break"
  | "finished"
  | "cancelled";

export type ShiftEligibility = {
  derivedState: DerivedShiftState;
  activeShift: TutorSupportShift | null;
  nextShift: TutorSupportShift | null;
  canBecomeAvailable: boolean;
  canAcceptStudent: boolean;
  graceActive: boolean;
  graceEndsAt: Date | null;
  reason: string;
};

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function shiftTimeRangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return overlaps(aStart, aEnd, bStart, bEnd);
}

export async function findOverlappingShift(input: {
  schoolTeacherId: string;
  startsAt: Date;
  endsAt: Date;
  excludeId?: string;
}) {
  const candidates = await prisma.tutorSupportShift.findMany({
    where: {
      schoolTeacherId: input.schoolTeacherId,
      status: { in: ["scheduled", "on_shift", "break"] },
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
    },
  });
  return candidates.find((row) => overlaps(row.startsAt, row.endsAt, input.startsAt, input.endsAt)) ?? null;
}

export async function resolveTutorShiftEligibility(input: {
  schoolId: string;
  schoolTeacherId: string;
  presenceStatus?: string | null;
  lastHeartbeatAt?: Date | null;
  hasActiveSupportSession?: boolean;
  now?: Date;
}): Promise<ShiftEligibility> {
  const now = input.now ?? new Date();
  const policy = await getOrCreateSupportPolicy(input.schoolId);
  const graceMs = Math.max(0, (policy.shiftEndGraceMinutes ?? 10) * 60_000);
  const staleAfterSec = policy.staleAfterSec ?? 75;

  const shifts = await prisma.tutorSupportShift.findMany({
    where: {
      schoolId: input.schoolId,
      schoolTeacherId: input.schoolTeacherId,
      published: true,
      status: { not: "cancelled" },
      endsAt: { gte: new Date(now.getTime() - Math.max(graceMs, 60_000)) },
    },
    orderBy: { startsAt: "asc" },
    take: 20,
  });

  const nextShift =
    shifts.find((s) => s.startsAt > now && s.status !== "finished") ??
    (await prisma.tutorSupportShift.findFirst({
      where: {
        schoolId: input.schoolId,
        schoolTeacherId: input.schoolTeacherId,
        published: true,
        status: "scheduled",
        startsAt: { gt: now },
      },
      orderBy: { startsAt: "asc" },
    }));

  const covering = shifts.find((s) => s.startsAt <= now && s.endsAt > now && s.status !== "finished");
  if (covering) {
    const inBreak =
      covering.breakStartsAt &&
      covering.breakEndsAt &&
      covering.breakStartsAt <= now &&
      covering.breakEndsAt > now;
    const derivedState: DerivedShiftState = inBreak ? "break" : "on-shift";
    const heartbeatFresh =
      Boolean(input.lastHeartbeatAt) &&
      now.getTime() - (input.lastHeartbeatAt as Date).getTime() <= staleAfterSec * 1000;
    const presenceOk = (input.presenceStatus ?? "offline") === "available";
    const canBecomeAvailable = derivedState === "on-shift" && heartbeatFresh;
    const canAcceptStudent = canBecomeAvailable && presenceOk;
    return {
      derivedState,
      activeShift: covering,
      nextShift,
      canBecomeAvailable,
      canAcceptStudent,
      graceActive: false,
      graceEndsAt: null,
      reason: inBreak ? "Tutor is on break." : "Tutor is on shift.",
    };
  }

  // Grace: recently ended shift + active session
  const justEnded = shifts
    .filter((s) => s.endsAt <= now && s.status !== "cancelled")
    .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())[0];
  if (justEnded && input.hasActiveSupportSession) {
    const graceEndsAt = new Date(justEnded.endsAt.getTime() + graceMs);
    if (now < graceEndsAt) {
      return {
        derivedState: "finished",
        activeShift: justEnded,
        nextShift,
        canBecomeAvailable: false,
        canAcceptStudent: false,
        graceActive: true,
        graceEndsAt,
        reason: "Shift ended — finish current session only (grace).",
      };
    }
  }

  const upcoming = nextShift && nextShift.startsAt > now ? nextShift : null;
  return {
    derivedState: upcoming ? "scheduled" : "off-shift",
    activeShift: null,
    nextShift: upcoming,
    canBecomeAvailable: false,
    canAcceptStudent: false,
    graceActive: false,
    graceEndsAt: null,
    reason: upcoming ? "Next shift is scheduled." : "No active tutor support shift.",
  };
}

export async function createTutorSupportShift(input: {
  schoolId: string;
  schoolTeacherId: string;
  startsAt: Date;
  endsAt: Date;
  breakStartsAt?: Date | null;
  breakEndsAt?: Date | null;
  notes?: string | null;
  yearGroupScope?: string[];
  subjectScope?: string[];
  createdByTeacherId?: string | null;
  published?: boolean;
}) {
  if (input.endsAt <= input.startsAt) {
    throw new Error("Shift end must be after start.");
  }
  const overlap = await findOverlappingShift({
    schoolTeacherId: input.schoolTeacherId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  });
  if (overlap) {
    throw new Error("Shift overlaps an existing shift for this tutor.");
  }
  return prisma.tutorSupportShift.create({
    data: {
      schoolId: input.schoolId,
      schoolTeacherId: input.schoolTeacherId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      breakStartsAt: input.breakStartsAt ?? null,
      breakEndsAt: input.breakEndsAt ?? null,
      notes: input.notes ?? null,
      yearGroupScopeJson: input.yearGroupScope ? JSON.stringify(input.yearGroupScope) : null,
      subjectScopeJson: input.subjectScope ? JSON.stringify(input.subjectScope) : null,
      createdByTeacherId: input.createdByTeacherId ?? null,
      published: input.published ?? true,
      status: "scheduled",
    },
  });
}

export async function cancelTutorSupportShift(input: {
  shiftId: string;
  schoolId: string;
  reason?: string;
}) {
  return prisma.tutorSupportShift.updateMany({
    where: { id: input.shiftId, schoolId: input.schoolId, status: { not: "cancelled" } },
    data: {
      status: "cancelled" satisfies TutorSupportShiftStatus,
      cancelledAt: new Date(),
      cancellationReason: input.reason ?? "Cancelled by admin",
    },
  });
}
