/**
 * Idempotent, window-based Short Learning booking lifecycle writers.
 *
 * Booking statuses (schema): booked → confirmed → attended → completed
 * Also: no_show | expired | cancelled | late_cancelled
 *
 * "Active" is the window-open promotion: booked → confirmed when early entry begins.
 * Journey publish / block completion remain separate from booking completion.
 * no_show never writes fees — reliability limits only.
 */

import { prisma } from "@/lib/db";
import { writeSchoolAuditLog } from "@/lib/schools/audit";

export const SHORT_LEARNING_EARLY_ENTRY_MINUTES = 10;

const OPEN_STATUSES = ["booked", "confirmed", "attended"] as const;
const PRE_ATTENDANCE = ["booked", "confirmed"] as const;

export type BookingLifecycleSweepResult = {
  activated: number;
  attended: number;
  completed: number;
  noShow: number;
  expired: number;
  scanned: number;
};

function parseMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function auditBookingTransition(input: {
  schoolId: string;
  bookingId: string;
  action:
    | "short_learning_booking_active"
    | "short_learning_booking_attended"
    | "short_learning_booking_completed"
    | "short_learning_booking_no_show"
    | "short_learning_booking_expired";
  beforeStatus: string;
  afterStatus: string;
  metadata?: Record<string, unknown>;
}) {
  await writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorType: "system",
    source: "worker",
    action: input.action,
    entityType: "student",
    entityId: input.bookingId,
    before: { status: input.beforeStatus },
    after: { status: input.afterStatus },
    metadata: {
      bookingId: input.bookingId,
      feeApplied: false,
      ...(input.metadata ?? {}),
    },
    severity: input.action === "short_learning_booking_no_show" ? "warning" : "info",
  });
}

async function bookingWasStudentPlayable(bookingId: string): Promise<boolean> {
  const booking = await prisma.studentLearningBooking.findUnique({
    where: { id: bookingId },
    select: {
      journeyId: true,
      journey: { select: { status: true } },
      shortLearningSession: { select: { status: true, metadataJson: true } },
    },
  });
  if (!booking) return false;
  if (booking.journey?.status === "published") return true;
  const session = booking.shortLearningSession;
  if (!session) return false;
  if (session.status === "ready") {
    const meta = parseMetadata(session.metadataJson);
    return meta.source === "published_journey" || meta.studentPlayable === true;
  }
  return false;
}

/**
 * Sweep open bookings against wall-clock windows.
 * Safe to re-run: each transition uses status-conditional updates.
 */
