/**
 * Server-side Short Learning support context.
 * Never trust client-supplied IDs without re-validating ownership and window.
 */
import { prisma } from "@/lib/db";
import { isShortLearningBookingActive } from "@/lib/schools/support-eligibility";
import { resolveStudentYearContext } from "@/lib/schools/student-year-context";

export const AI_TUTOR_SCOPE_SHORT_LEARNING = "short-learning" as const;
export const SHORT_LEARNING_SUPPORT_MODE = "SHORT_LEARNING" as const;

export type ShortLearningSupportContext = {
  supportMode: typeof SHORT_LEARNING_SUPPORT_MODE;
  bookingId: string;
  sessionId: string;
  blockId: string;
  assignmentId: string;
  contentId: string;
  studentId: string;
  schoolId: string;
  classroomId: string | null;
  subject: string;
  yearGroup: string;
  bookingStartsAt: Date;
  bookingEndsAt: Date;
  blockOrder: number;
  blockType: string;
  learningObjective: string | null;
  /** Synthetic period key for history + queue scoping (not a DayLesson id). */
  supportScopeKey: string;
};

export type ShortLearningSupportContextFailure = {
  ok: false;
  status: number;
  code: string;
  error: string;
};

export type ShortLearningSupportContextSuccess = {
  ok: true;
  context: ShortLearningSupportContext;
};

export type ShortLearningSupportContextResult =
  | ShortLearningSupportContextSuccess
  | ShortLearningSupportContextFailure;

export function shortLearningSupportScopeKey(bookingId: string, blockId: string): string {
  return `sl:${bookingId}:${blockId}`;
}

export function parseShortLearningSupportScopeKey(periodOrScopeKey: string | null | undefined): {
  bookingId: string;
  blockId: string;
} | null {
  if (!periodOrScopeKey?.startsWith("sl:")) return null;
  const parts = periodOrScopeKey.split(":");
  if (parts.length < 3) return null;
  const bookingId = parts[1]?.trim();
  const blockId = parts.slice(2).join(":").trim();
  if (!bookingId || !blockId) return null;
  return { bookingId, blockId };
}

/**
 * Resolve and validate Short Learning support context for AI Tutor / Human Support.
 * Client IDs are hints only — ownership, window, and integrity are enforced here.
 */
export async function resolveShortLearningSupportContext(input: {
  studentId: string;
  bookingId: string;
  assignmentId: string;
  contentId: string;
  blockId?: string;
  sessionId?: string;
  now?: Date;
}): Promise<ShortLearningSupportContextResult> {
  const now = input.now ?? new Date();
  const bookingId = input.bookingId.trim();
  const assignmentId = input.assignmentId.trim();
  const contentId = input.contentId.trim();
  const studentId = input.studentId.trim();

  if (!bookingId || !assignmentId || !contentId || !studentId) {
    return { ok: false, status: 400, code: "INVALID_CONTEXT", error: "Missing Short Learning support identifiers." };
  }

  const booking = await prisma.studentLearningBooking.findFirst({
    where: {
      id: bookingId,
      schoolStudent: { childId: studentId, status: "active" },
      status: { in: ["booked", "confirmed", "attended"] },
    },
    select: {
      id: true,
      schoolId: true,
      subject: true,
      startsAt: true,
      endsAt: true,
      status: true,
      schoolStudent: {
        select: {
          classroomId: true,
          child: { select: { yearGroup: true } },
          classroom: { select: { yearGroup: true, name: true } },
        },
      },
      shortLearningSession: {
        include: {
          blocks: { orderBy: { order: "asc" } },
        },
      },
    },
  });

  if (!booking) {
    return { ok: false, status: 404, code: "BOOKING_NOT_FOUND", error: "Short Learning booking not found." };
  }

  if (
    !isShortLearningBookingActive({
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      status: booking.status,
      now,
    })
  ) {
    return {
      ok: false,
      status: 403,
      code: "BOOKING_WINDOW_CLOSED",
      error: "Short Learning support is only available during the booked session window.",
    };
  }

  const session = booking.shortLearningSession;
  if (!session) {
    return { ok: false, status: 409, code: "SESSION_MISSING", error: "Short Learning session is not ready yet." };
  }
  if (input.sessionId && input.sessionId !== session.id) {
    return { ok: false, status: 403, code: "SESSION_MISMATCH", error: "Session does not belong to this booking." };
  }
  if (session.status !== "ready") {
    return { ok: false, status: 409, code: "SESSION_NOT_READY", error: "Short Learning session is not ready yet." };
  }

  const assignment = await prisma.assignment.findFirst({
    where: {
      id: assignmentId,
      studentId,
      contentId,
      status: { in: ["assigned", "in_progress", "completed"] },
    },
    select: { id: true, contentId: true, status: true },
  });
  if (!assignment) {
    return {
      ok: false,
      status: 403,
      code: "ASSIGNMENT_MISMATCH",
      error: "Assignment does not belong to this student or content.",
    };
  }

  const block =
    (input.blockId
      ? session.blocks.find((b) => b.id === input.blockId)
      : null)
    ?? session.blocks.find((b) => b.contentId === contentId && b.status !== "failed")
    ?? null;

  if (!block || !block.contentId) {
    return {
      ok: false,
      status: 403,
      code: "BLOCK_MISMATCH",
      error: "Content does not belong to an active Short Learning block.",
    };
  }
  if (block.contentId !== contentId) {
    return {
      ok: false,
      status: 403,
      code: "CONTENT_MISMATCH",
      error: "Content does not match the Short Learning block.",
    };
  }

  const yearGroup =
    session.yearGroup?.trim()
    || (() => {
      const ctx = resolveStudentYearContext({
        officialYearGroup: booking.schoolStudent.child.yearGroup ?? null,
        classroomYearGroup: booking.schoolStudent.classroom?.yearGroup ?? null,
        classroomName: booking.schoolStudent.classroom?.name ?? null,
        surface: "short-learning",
      });
      return ctx.targetLearningYearGroup;
    })();

  return {
    ok: true,
    context: {
      supportMode: SHORT_LEARNING_SUPPORT_MODE,
      bookingId: booking.id,
      sessionId: session.id,
      blockId: block.id,
      assignmentId: assignment.id,
      contentId,
      studentId,
      schoolId: booking.schoolId,
      classroomId: booking.schoolStudent.classroomId,
      subject: booking.subject,
      yearGroup,
      bookingStartsAt: booking.startsAt,
      bookingEndsAt: booking.endsAt,
      blockOrder: block.order,
      blockType: block.blockType,
      learningObjective: block.learningObjective,
      supportScopeKey: shortLearningSupportScopeKey(booking.id, block.id),
    },
  };
}

export function shortLearningSupportMetadata(context: ShortLearningSupportContext, extra?: Record<string, unknown>) {
  return {
    supportMode: context.supportMode,
    shortLearningBookingId: context.bookingId,
    shortLearningSessionId: context.sessionId,
    shortLearningBlockId: context.blockId,
    assignmentId: context.assignmentId,
    contentId: context.contentId,
    subject: context.subject,
    yearGroup: context.yearGroup,
    blockOrder: context.blockOrder,
    blockType: context.blockType,
    supportScopeKey: context.supportScopeKey,
    ...extra,
  };
}
