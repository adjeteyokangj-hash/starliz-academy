import { prisma } from "@/lib/db";
import { handoffForWorkspace, storeSupportHandoff } from "@/lib/coding/workspace-store";
import { codingSupportSummary, type CodingSupportHandoff } from "@/lib/coding/support-handoff";
import { syncEligibleStudentQueue, syncShortLearningEligibleQueue } from "@/lib/schools/human-support-scheduler";
import { minutesNowUk, parseHmToMinutes, schoolDayOfWeek } from "@/lib/schools/school-day-period";
import { isShortLearningBookingActive, resolveStudentHumanSupportEligibility } from "@/lib/schools/support-eligibility";
import { resolveShortLearningSchoolStudentIdsForChild } from "@/lib/schools/short-learning-bookings";
import { codingPeriodMatches } from "@/lib/coding/support-policy";
import { codingAssistanceEnabled } from "@/lib/coding/settings";

export type CodingSupportResult = {
  ok: true;
  queued: boolean;
  continueAi: boolean;
  message: string;
  handoff: CodingSupportHandoff;
};

function aiFirstMessage(hintCount: number): string | null {
  if (hintCount > 0) return null;
  return "Ask the coding tutor for a hint first. A person joins only after that help has been tried.";
}

export async function requestCodingHumanSupport(input: {
  childId: string;
  lessonId: string;
  bookingId?: string | null;
  daytimePeriodId?: string | null;
}): Promise<CodingSupportResult | { ok: false; error: string; status: number }> {
  if (!await codingAssistanceEnabled()) {
    return { ok: false, error: "Human assistance is disabled for Coding. Continue with your AI tutor.", status: 403 };
  }
  const handoff = await handoffForWorkspace(input.childId, input.lessonId);
  if (!handoff) return { ok: false, error: "Start the coding lesson before asking for a person.", status: 404 };
  await storeSupportHandoff(input.childId, input.lessonId, handoff);

  return requestCodingAssistanceForHandoff(input, handoff);
}

/** Shared server-side queue authorisation for legacy and versioned activities. */
export async function requestCodingAssistanceForHandoff(input: {
  childId: string; bookingId?: string | null; daytimePeriodId?: string | null;
}, handoff: CodingSupportHandoff): Promise<CodingSupportResult | { ok: false; error: string; status: number }> {
  if (!await codingAssistanceEnabled()) return { ok: false, error: "Human assistance is disabled for Coding. Continue with your AI tutor.", status: 403 };

  const tooSoon = aiFirstMessage(handoff.hintCount);
  if (tooSoon) {
    return { ok: true, queued: false, continueAi: true, message: tooSoon, handoff };
  }

  if (input.bookingId) {
    return requestFromShortLearning(input.childId, input.bookingId, handoff);
  }
  if (input.daytimePeriodId) {
    return requestFromDaySchool(input.childId, input.daytimePeriodId, handoff);
  }
  return {
    ok: true,
    queued: false,
    continueAi: true,
    message: "Your task, code, error and hints are saved. Open this lesson from Day School or Short Learning to invite a tutor who is on shift.",
    handoff,
  };
}

async function requestFromShortLearning(
  childId: string,
  bookingId: string,
  handoff: CodingSupportHandoff,
): Promise<CodingSupportResult | { ok: false; error: string; status: number }> {
  const schoolStudentIds = await resolveShortLearningSchoolStudentIdsForChild(childId);
  const booking = schoolStudentIds.length
    ? await prisma.studentLearningBooking.findFirst({
        where: {
          id: bookingId,
          schoolStudentId: { in: schoolStudentIds },
          status: { in: ["booked", "confirmed", "attended"] },
        },
        include: {
          schoolStudent: { select: { classroomId: true, child: { select: { yearGroup: true } } } },
        },
      })
    : null;
  if (!booking) return { ok: false, error: "Short Learning booking not found.", status: 404 };
  if (booking.subject.trim().toLowerCase() !== "coding") return { ok: false, error: "This booking is not a Coding session.", status: 403 };
  const active = isShortLearningBookingActive({
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    status: booking.status,
  });
  if (!active) {
    return {
      ok: true,
      queued: false,
      continueAi: true,
      message: "Human support for Short Learning is only available during the booked session. Your coding notes are saved.",
      handoff,
    };
  }
  const eligibility = resolveStudentHumanSupportEligibility({
    mode: "SHORT_LEARNING",
    aiExhausted: handoff.hintCount >= 3,
    studentRequestedHelp: true,
    studentRecovered: false,
    bookingActive: true,
  });
  const minutesUntilBookingEnd = Math.max(1, Math.ceil((booking.endsAt.getTime() - Date.now()) / 60_000));
  const sync = await syncShortLearningEligibleQueue({
    schoolId: booking.schoolId,
    classroomId: booking.schoolStudent.classroomId,
    supportScopeKey: `sl:${booking.id}:coding-${handoff.lessonId}`,
    minutesUntilBookingEnd,
    childId,
    humanTutorEligible: eligibility.humanTutorEligible,
    assignmentId: null,
    questionKey: handoff.stage,
    metadata: {
      shortLearningBookingId: booking.id,
      subject: "Coding",
      yearGroup: booking.schoolStudent.child.yearGroup,
      blockOrder: 1,
      blockType: "coding_lesson",
      contentId: handoff.lessonId,
      coding: handoff,
      codingSummary: codingSupportSummary(handoff),
    },
  });
  return {
    ok: true,
    queued: sync.queued,
    continueAi: sync.continueAi,
    message: sync.queued
      ? "A tutor has been invited with your task, code, error and the hints you already tried. Keep going with the coding tutor while you wait."
      : "No tutor is free right now. Continue with the coding tutor. Your notes are saved for the next request.",
    handoff,
  };
}

