import { prisma } from "@/lib/db";
import type { StudentLearningBookingStatus } from "@prisma/client";
import {
  resolveBookingActorKind,
  writeShortLearningBookingAudit,
  type BookingSnapshot,
} from "@/lib/schools/short-learning-booking-audit";
import {
  UK_TIMEZONE,
  formatUkDateIso,
  getUkParts,
  londonInstantFromDateAndHm,
  zonedLocalToUtc,
} from "@/lib/uk-datetime";
import {
  SHORT_LEARNING_STARLIZ_CHOOSE,
  isManualShortLearningSubject,
  normalizeShortLearningSubjectInput,
  shortLearningSubjectLabel,
} from "@/lib/schools/short-learning-subjects";
import { recommendShortLearningSubject } from "@/lib/schools/short-learning-subject-recommendation";

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

/**
 * Interpret `day` as a calendar date (UTC midnight placeholder for YYYY-MM-DD)
 * plus minutes-from-midnight in the school window timezone → UTC instant.
 */
function atLocalMinutes(day: Date, minutes: number, timeZone = UK_TIMEZONE): Date {
  const y = day.getUTCFullYear();
  const mo = day.getUTCMonth() + 1;
  const d = day.getUTCDate();
  const h = Math.floor(minutes / 60);
  const mi = minutes % 60;
  return zonedLocalToUtc({ year: y, month: mo, day: d, hour: h, minute: mi, timeZone });
}

function isWeekend(date: Date, timeZone = UK_TIMEZONE): boolean {
  const day = getUkParts(date, timeZone).weekday;
  return day === 0 || day === 6;
}

/** Thursday 18:00 Europe/London for weekend deadline relative to session weekend. */
function weekendDeadlineForSession(sessionDay: Date): Date {
  const parts = getUkParts(sessionDay);
  const daysFromThursday = parts.weekday === 0 ? 3 : parts.weekday === 6 ? 2 : ((parts.weekday - 4 + 7) % 7);
  const base = zonedLocalToUtc({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: 12,
    minute: 0,
  });
  base.setUTCDate(base.getUTCDate() - daysFromThursday);
  const th = getUkParts(base);
  return zonedLocalToUtc({ year: th.year, month: th.month, day: th.day, hour: 18, minute: 0 });
}

function addUkCalendarDays(dateIso: string, deltaDays: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const noon = zonedLocalToUtc({ year: y, month: m, day: d, hour: 12, minute: 0 });
  noon.setUTCDate(noon.getUTCDate() + deltaDays);
  return formatUkDateIso(noon);
}

export function isWithinStandardBookingWindow(input: {
  sessionStartsAt: Date;
  now?: Date;
}): { ok: boolean; lateBooking: boolean; reason?: string } {
  const now = input.now ?? new Date();
  const starts = input.sessionStartsAt;
  const weekend = isWeekend(starts);
  const sessionDateIso = formatUkDateIso(starts);

  if (weekend) {
    const openFromIso = addUkCalendarDays(sessionDateIso, -14);
    const openFrom = londonInstantFromDateAndHm(openFromIso, "00:00");
    if (openFrom && now < openFrom) {
      return { ok: false, lateBooking: false, reason: "Weekend bookings open 14 days ahead." };
    }
    const deadline = weekendDeadlineForSession(starts);
    if (now <= deadline) return { ok: true, lateBooking: false };
    return { ok: true, lateBooking: true };
  }

  const openFromIso = addUkCalendarDays(sessionDateIso, -7);
  const openFrom = londonInstantFromDateAndHm(openFromIso, "00:00");
  if (openFrom && now < openFrom) {
    return { ok: false, lateBooking: false, reason: "Weekday bookings open 7 days ahead." };
  }
  const noon = londonInstantFromDateAndHm(sessionDateIso, "12:00");
  if (noon && now <= noon) return { ok: true, lateBooking: false };
  return { ok: true, lateBooking: true };
}

