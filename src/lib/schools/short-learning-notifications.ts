import { prisma } from "@/lib/db";
import { emitNotificationEvent } from "@/lib/notifications/dispatcher";
import { SHORT_LEARNING_PROMISE } from "@/lib/schools/short-learning-bookings";

type BookingNotificationRow = {
  id: string;
  schoolId: string;
  parentUserId: string;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  subject: string;
  learningFocus: string | null;
  schoolStudent: {
    child: { name: string };
    school: { name: string };
  };
};

async function parentEmail(parentUserId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: parentUserId },
    select: { email: true },
  });
  return user?.email ?? null;
}

function formatSessionWhen(startsAt: Date, durationMinutes: number): string {
  return `${startsAt.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })} (${durationMinutes} min)`;
}

function bookingPayload(booking: BookingNotificationRow) {
  const studentName = booking.schoolStudent.child.name;
  const schoolName = booking.schoolStudent.school.name;
  const when = formatSessionWhen(booking.startsAt, booking.durationMinutes);
  return { studentName, schoolName, when };
}

/** Enqueue booking confirmation email to parent. */
export async function enqueueShortLearningBookingConfirmation(bookingId: string) {
  const booking = await prisma.studentLearningBooking.findUnique({
    where: { id: bookingId },
    include: {
      schoolStudent: {
        include: {
          child: { select: { name: true } },
          school: { select: { name: true } },
        },
      },
    },
  });
  if (!booking) return { ok: false as const, reason: "booking_not_found" };

  const recipient = await parentEmail(booking.parentUserId);
  if (!recipient) return { ok: false as const, reason: "parent_email_missing" };

  const { studentName, schoolName, when } = bookingPayload(booking);
  const focus = booking.learningFocus ? ` Focus: ${booking.learningFocus}.` : "";

  await emitNotificationEvent({
    eventType: "short_learning_booking_confirmed",
    schoolId: booking.schoolId,
    dedupeKey: `short-learning:booking-confirmed:${booking.id}`,
    payload: {
      channel: "email",
      recipient,
      subject: `Short Learning booked — ${studentName}`,
      message: [
        `Short Learning is booked for ${studentName} at ${schoolName}.`,
        `When: ${when}. Subject: ${booking.subject}.${focus}`,
        SHORT_LEARNING_PROMISE,
        "Your monthly subscription covers access. There is no cancellation fee.",
        "This reserves AI-led learning time — not a named private tutor.",
        "Cancel any time from Parent → Short Learning.",
      ].join(" "),
      bookingId: booking.id,
    },
  });

  return { ok: true as const };
}

/** Enqueue cancellation confirmation email to parent. */
export async function enqueueShortLearningCancelConfirmation(bookingId: string) {
  const booking = await prisma.studentLearningBooking.findUnique({
    where: { id: bookingId },
    include: {
      schoolStudent: {
        include: {
          child: { select: { name: true } },
          school: { select: { name: true } },
        },
      },
    },
  });
  if (!booking) return { ok: false as const, reason: "booking_not_found" };

  const recipient = await parentEmail(booking.parentUserId);
  if (!recipient) return { ok: false as const, reason: "parent_email_missing" };

  const { studentName, when } = bookingPayload(booking);

  await emitNotificationEvent({
    eventType: "short_learning_booking_cancelled",
    schoolId: booking.schoolId,
    dedupeKey: `short-learning:booking-cancelled:${booking.id}:${booking.status}`,
    payload: {
      channel: "email",
      recipient,
      subject: `Short Learning cancelled — ${studentName}`,
      message: [
        `The Short Learning session for ${studentName} on ${when} has been cancelled (${booking.status.replaceAll("_", " ")}).`,
        "No cancellation fee applies — your monthly subscription is unchanged.",
      ].join(" "),
      bookingId: booking.id,
    },
  });

  return { ok: true as const };
}

/** Session reminder — typically 24h or same-day before start. */
export async function enqueueShortLearningSessionReminder(input: {
  bookingId: string;
  reminderKind: "evening_before" | "same_day" | "one_hour";
}) {
  const booking = await prisma.studentLearningBooking.findUnique({
    where: { id: input.bookingId },
    include: {
      schoolStudent: {
        include: {
          child: { select: { name: true } },
          school: { select: { name: true } },
        },
      },
    },
  });
  if (!booking) return { ok: false as const, reason: "booking_not_found" };
  if (!["booked", "confirmed"].includes(booking.status)) {
    return { ok: false as const, reason: "booking_not_active" };
  }

  const recipient = await parentEmail(booking.parentUserId);
  if (!recipient) return { ok: false as const, reason: "parent_email_missing" };

  const { studentName, when } = bookingPayload(booking);

  await emitNotificationEvent({
    eventType: "short_learning_session_reminder",
    schoolId: booking.schoolId,
    dedupeKey: `short-learning:session-reminder:${booking.id}:${input.reminderKind}`,
    payload: {
      channel: "email",
      recipient,
      subject: `Reminder: Short Learning for ${studentName}`,
      message: [
        `Reminder: ${studentName} has Short Learning on ${when}.`,
        SHORT_LEARNING_PROMISE,
        "Join from the student portal when the session window opens.",
      ].join(" "),
      bookingId: booking.id,
      reminderKind: input.reminderKind,
    },
  });

  return { ok: true as const };
}

