import { prisma } from "@/lib/db";
import type { StudentLearningBookingStatus } from "@prisma/client";

export const SHORT_LEARNING_HONESTY_POLICY_VERSION = "short-learning-ai-led-v1";

export const SHORT_LEARNING_PROMISE =
  "AI teaching is guaranteed. Human support is a safety net when available — not a private 1:1 tutor booking.";

export const SHORT_LEARNING_CHECKBOX =
  "I understand that Short Learning is AI-led and that human tutor support depends on availability.";

const WEEKDAY_OPEN = { opensAt: "16:00", closesAt: "20:00" };
const WEEKEND_OPEN = { opensAt: "09:00", closesAt: "18:00" };
export const SHORT_LEARNING_ALLOWED_DURATIONS = [90, 120] as const;
const ALLOWED_DURATIONS = SHORT_LEARNING_ALLOWED_DURATIONS;

export type SlotCandidate = {
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  capacityRemaining: number;
  lateBooking: boolean;
};

export function parseTimeHm(value: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function isAllowedShortLearningDuration(minutes: number): boolean {
  return (SHORT_LEARNING_ALLOWED_DURATIONS as readonly number[]).includes(minutes);
}

/** Subscription model — cancellation is always free; late flag is status-only. */
export function shortLearningCancellationIsAlwaysFree(): boolean {
  return true;
}

/**
 * Slot start offsets (minutes from midnight) on a 30-minute grid by default.
 */
export function generateSlotStartMinutes(input: {
  openMin: number;
  closeMin: number;
  durationMinutes: number;
  intervalMinutes?: number;
}): number[] {
  const interval = input.intervalMinutes ?? 30;
  if (input.openMin < 0 || input.closeMin <= input.openMin || interval <= 0) return [];
  if (!isAllowedShortLearningDuration(input.durationMinutes)) return [];

  const starts: number[] = [];
  for (let startMin = input.openMin; startMin + input.durationMinutes <= input.closeMin; startMin += interval) {
    starts.push(startMin);
  }
  return starts;
}

function atLocalMinutes(day: Date, minutes: number, timeZone = "Europe/London"): Date {
  // Construct using UTC components approximating Europe/London for v1 ops; schools store timezone on window.
  const y = day.getUTCFullYear();
  const mo = day.getUTCMonth();
  const d = day.getUTCDate();
  const h = Math.floor(minutes / 60);
  const mi = minutes % 60;
  void timeZone;
  return new Date(Date.UTC(y, mo, d, h, mi, 0, 0));
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/** Thursday 18:00 UTC for weekend deadline relative to session weekend. */
function weekendDeadlineForSession(sessionDay: Date): Date {
  // Find preceding Thursday of the week containing Saturday/Sunday session.
  const day = sessionDay.getUTCDay();
  const daysFromThursday = day === 0 ? 3 : day === 6 ? 2 : ((day - 4 + 7) % 7);
  const thursday = new Date(sessionDay);
  thursday.setUTCDate(sessionDay.getUTCDate() - daysFromThursday);
  return atLocalMinutes(thursday, 18 * 60);
}

export function isWithinStandardBookingWindow(input: {
  sessionStartsAt: Date;
  now?: Date;
}): { ok: boolean; lateBooking: boolean; reason?: string } {
  const now = input.now ?? new Date();
  const starts = input.sessionStartsAt;
  const weekend = isWeekend(starts);

  if (weekend) {
    const openFrom = new Date(starts);
    openFrom.setUTCDate(openFrom.getUTCDate() - 14);
    if (now < startOfUtcDay(openFrom)) {
      return { ok: false, lateBooking: false, reason: "Weekend bookings open 14 days ahead." };
    }
    const deadline = weekendDeadlineForSession(starts);
    if (now <= deadline) return { ok: true, lateBooking: false };
    return { ok: true, lateBooking: true };
  }

  const openFrom = new Date(starts);
  openFrom.setUTCDate(openFrom.getUTCDate() - 7);
  if (now < startOfUtcDay(openFrom)) {
    return { ok: false, lateBooking: false, reason: "Weekday bookings open 7 days ahead." };
  }
  const noon = atLocalMinutes(starts, 12 * 60);
  if (now <= noon) return { ok: true, lateBooking: false };
  return { ok: true, lateBooking: true };
}

export function canCancelFreely(input: {
  sessionStartsAt: Date;
  now?: Date;
}): { free: boolean; late: boolean } {
  const now = input.now ?? new Date();
  const starts = input.sessionStartsAt;
  if (isWeekend(starts)) {
    const prevDay = new Date(starts);
    prevDay.setUTCDate(prevDay.getUTCDate() - 1);
    const deadline = atLocalMinutes(prevDay, 18 * 60);
    if (now <= deadline) return { free: true, late: false };
    return { free: true, late: true };
  }
  const freeUntil = new Date(starts.getTime() - 2 * 60 * 60 * 1000);
  if (now <= freeUntil) return { free: true, late: false };
  return { free: true, late: true };
}

export async function ensureDefaultLearningWindows(schoolId: string) {
  const existing = await prisma.schoolLearningWindow.count({ where: { schoolId } });
  if (existing > 0) return { created: 0 };

  const rows = [
    // Mon–Fri
    ...[1, 2, 3, 4, 5].map((weekday) => ({
      schoolId,
      weekday,
      opensAt: WEEKDAY_OPEN.opensAt,
      closesAt: WEEKDAY_OPEN.closesAt,
      allowedDurationsJson: JSON.stringify(ALLOWED_DURATIONS),
      startIntervalMinutes: 30,
      capacityPerSlot: 40,
      active: true,
    })),
    // Sat–Sun
    ...[0, 6].map((weekday) => ({
      schoolId,
      weekday,
      opensAt: WEEKEND_OPEN.opensAt,
      closesAt: WEEKEND_OPEN.closesAt,
      allowedDurationsJson: JSON.stringify(ALLOWED_DURATIONS),
      startIntervalMinutes: 30,
      capacityPerSlot: 40,
      active: true,
    })),
  ];
  await prisma.schoolLearningWindow.createMany({ data: rows });
  return { created: rows.length };
}

export async function listAvailableSlots(input: {
  schoolId: string;
  dateIso: string; // YYYY-MM-DD
  durationMinutes: number;
  now?: Date;
}): Promise<SlotCandidate[]> {
  if (!ALLOWED_DURATIONS.includes(input.durationMinutes as 90 | 120)) {
    return [];
  }
  const now = input.now ?? new Date();
  const day = new Date(`${input.dateIso}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime())) return [];

  await ensureDefaultLearningWindows(input.schoolId);
  const weekday = day.getUTCDay();
  const window = await prisma.schoolLearningWindow.findFirst({
    where: { schoolId: input.schoolId, active: true, weekday },
  });
  if (!window) return [];

  const openMin = parseTimeHm(window.opensAt);
  const closeMin = parseTimeHm(window.closesAt);
  if (openMin < 0 || closeMin <= openMin) return [];

  const interval = window.startIntervalMinutes || 30;
  const capacity = window.capacityPerSlot || 40;
  const slots: SlotCandidate[] = [];

  for (let startMin = openMin; startMin + input.durationMinutes <= closeMin; startMin += interval) {
    const startsAt = atLocalMinutes(day, startMin, window.timezone);
    const endsAt = atLocalMinutes(day, startMin + input.durationMinutes, window.timezone);
    if (startsAt <= now) continue;

    const windowCheck = isWithinStandardBookingWindow({ sessionStartsAt: startsAt, now });
    if (!windowCheck.ok) continue;

    const booked = await prisma.studentLearningBooking.count({
      where: {
        schoolId: input.schoolId,
        startsAt,
        status: { in: ["booked", "confirmed", "attended"] },
      },
    });
    const remaining = Math.max(0, capacity - booked);
    if (remaining <= 0) continue;
    if (windowCheck.lateBooking && remaining <= 0) continue;
    if (windowCheck.lateBooking && remaining < 1) continue;

    slots.push({
      startsAt,
      endsAt,
      durationMinutes: input.durationMinutes,
      capacityRemaining: remaining,
      lateBooking: windowCheck.lateBooking,
    });
  }
  return slots;
}

export async function parentHasShortLearningEntitlement(parentUserId: string): Promise<boolean> {
  const now = new Date();
  const subs = await prisma.subscription.findMany({
    where: { parentId: parentUserId },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: { status: true, currentPeriodEnd: true, graceEndsAt: true },
  });
  for (const sub of subs) {
    const status = (sub.status ?? "").toLowerCase();
    if (status === "active" || status === "trialing") return true;
    if (status === "cancelled" && sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > now.getTime()) {
      return true;
    }
    if (status === "past_due") {
      // Align with learning enforcement: past_due only grants access inside an active grace window.
      if (sub.graceEndsAt && sub.graceEndsAt.getTime() >= now.getTime()) return true;
    }
  }

  // School-linked students under an active school licence also entitle Short Learning access.
  const schoolLink = await prisma.parentSchoolLink.findFirst({
    where: {
      parentUserId,
      status: "active",
      school: { licence: { status: { in: ["active", "pilot", "trialing"] } } },
    },
    select: { id: true },
  });
  return Boolean(schoolLink);
}

/**
 * Bookable school students for a parent:
 * - active ParentSchoolLink rows (school-linked / hybrid), and
 * - active SchoolStudent rows for the parent's own ChildProfile (direct subscribers),
 * without inventing fake school relationships.
 */
export async function listParentBookableShortLearningStudents(parentUserId: string) {
  const [links, ownedMemberships, childCount] = await Promise.all([
    prisma.parentSchoolLink.findMany({
      where: { parentUserId, status: "active" },
      include: {
        school: { select: { id: true, name: true } },
        schoolStudent: { include: { child: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.schoolStudent.findMany({
      where: {
        status: "active",
        child: { parentId: parentUserId, archived: false },
      },
      include: {
        child: { select: { id: true, name: true } },
        school: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.childProfile.count({ where: { parentId: parentUserId, archived: false } }),
  ]);

  const bySchoolStudentId = new Map<string, {
    schoolId: string;
    schoolName: string;
    schoolStudentId: string;
    studentName: string;
    childId: string;
    source: "school_link" | "owned_child";
  }>();

  for (const link of links) {
    bySchoolStudentId.set(link.schoolStudentId, {
      schoolId: link.schoolId,
      schoolName: link.school.name,
      schoolStudentId: link.schoolStudentId,
      studentName: link.schoolStudent.child.name,
      childId: link.schoolStudent.child.id,
      source: "school_link",
    });
  }

  for (const membership of ownedMemberships) {
    if (bySchoolStudentId.has(membership.id)) continue;
    bySchoolStudentId.set(membership.id, {
      schoolId: membership.schoolId,
      schoolName: membership.school.name,
      schoolStudentId: membership.id,
      studentName: membership.child.name,
      childId: membership.child.id,
      source: "owned_child",
    });
  }

  const students = Array.from(bySchoolStudentId.values());
  let emptyReason: string | null = null;
  if (students.length === 0) {
    if (childCount === 0) {
      emptyReason =
        "Add a child profile in the Parent Portal before booking Short Learning. A direct subscription does not require a school link, but a child must exist first.";
    } else {
      emptyReason =
        "Your child is not yet enrolled at a school that offers Short Learning slots. School linkage is not required for a direct subscription purchase itself, but booking uses school capacity — contact support if you need help completing enrolment.";
    }
  }

  return { students, childCount, emptyReason };
}

/**
 * True when the parent may book for this school student:
 * active ParentSchoolLink OR the student child belongs to this parent.
 */
export async function parentOwnsBookableSchoolStudent(input: {
  parentUserId: string;
  schoolId: string;
  schoolStudentId: string;
}): Promise<boolean> {
  const membership = await prisma.schoolStudent.findFirst({
    where: {
      id: input.schoolStudentId,
      schoolId: input.schoolId,
      status: "active",
      OR: [
        { parentLinks: { some: { parentUserId: input.parentUserId, status: "active" } } },
        { child: { parentId: input.parentUserId, archived: false } },
      ],
    },
    select: { id: true },
  });
  return Boolean(membership);
}

/**
 * Reliability gate — no fees. Repeated no-shows may temporarily restrict booking.
 * Uses SchoolSupportPolicy.metadataJson.shortLearning thresholds when present.
 */
export async function assertParentShortLearningReliability(input: {
  schoolId: string;
  parentUserId: string;
  now?: Date;
}): Promise<void> {
  const { getShortLearningPolicySettings } = await import("@/lib/schools/short-learning-coverage");
  const settings = await getShortLearningPolicySettings(input.schoolId);
  const now = input.now ?? new Date();
  const lookbackStart = new Date(now.getTime() - settings.lookbackDays * 86_400_000);

  const [noShowCount, activeFuture] = await Promise.all([
    prisma.studentLearningBooking.count({
      where: {
        schoolId: input.schoolId,
        parentUserId: input.parentUserId,
        status: "no_show",
        startsAt: { gte: lookbackStart },
      },
    }),
    prisma.studentLearningBooking.count({
      where: {
        schoolId: input.schoolId,
        parentUserId: input.parentUserId,
        status: { in: ["booked", "confirmed", "attended"] },
        startsAt: { gte: now },
      },
    }),
  ]);

  if (noShowCount >= settings.noShowThreshold) {
    const lastNoShow = await prisma.studentLearningBooking.findFirst({
      where: {
        schoolId: input.schoolId,
        parentUserId: input.parentUserId,
        status: "no_show",
      },
      orderBy: { noShowAt: "desc" },
      select: { noShowAt: true, startsAt: true },
    });
    const anchor = lastNoShow?.noShowAt ?? lastNoShow?.startsAt ?? now;
    const restrictionEnds = new Date(anchor.getTime() + settings.restrictBookingDays * 86_400_000);
    if (now < restrictionEnds) {
      throw new Error(
        `Booking temporarily restricted until ${restrictionEnds.toISOString().slice(0, 10)} after repeated no-shows. No fees apply — please confirm attendance going forward.`,
      );
    }
    // After restriction window, still cap concurrent future bookings.
    if (activeFuture >= 1) {
      throw new Error(
        "After repeated no-shows, only one future Short Learning booking is allowed until attendance improves.",
      );
    }
  }
}

export async function createStudentLearningBooking(input: {
  schoolId: string;
  schoolStudentId: string;
  parentUserId: string;
  startsAt: Date;
  durationMinutes: number;
  subject: string;
  learningFocus?: string | null;
  parentNote?: string | null;
  honestyAcknowledged: boolean;
  now?: Date;
}) {
  if (!input.honestyAcknowledged) {
    throw new Error("You must acknowledge that Short Learning is AI-led.");
  }
  if (!ALLOWED_DURATIONS.includes(input.durationMinutes as 90 | 120)) {
    throw new Error("Duration must be 90 or 120 minutes.");
  }
  const entitled = await parentHasShortLearningEntitlement(input.parentUserId);
  if (!entitled) {
    throw new Error("An active subscription or school entitlement is required.");
  }

  await assertParentShortLearningReliability({
    schoolId: input.schoolId,
    parentUserId: input.parentUserId,
    now: input.now,
  });

  const membership = await prisma.schoolStudent.findFirst({
    where: {
      id: input.schoolStudentId,
      schoolId: input.schoolId,
      status: "active",
      OR: [
        { parentLinks: { some: { parentUserId: input.parentUserId, status: "active" } } },
        { child: { parentId: input.parentUserId, archived: false } },
      ],
    },
  });
  if (!membership) {
    throw new Error("Student is not linked to this parent for this school.");
  }

  const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000);
  const now = input.now ?? new Date();
  const windowCheck = isWithinStandardBookingWindow({ sessionStartsAt: input.startsAt, now });
  if (!windowCheck.ok) {
    throw new Error(windowCheck.reason ?? "Outside booking window.");
  }

  const dateIso = input.startsAt.toISOString().slice(0, 10);
  const slots = await listAvailableSlots({
    schoolId: input.schoolId,
    dateIso,
    durationMinutes: input.durationMinutes,
    now,
  });
  const match = slots.find((s) => s.startsAt.getTime() === input.startsAt.getTime());
  if (!match) {
    throw new Error("Selected slot is not available.");
  }
  if (windowCheck.lateBooking && match.capacityRemaining < 1) {
    throw new Error("Late booking requires remaining capacity.");
  }

  const overlap = await prisma.studentLearningBooking.findFirst({
    where: {
      schoolStudentId: input.schoolStudentId,
      status: { in: ["booked", "confirmed", "attended"] },
      startsAt: { lt: endsAt },
      endsAt: { gt: input.startsAt },
    },
  });
  if (overlap) {
    throw new Error("Student already has an overlapping Short Learning booking.");
  }

  const weekday = input.startsAt.getUTCDay();
  const learningWindow = await prisma.schoolLearningWindow.findFirst({
    where: { schoolId: input.schoolId, active: true, weekday },
  });

  const booking = await prisma.studentLearningBooking.create({
    data: {
      schoolId: input.schoolId,
      schoolStudentId: input.schoolStudentId,
      parentUserId: input.parentUserId,
      learningWindowId: learningWindow?.id ?? null,
      startsAt: input.startsAt,
      endsAt,
      durationMinutes: input.durationMinutes,
      subject: input.subject.trim(),
      learningFocus: input.learningFocus?.trim() || null,
      parentNote: input.parentNote?.trim() || null,
      status: "booked",
      confirmedAt: new Date(),
      honestyPolicyVersion: SHORT_LEARNING_HONESTY_POLICY_VERSION,
      honestyAcknowledgedAt: new Date(),
      source: "parent_portal",
    },
  });

  // Pre-build session plan + Daytime-engine content in the background so the
  // student journey is ready when the window opens (best-effort; learn path re-ensures).
  void import("@/lib/schools/short-learning-session-content")
    .then(({ ensureShortLearningSessionContent }) =>
      ensureShortLearningSessionContent({ bookingId: booking.id }),
    )
    .catch(() => undefined);

  return booking;
}

export async function cancelStudentLearningBooking(input: {
  bookingId: string;
  parentUserId: string;
  now?: Date;
}) {
  const booking = await prisma.studentLearningBooking.findFirst({
    where: { id: input.bookingId, parentUserId: input.parentUserId },
  });
  if (!booking) throw new Error("Booking not found.");
  if (["cancelled", "late_cancelled", "completed", "expired", "no_show"].includes(booking.status)) {
    throw new Error("Booking cannot be cancelled.");
  }
  const { late } = canCancelFreely({ sessionStartsAt: booking.startsAt, now: input.now });
  const status: StudentLearningBookingStatus = late ? "late_cancelled" : "cancelled";
  return prisma.studentLearningBooking.update({
    where: { id: booking.id },
    data: {
      status,
      cancelledAt: new Date(),
      cancellationCategory: late ? "late_free" : "free",
      // Explicitly no fee fields — subscription model has no cancellation charge.
    },
  });
}
