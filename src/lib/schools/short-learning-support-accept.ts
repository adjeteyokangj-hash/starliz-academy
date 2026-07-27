/**
 * Accept Short Learning human-support queue entries without a SchoolDayLesson board.
 * Reuses assignHumanSupportStudent + acceptHumanSupportAssignment (same scheduler).
 */
import { prisma } from "@/lib/db";
import {
  acceptHumanSupportAssignment,
  assignHumanSupportStudent,
} from "@/lib/schools/human-support-scheduler";
import {
  parseShortLearningSupportScopeKey,
} from "@/lib/schools/short-learning-support-context";

function parseQueueMeta(raw: string | null | undefined): Record<string, unknown> {
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

export type ShortLearningQueueDisplay = {
  supportMode: "SHORT_LEARNING" | "DAY_SCHOOL";
  shortLearningBookingId: string | null;
  shortLearningSessionId: string | null;
  shortLearningBlockId: string | null;
  subject: string | null;
  yearGroup: string | null;
  questionKey: string | null;
  contentId: string | null;
  assignmentId: string | null;
  bookingWindowLabel: string | null;
  /** Human-readable block label — never a school timetable period. */
  currentBlockLabel: string | null;
  workspaceHref: string | null;
};

export function displayFromQueueMetadata(input: {
  periodId: string | null;
  questionKey: string | null;
  assignmentId: string | null;
  metadataJson: string | null;
}): ShortLearningQueueDisplay {
  const meta = parseQueueMeta(input.metadataJson);
  const isSl =
    meta.supportMode === "SHORT_LEARNING"
    || Boolean(input.periodId?.startsWith("sl:"))
    || typeof meta.shortLearningBookingId === "string";

  if (!isSl) {
    return {
      supportMode: "DAY_SCHOOL",
      shortLearningBookingId: null,
      shortLearningSessionId: null,
      shortLearningBlockId: null,
      subject: null,
      yearGroup: null,
      questionKey: input.questionKey,
      contentId: null,
      assignmentId: input.assignmentId,
      bookingWindowLabel: null,
      currentBlockLabel: null,
      workspaceHref: input.periodId ? `/teacher/live/${input.periodId}` : null,
    };
  }

  const bookingId =
    (typeof meta.shortLearningBookingId === "string" && meta.shortLearningBookingId)
    || parseShortLearningSupportScopeKey(input.periodId)?.bookingId
    || null;
  const blockId =
    (typeof meta.shortLearningBlockId === "string" && meta.shortLearningBlockId)
    || parseShortLearningSupportScopeKey(input.periodId)?.blockId
    || null;
  const blockOrder = typeof meta.blockOrder === "number" ? meta.blockOrder : null;
  const blockType = typeof meta.blockType === "string" ? meta.blockType : null;
  const currentBlockLabel =
    blockOrder != null
      ? `Block ${blockOrder}${blockType ? ` · ${blockType.replaceAll("_", " ")}` : ""}`
      : "Current Short Learning block";

  return {
    supportMode: "SHORT_LEARNING",
    shortLearningBookingId: bookingId,
    shortLearningSessionId: typeof meta.shortLearningSessionId === "string" ? meta.shortLearningSessionId : null,
    shortLearningBlockId: blockId,
    subject: typeof meta.subject === "string" ? meta.subject : null,
    yearGroup: typeof meta.yearGroup === "string" ? meta.yearGroup : null,
    questionKey: input.questionKey ?? (typeof meta.questionId === "string" ? meta.questionId : null),
    contentId: typeof meta.contentId === "string" ? meta.contentId : null,
    assignmentId: input.assignmentId ?? (typeof meta.assignmentId === "string" ? meta.assignmentId : null),
    bookingWindowLabel: "Short Learning booking window",
    currentBlockLabel,
    workspaceHref: null,
  };
}

/**
 * Claim (if waiting) and accept a queue entry for Short Learning or any opaque periodId.
 */
export async function acceptSupportQueueEntry(input: {
  schoolId: string;
  schoolTeacherId: string;
  actorUserId: string;
  queueEntryId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const entry = await prisma.humanSupportQueueEntry.findUnique({
    where: { id: input.queueEntryId },
  });
  if (!entry || entry.schoolId !== input.schoolId) {
    return { ok: false as const, status: 404, error: "Support request not found." };
  }
  if (!["waiting", "assigned"].includes(entry.status)) {
    return { ok: false as const, status: 409, error: `Queue entry is ${entry.status}.` };
  }
  if (entry.status === "assigned" && entry.assignedTutorId && entry.assignedTutorId !== input.schoolTeacherId) {
    return { ok: false as const, status: 403, error: "This request is assigned to another tutor." };
  }
  if (!entry.periodId) {
    return { ok: false as const, status: 409, error: "Queue entry has no support scope." };
  }

  const meta = parseQueueMeta(entry.metadataJson);
  const display = displayFromQueueMetadata({
    periodId: entry.periodId,
    questionKey: entry.questionKey,
    assignmentId: entry.assignmentId,
    metadataJson: entry.metadataJson,
  });

  const minutesUntilPeriodEnd = entry.expiresAt
    ? Math.max(1, Math.ceil((entry.expiresAt.getTime() - now.getTime()) / 60_000))
    : 15;

  let queueEntryId = entry.id;
  if (entry.status === "waiting") {
    const assigned = await assignHumanSupportStudent({
      schoolId: input.schoolId,
      schoolTeacherId: input.schoolTeacherId,
      actorUserId: input.actorUserId,
      periodId: entry.periodId,
      childId: entry.childId,
      classroomId: entry.classroomId,
      assignmentId: entry.assignmentId,
      questionKey: entry.questionKey,
      minutesUntilPeriodEnd,
      eligibleStudentCount: 1,
      humanTutorEligible: true,
      now,
    });
    if (!assigned.ok) {
      return assigned;
    }
    queueEntryId = assigned.queueEntryId ?? entry.id;
  }

  const subject =
    display.subject
    ?? (typeof meta.subject === "string" ? meta.subject : null)
    ?? "Short Learning";
  const yearGroup = display.yearGroup;
  const lessonTitle =
    display.supportMode === "SHORT_LEARNING"
      ? `Short Learning · ${subject}${yearGroup ? ` · ${yearGroup}` : ""}`
      : subject;

  const accepted = await acceptHumanSupportAssignment({
    schoolId: input.schoolId,
    schoolTeacherId: input.schoolTeacherId,
    actorUserId: input.actorUserId,
    periodId: entry.periodId,
    queueEntryId,
    childId: entry.childId,
    minutesUntilPeriodEnd,
    eligibleStudentCount: 1,
    humanTutorEligible: true,
    now,
    snapshotInput: {
      schoolId: input.schoolId,
      classroomId: entry.classroomId,
      dayLessonId: entry.periodId,
      lessonId: null,
      subject,
      lessonTitle,
      curriculumSkill: yearGroup,
      periodEndsAt: entry.expiresAt?.toISOString() ?? null,
      student: {
        activeContentId: display.contentId,
        activeAssignmentId: display.assignmentId ?? entry.assignmentId,
        currentQuestionKey: display.questionKey ?? entry.questionKey,
        aiSupportState: "exhausted",
        misconception: null,
        stages: display.shortLearningBlockId
          ? [
              {
                contentId: display.contentId ?? "",
                stage: "short_learning_block",
                stageIndex: 0,
                completed: false,
              },
            ]
          : [],
        attempts: [],
        tutorHistory: [],
      },
    },
  });

  if (!accepted.ok) {
    return accepted;
  }

  const sessionId = accepted.session.id;

  // Persist SL display fields onto session metadata snapshot additively.
  if (display.supportMode === "SHORT_LEARNING") {
    const session = await prisma.humanSupportSession.findUnique({
      where: { id: sessionId },
      select: { metadataJson: true },
    });
    if (session?.metadataJson) {
      try {
        const parsed = JSON.parse(session.metadataJson) as Record<string, unknown>;
        const snap =
          parsed.supportContextSnapshot && typeof parsed.supportContextSnapshot === "object"
            ? (parsed.supportContextSnapshot as Record<string, unknown>)
            : {};
        parsed.supportContextSnapshot = {
          ...snap,
          supportMode: "SHORT_LEARNING",
          shortLearningBookingId: display.shortLearningBookingId,
          shortLearningSessionId: display.shortLearningSessionId,
          shortLearningBlockId: display.shortLearningBlockId,
          yearGroup: display.yearGroup,
        };
        parsed.returnAction = "resume_current";
        await prisma.humanSupportSession.update({
          where: { id: sessionId },
          data: { metadataJson: JSON.stringify(parsed) },
        });
      } catch {
        // non-fatal
      }
    }
  }

  return {
    ok: true as const,
    sessionId,
    session: accepted.session,
    snapshot: accepted.snapshot,
    display,
    queueEntryId: accepted.queueEntryId ?? queueEntryId,
  };
}