export function canCancelFreely(input: {
  sessionStartsAt: Date;
  now?: Date;
}): { free: boolean; late: boolean } {
  const now = input.now ?? new Date();
  const starts = input.sessionStartsAt;
  if (isWeekend(starts)) {
    const sessionDateIso = formatUkDateIso(starts);
    const prevDayIso = addUkCalendarDays(sessionDateIso, -1);
    const deadline = londonInstantFromDateAndHm(prevDayIso, "18:00");
    if (deadline && now <= deadline) return { free: true, late: false };
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
  subject?: string | null;
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

  const normalizedSubject = normalizeShortLearningSubjectInput(input.subject);
  if (normalizedSubject == null) {
    throw new Error("Subject must be an allowed Short Learning subject, or leave blank for StarLiz to choose.");
  }

  const requestedLearningFocus = input.learningFocus?.trim() || null;
  let subjectSelectionMode: "parent_selected" | "starliz_selected" = "parent_selected";
  let requestedSubject: string | null = null;
  let selectedSubject: string;
  let selectionReason = "parent_selected";
  let resolvedLearningFocus = requestedLearningFocus;

  if (normalizedSubject === SHORT_LEARNING_STARLIZ_CHOOSE) {
    subjectSelectionMode = "starliz_selected";
    requestedSubject = null;
    const recommendation = await recommendShortLearningSubject({
      schoolId: input.schoolId,
      schoolStudentId: input.schoolStudentId,
      parentUserId: input.parentUserId,
      now: input.now,
    });
    selectedSubject = recommendation.subject;
    selectionReason = recommendation.reason;
    resolvedLearningFocus = requestedLearningFocus || recommendation.learningFocus;
  } else if (isManualShortLearningSubject(normalizedSubject)) {
    requestedSubject = normalizedSubject;
    selectedSubject = normalizedSubject;
    selectionReason = "parent_selected";
  } else {
    throw new Error("Subject must be an allowed Short Learning subject, or leave blank for StarLiz to choose.");
  }

  const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000);
  const now = input.now ?? new Date();
  const windowCheck = isWithinStandardBookingWindow({ sessionStartsAt: input.startsAt, now });
  if (!windowCheck.ok) {
    throw new Error(windowCheck.reason ?? "Outside booking window.");
  }

  const dateIso = formatUkDateIso(input.startsAt);
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

  const weekday = getUkParts(input.startsAt).weekday;
  const learningWindow = await prisma.schoolLearningWindow.findFirst({
    where: { schoolId: input.schoolId, active: true, weekday },
  });

  const metadata = {
    subjectSelectionMode,
    requestedSubject,
    selectedSubject,
    selectionReason,
    requestedLearningFocus,
    resolvedLearningFocus,
    selectedSubjectLabel: shortLearningSubjectLabel(selectedSubject),
  };

  const booking = await prisma.studentLearningBooking.create({
    data: {
      schoolId: input.schoolId,
      schoolStudentId: input.schoolStudentId,
      parentUserId: input.parentUserId,
      learningWindowId: learningWindow?.id ?? null,
      startsAt: input.startsAt,
      endsAt,
      durationMinutes: input.durationMinutes,
      subject: selectedSubject,
      learningFocus: resolvedLearningFocus,
      parentNote: input.parentNote?.trim() || null,
      status: "booked",
      confirmedAt: new Date(),
      honestyPolicyVersion: SHORT_LEARNING_HONESTY_POLICY_VERSION,
      honestyAcknowledgedAt: new Date(),
      source: "parent_portal",
      metadataJson: JSON.stringify(metadata),
    },
  });

  const afterSnap: BookingSnapshot = {
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    durationMinutes: booking.durationMinutes,
    subject: booking.subject,
    status: booking.status,
    learningFocus: booking.learningFocus,
  };
  void writeShortLearningBookingAudit({
    schoolId: booking.schoolId,
    bookingId: booking.id,
    actorUserId: input.parentUserId,
    action: "short_learning_booking_created",
    actorKind: resolveBookingActorKind({
      source: "parent_portal",
      actorUserId: input.parentUserId,
      parentUserId: input.parentUserId,
    }),
    parentUserId: input.parentUserId,
    schoolStudentId: input.schoolStudentId,
    after: afterSnap,
    source: "api",
  }).catch(() => undefined);

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
  const beforeSnap: BookingSnapshot = {
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    durationMinutes: booking.durationMinutes,
    subject: booking.subject,
    status: booking.status,
    learningFocus: booking.learningFocus,
    cancellationCategory: booking.cancellationCategory,
  };
  const { late } = canCancelFreely({ sessionStartsAt: booking.startsAt, now: input.now });
  const status: StudentLearningBookingStatus = late ? "late_cancelled" : "cancelled";
  const updated = await prisma.studentLearningBooking.update({
    where: { id: booking.id },
    data: {
      status,
      cancelledAt: new Date(),
      cancellationCategory: late ? "late_free" : "free",
      // Explicitly no fee fields — subscription model has no cancellation charge.
    },
  });

  const afterSnap: BookingSnapshot = {
    startsAt: updated.startsAt.toISOString(),
    endsAt: updated.endsAt.toISOString(),
    durationMinutes: updated.durationMinutes,
    subject: updated.subject,
    status: updated.status,
    learningFocus: updated.learningFocus,
    cancellationCategory: updated.cancellationCategory,
  };
  void writeShortLearningBookingAudit({
    schoolId: updated.schoolId,
    bookingId: updated.id,
    actorUserId: input.parentUserId,
    action: "short_learning_booking_cancelled",
    actorKind: resolveBookingActorKind({
      source: "parent_portal",
      actorUserId: input.parentUserId,
      parentUserId: input.parentUserId,
    }),
    parentUserId: input.parentUserId,
    schoolStudentId: updated.schoolStudentId,
    before: beforeSnap,
    after: afterSnap,
    source: "api",
  }).catch(() => undefined);

  return updated;
}