async function requestFromDaySchool(
  childId: string,
  daytimePeriodId: string,
  handoff: CodingSupportHandoff,
): Promise<CodingSupportResult | { ok: false; error: string; status: number }> {
  const period = await prisma.schoolDayLesson.findUnique({
    where: { id: daytimePeriodId },
    select: {
      id: true,
      schoolId: true,
      classroomId: true,
      subject: true,
      dayOfWeek: true,
      startsAt: true,
      endsAt: true,
    },
  });
  if (!period) return { ok: false, error: "That school lesson could not be found.", status: 404 };
  const enrolled = await prisma.schoolStudent.findFirst({
    where: { childId, schoolId: period.schoolId, status: "active" },
    select: { id: true, classroomId: true },
  });
  if (!enrolled || !codingPeriodMatches({ subject: period.subject, periodClassroomId: period.classroomId, learnerClassroomId: enrolled.classroomId })) {
    return { ok: false, error: "This coding lesson is not on your classroom timetable.", status: 403 };
  }
  const now = new Date();
  const duringLesson = schoolDayOfWeek(now) === period.dayOfWeek
    && minutesNowUk(now) >= parseHmToMinutes(period.startsAt)
    && minutesNowUk(now) < parseHmToMinutes(period.endsAt);
  if (!duringLesson) {
    return {
      ok: true,
      queued: false,
      continueAi: true,
      message: "A teacher can join during the timetabled coding lesson. Your task, code and hints are saved.",
      handoff,
    };
  }
  if (handoff.hintCount < 3) {
    return {
      ok: true,
      queued: false,
      continueAi: true,
      message: "In Day School a person joins when the coding tutor has already given stronger hints. Ask for another hint, then try again.",
      handoff,
    };
  }
  const minutesLeft = Math.max(1, parseHmToMinutes(period.endsAt) - minutesNowUk(now));
  const eligibility = resolveStudentHumanSupportEligibility({
    mode: "DAY_SCHOOL",
    aiSupportState: "exhausted",
    studentRecovered: false,
    assignmentStillActive: true,
    periodStillActive: true,
  });
  await syncEligibleStudentQueue({
    schoolId: period.schoolId,
    periodId: period.id,
    classroomId: period.classroomId,
    minutesUntilPeriodEnd: minutesLeft,
    eligibleStudents: [{
      childId,
      humanTutorEligible: eligibility.humanTutorEligible,
      assignmentId: null,
      questionKey: handoff.stage,
    }],
  });
  await prisma.humanSupportQueueEntry.updateMany({
    where: { schoolId: period.schoolId, periodId: period.id, childId, status: { in: ["waiting", "assigned"] } },
    data: {
      metadataJson: JSON.stringify({
        supportMode: "DAY_SCHOOL",
        subject: "Coding",
        coding: handoff,
        codingSummary: codingSupportSummary(handoff),
      }),
    },
  });
  const waiting = await prisma.humanSupportQueueEntry.findFirst({
    where: { schoolId: period.schoolId, periodId: period.id, childId, status: "waiting" },
    select: { id: true },
  });
  return {
    ok: true,
    queued: Boolean(waiting),
    continueAi: !waiting,
    message: waiting
      ? "Your teacher queue now includes this coding task, your code, the error and the hints you tried."
      : "No tutor is free in this lesson. Keep working with the coding tutor. Your notes stay attached to the lesson.",
    handoff,
  };
}