export async function sweepShortLearningBookingLifecycle(input?: {
  now?: Date;
  earlyEntryMinutes?: number;
  limit?: number;
}): Promise<BookingLifecycleSweepResult> {
  const now = input?.now ?? new Date();
  const earlyMs = (input?.earlyEntryMinutes ?? SHORT_LEARNING_EARLY_ENTRY_MINUTES) * 60_000;
  const limit = Math.max(1, Math.min(input?.limit ?? 500, 2000));

  const open = await prisma.studentLearningBooking.findMany({
    where: { status: { in: [...OPEN_STATUSES] } },
    orderBy: { startsAt: "asc" },
    take: limit,
    select: {
      id: true,
      schoolId: true,
      status: true,
      startsAt: true,
      endsAt: true,
      joinedAt: true,
      completedAt: true,
      noShowAt: true,
    },
  });

  let activated = 0;
  let attended = 0;
  let completed = 0;
  let noShow = 0;
  let expired = 0;

  for (const booking of open) {
    const windowOpenAt = new Date(booking.startsAt.getTime() - earlyMs);
    const pastEnd = now.getTime() > booking.endsAt.getTime();
    const inOrAfterWindow = now.getTime() >= windowOpenAt.getTime();

    // 1) Active window — booked → confirmed (idempotent).
    if (booking.status === "booked" && inOrAfterWindow && !pastEnd) {
      const updated = await prisma.studentLearningBooking.updateMany({
        where: { id: booking.id, status: "booked" },
        data: {
          status: "confirmed",
          confirmedAt: now,
        },
      });
      if (updated.count > 0) {
        activated += 1;
        await auditBookingTransition({
          schoolId: booking.schoolId,
          bookingId: booking.id,
          action: "short_learning_booking_active",
          beforeStatus: "booked",
          afterStatus: "confirmed",
          metadata: {
            windowOpenAt: windowOpenAt.toISOString(),
            startsAt: booking.startsAt.toISOString(),
            endsAt: booking.endsAt.toISOString(),
          },
        });
        booking.status = "confirmed";
      }
    }

    // 2) Attended — sync when joinedAt already set (page/API join path).
    if (
      booking.joinedAt
      && (PRE_ATTENDANCE as readonly string[]).includes(booking.status)
    ) {
      const updated = await prisma.studentLearningBooking.updateMany({
        where: { id: booking.id, status: { in: [...PRE_ATTENDANCE] }, joinedAt: { not: null } },
        data: { status: "attended" },
      });
      if (updated.count > 0) {
        attended += 1;
        await auditBookingTransition({
          schoolId: booking.schoolId,
          bookingId: booking.id,
          action: "short_learning_booking_attended",
          beforeStatus: booking.status,
          afterStatus: "attended",
          metadata: { joinedAt: booking.joinedAt.toISOString() },
        });
        booking.status = "attended";
      }
    }

    if (!pastEnd) continue;

    // 3) Completed — student joined; booking window ended.
    // Does not mark journey blocks or published journeys complete.
    if (booking.joinedAt && (OPEN_STATUSES as readonly string[]).includes(booking.status)) {
      const updated = await prisma.studentLearningBooking.updateMany({
        where: {
          id: booking.id,
          status: { in: [...OPEN_STATUSES] },
          joinedAt: { not: null },
        },
        data: {
          status: "completed",
          completedAt: booking.completedAt ?? now,
        },
      });
      if (updated.count > 0) {
        completed += 1;
        await auditBookingTransition({
          schoolId: booking.schoolId,
          bookingId: booking.id,
          action: "short_learning_booking_completed",
          beforeStatus: booking.status,
          afterStatus: "completed",
          metadata: {
            joinedAt: booking.joinedAt.toISOString(),
            endsAt: booking.endsAt.toISOString(),
            journeyUnchanged: true,
            blockCompletionUnchanged: true,
          },
        });
      }
      continue;
    }

    // 4/5) No-show vs expired — never joined after window end.
    if (!booking.joinedAt && (PRE_ATTENDANCE as readonly string[]).includes(booking.status)) {
      const playable = await bookingWasStudentPlayable(booking.id);
      const nextStatus = playable ? "no_show" : "expired";
      const updated = await prisma.studentLearningBooking.updateMany({
        where: {
          id: booking.id,
          status: { in: [...PRE_ATTENDANCE] },
          joinedAt: null,
        },
        data: {
          status: nextStatus,
          ...(nextStatus === "no_show"
            ? { noShowAt: booking.noShowAt ?? now }
            : {}),
        },
      });
      if (updated.count > 0) {
        if (nextStatus === "no_show") {
          noShow += 1;
          await auditBookingTransition({
            schoolId: booking.schoolId,
            bookingId: booking.id,
            action: "short_learning_booking_no_show",
            beforeStatus: booking.status,
            afterStatus: "no_show",
            metadata: {
              endsAt: booking.endsAt.toISOString(),
              feeApplied: false,
              contributesToReliabilityLimits: true,
            },
          });
        } else {
          expired += 1;
          await auditBookingTransition({
            schoolId: booking.schoolId,
            bookingId: booking.id,
            action: "short_learning_booking_expired",
            beforeStatus: booking.status,
            afterStatus: "expired",
            metadata: {
              endsAt: booking.endsAt.toISOString(),
              feeApplied: false,
              reason: "content_unavailable_or_not_playable",
              contributesToReliabilityLimits: false,
            },
          });
        }
      }
    }
  }

  return {
    activated,
    attended,
    completed,
    noShow,
    expired,
    scanned: open.length,
  };
}

/** Pure helpers for focused unit tests (window decisions). */
export function classifyBookingLifecycleTransition(input: {
  status: string;
  startsAt: Date;
  endsAt: Date;
  joinedAt: Date | null;
  now: Date;
  earlyEntryMinutes?: number;
  studentPlayable: boolean;
}):
  | "active"
  | "attended"
  | "completed"
  | "no_show"
  | "expired"
  | "none" {
  const earlyMs = (input.earlyEntryMinutes ?? SHORT_LEARNING_EARLY_ENTRY_MINUTES) * 60_000;
  const windowOpenAt = input.startsAt.getTime() - earlyMs;
  const pastEnd = input.now.getTime() > input.endsAt.getTime();
  const inOrAfterWindow = input.now.getTime() >= windowOpenAt;

  if (input.status === "booked" && inOrAfterWindow && !pastEnd) return "active";
  if (input.joinedAt && (PRE_ATTENDANCE as readonly string[]).includes(input.status) && !pastEnd) {
    return "attended";
  }
  if (!pastEnd) return "none";
  if (input.joinedAt && (OPEN_STATUSES as readonly string[]).includes(input.status)) return "completed";
  if (!input.joinedAt && (PRE_ATTENDANCE as readonly string[]).includes(input.status)) {
    return input.studentPlayable ? "no_show" : "expired";
  }
  return "none";
}