/** Tutor shift reminder — published shift starting soon. */
export async function enqueueTutorShiftReminder(input: {
  shiftId: string;
  reminderKind: "starting_soon" | "shift_start" | "shift_end";
}) {
  const shift = await prisma.tutorSupportShift.findUnique({
    where: { id: input.shiftId },
    include: {
      schoolTeacher: {
        include: { user: { select: { email: true, name: true } } },
      },
      school: { select: { name: true } },
    },
  });
  if (!shift || shift.status === "cancelled") {
    return { ok: false as const, reason: "shift_not_found" };
  }

  const recipient = shift.schoolTeacher.user.email;
  if (!recipient) return { ok: false as const, reason: "tutor_email_missing" };

  const when = `${shift.startsAt.toLocaleString("en-GB")} – ${shift.endsAt.toLocaleString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;

  const subjectByKind: Record<typeof input.reminderKind, string> = {
    starting_soon: "Upcoming tutor support shift",
    shift_start: "Your tutor support shift is starting",
    shift_end: "Your tutor support shift is ending soon",
  };

  await emitNotificationEvent({
    eventType: "short_learning_shift_reminder",
    schoolId: shift.schoolId,
    dedupeKey: `short-learning:shift-reminder:${shift.id}:${input.reminderKind}`,
    payload: {
      channel: "email",
      recipient,
      subject: subjectByKind[input.reminderKind],
      message: [
        `${shift.schoolTeacher.user.name ?? "Tutor"}, your support shift at ${shift.school.name} is scheduled for ${when}.`,
        input.reminderKind === "shift_start"
          ? "Open Live Classroom and go available when your shift begins."
          : "Human support is a safety net when available — not a guaranteed private booking.",
      ].join(" "),
      shiftId: shift.id,
      reminderKind: input.reminderKind,
    },
  });

  return { ok: true as const };
}

/** Cron helper: enqueue reminders for upcoming bookings and shifts in a time window. */
export async function enqueueDueShortLearningReminders(input?: { now?: Date }) {
  const now = input?.now ?? new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60_000);
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60_000);

  const upcomingBookings = await prisma.studentLearningBooking.findMany({
    where: {
      status: { in: ["booked", "confirmed"] },
      startsAt: { gte: now, lte: in24Hours },
    },
    select: { id: true, startsAt: true },
    take: 200,
  });

  let bookingReminders = 0;
  for (const row of upcomingBookings) {
    const msUntil = row.startsAt.getTime() - now.getTime();
    if (msUntil <= 65 * 60_000 && msUntil >= 55 * 60_000) {
      const result = await enqueueShortLearningSessionReminder({
        bookingId: row.id,
        reminderKind: "one_hour",
      });
      if (result.ok) bookingReminders += 1;
    } else if (msUntil <= 24 * 60 * 60_000 + 15 * 60_000 && msUntil >= 23 * 60 * 60_000) {
      const result = await enqueueShortLearningSessionReminder({
        bookingId: row.id,
        reminderKind: "same_day",
      });
      if (result.ok) bookingReminders += 1;
    }
  }

  const upcomingShifts = await prisma.tutorSupportShift.findMany({
    where: {
      published: true,
      status: { in: ["scheduled", "on_shift"] },
      startsAt: { gte: now, lte: inOneHour },
    },
    select: { id: true, startsAt: true },
    take: 100,
  });

  let shiftReminders = 0;
  for (const row of upcomingShifts) {
    const msUntil = row.startsAt.getTime() - now.getTime();
    if (msUntil <= 15 * 60_000 && msUntil >= 5 * 60_000) {
      const result = await enqueueTutorShiftReminder({
        shiftId: row.id,
        reminderKind: "starting_soon",
      });
      if (result.ok) shiftReminders += 1;
    }
  }

  return { bookingReminders, shiftReminders, scannedBookings: upcomingBookings.length };
}