export async function changeStudentLearningBooking(input: {
  bookingId: string;
  parentUserId: string;
  startsAt?: Date;
  durationMinutes?: number;
  subject?: string;
  learningFocus?: string | null;
  now?: Date;
}) {
  const booking = await prisma.studentLearningBooking.findFirst({
    where: { id: input.bookingId, parentUserId: input.parentUserId },
  });
  if (!booking) throw new Error("Booking not found.");
  if (!["booked", "confirmed"].includes(booking.status)) {
    throw new Error("Only upcoming bookings can be changed.");
  }

  const nextStartsAt = input.startsAt ?? booking.startsAt;
  const nextDuration = input.durationMinutes ?? booking.durationMinutes;
  const nextSubject = (input.subject ?? booking.subject).trim();
  const nextFocus =
    input.learningFocus !== undefined
      ? (input.learningFocus?.trim() || null)
      : booking.learningFocus;

  if (!ALLOWED_DURATIONS.includes(nextDuration as 90 | 120)) {
    throw new Error("Duration must be 90 or 120 minutes.");
  }

  const unchanged =
    nextStartsAt.getTime() === booking.startsAt.getTime()
    && nextDuration === booking.durationMinutes
    && nextSubject === booking.subject
    && nextFocus === booking.learningFocus;
  if (unchanged) {
    return booking;
  }

  const beforeSnap: BookingSnapshot = {
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    durationMinutes: booking.durationMinutes,
    subject: booking.subject,
    status: booking.status,
    learningFocus: booking.learningFocus,
  };

  // Validate new slot availability (exclude this booking from capacity).
  const endsAt = new Date(nextStartsAt.getTime() + nextDuration * 60_000);
  const now = input.now ?? new Date();
  const windowCheck = isWithinStandardBookingWindow({ sessionStartsAt: nextStartsAt, now });
  if (!windowCheck.ok) {
    throw new Error(windowCheck.reason ?? "Outside booking window.");
  }

  const dateIso = nextStartsAt.toISOString().slice(0, 10);
  const slots = await listAvailableSlots({
    schoolId: booking.schoolId,
    dateIso,
    durationMinutes: nextDuration,
    now,
  });
  const match = slots.find((s) => s.startsAt.getTime() === nextStartsAt.getTime());
  // Allow keeping the same start time even if capacity counts this booking.
  const sameSlot = nextStartsAt.getTime() === booking.startsAt.getTime() && nextDuration === booking.durationMinutes;
  if (!match && !sameSlot) {
    throw new Error("Selected slot is not available.");
  }

  const overlap = await prisma.studentLearningBooking.findFirst({
    where: {
      schoolStudentId: booking.schoolStudentId,
      id: { not: booking.id },
      status: { in: ["booked", "confirmed", "attended"] },
      startsAt: { lt: endsAt },
      endsAt: { gt: nextStartsAt },
    },
  });
  if (overlap) {
    throw new Error("Student already has an overlapping Short Learning booking.");
  }

  const weekday = nextStartsAt.getUTCDay();
  const learningWindow = await prisma.schoolLearningWindow.findFirst({
    where: { schoolId: booking.schoolId, active: true, weekday },
  });

  const updated = await prisma.studentLearningBooking.update({
    where: { id: booking.id },
    data: {
      startsAt: nextStartsAt,
      endsAt,
      durationMinutes: nextDuration,
      subject: nextSubject,
      learningFocus: nextFocus,
      learningWindowId: learningWindow?.id ?? booking.learningWindowId,
      metadataJson: JSON.stringify({
        ...(safeParseJsonObject(booking.metadataJson) ?? {}),
        lastChangedBy: "parent",
        lastChangedAt: new Date().toISOString(),
      }),
    },
  });

  const afterSnap: BookingSnapshot = {
    startsAt: updated.startsAt.toISOString(),
    endsAt: updated.endsAt.toISOString(),
    durationMinutes: updated.durationMinutes,
    subject: updated.subject,
    status: updated.status,
    learningFocus: updated.learningFocus,
  };

  void writeShortLearningBookingAudit({
    schoolId: updated.schoolId,
    bookingId: updated.id,
    actorUserId: input.parentUserId,
    action: "short_learning_booking_changed",
    actorKind: "parent",
    parentUserId: input.parentUserId,
    schoolStudentId: updated.schoolStudentId,
    before: beforeSnap,
    after: afterSnap,
    source: "api",
  }).catch(() => undefined);

  return updated;
}

function safeParseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
