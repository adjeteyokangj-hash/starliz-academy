/**
 * Teacher Live Classroom v1 — aggregate board from existing daytime + tutor data.
 * Derive only; no new persistence for queue/presence.
 */

import { prisma } from "@/lib/db";
import type { SchoolRole } from "@/lib/schools/permissions";
import { isWideRole } from "@/lib/schools/scoping";
import {
  minutesRemainingInPeriod,
  resolvePeriodState,
  minutesNow,
  isPlayableDaytimeLessonType,
} from "@/lib/schools/school-day-period";
import {
  deriveStudentSignals,
  parseDaytimeTutorSkillFocus,
  type AssignmentSignal,
  type AttemptSignal,
  type GlanceSignal,
  type TutorHelpEvent,
  type StudentSignals,
} from "@/lib/schools/live-classroom-signals";
import { deriveHumanSupportSummary } from "@/lib/schools/human-support-timing";
import { countOnlineTutors, getOrCreateSupportPolicy } from "@/lib/schools/human-support-presence";
import { syncEligibleStudentQueue } from "@/lib/schools/human-support-scheduler";
import { latestMisconceptionFromTutorPayloads } from "@/lib/misconception-analytics/aggregate";

export type LiveClassroomPeriod = {
  id: string;
  title: string;
  subject: string;
  lessonType: string;
  startsAt: string;
  endsAt: string;
  room: string | null;
  classroomId: string | null;
  classroomName: string | null;
  teacherId: string | null;
  teacherName: string | null;
  lessonId: string | null;
  lessonTitle: string | null;
  skillFocus: string | null;
  periodState: ReturnType<typeof resolvePeriodState>;
  periodStillActive: boolean;
  minutesRemaining: number;
};

export type LiveTutorHistoryItem = {
  createdAt: string;
  intent: string | null;
  source: string;
  hintLevel: number;
  needsTeacher: boolean;
  message: string;
  questionKey: string | null;
  assignmentId: string | null;
};

export type LiveAttemptItem = {
  createdAt: string;
  correct: boolean;
  questionText: string | null;
  answerGiven: string | null;
  hintsUsed: number;
  assignmentId: string | null;
  contentId: string | null;
};

export type LiveStageItem = {
  contentId: string;
  stage: string | null;
  stageIndex: number;
  label: string;
  assignmentId: string | null;
  status: string | null;
  completed: boolean;
};

export type LiveStudentCard = StudentSignals & {
  schoolStudentId: string;
  childId: string;
  name: string;
  stageLabel: string | null;
  currentQuestionKey: string | null;
  helpTurnCount: number;
  attemptCount: number;
  lastHelpAt: string | null;
  stages: LiveStageItem[];
  activeAssignmentId: string | null;
  activeContentId: string | null;
  attempts: LiveAttemptItem[];
  tutorHistory: LiveTutorHistoryItem[];
  misconception: string | null;
  /** Queue / assignment state for this period. */
  queueStatus: "none" | "waiting" | "assigned" | "in_session" | null;
  assignedToMe: boolean;
  assignedQueueEntryId: string | null;
  activeSessionId: string | null;
};

export type TutorAssignmentSummary = {
  queueEntryId: string;
  childId: string;
  childName: string;
  assignedAt: string | null;
  budgetMinutesEstimate: number | null;
  questionKey: string | null;
};

export type TutorActiveSessionSummary = {
  sessionId: string;
  childId: string;
  childName: string;
  budgetMinutes: number;
  plannedEndsAt: string | null;
  startedAt: string;
  exceededBudget: boolean;
  snapshotAcceptedAt: string | null;
  questionKey: string | null;
  guidanceCount: number;
};

export type LiveClassroomBoard = {
  schoolId: string;
  period: LiveClassroomPeriod;
  humanSupportSummary: string;
  humanSupportState:
    | "ai-only"
    | "tutor-available"
    | "tutors-busy"
    | "queued"
    | "human-session-active";
  tutorCounts: {
    online: number;
    available: number;
    busy: number;
    paused: number;
  };
  counts: {
    total: number;
    normal: number;
    assisting: number;
    struggling: number;
    teacherRequired: number;
  };
  students: LiveStudentCard[];
  viewer: {
    myAssignment: TutorAssignmentSummary | null;
    myActiveSession: TutorActiveSessionSummary | null;
  };
  generatedAt: string;
};

export type LiveClassroomResult =
  | { ok: true; board: LiveClassroomBoard }
  | { ok: false; status: number; error: string };

type PeriodRow = {
  id: string;
  schoolId: string;
  classroomId: string | null;
  teacherId: string | null;
  title: string;
  subject: string;
  lessonType: string;
  startsAt: string;
  endsAt: string;
  room: string | null;
  skillFocus: string | null;
  lessonId: string | null;
  classroom: { id: string; name: string } | null;
  teacher: { id: string; user: { name: string | null } } | null;
  lesson: {
    id: string;
    title: string;
    contentRefs: string | null;
  } | null;
};

function parseContentRefs(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stageMetaFromContent(metadataJson: string | null | undefined): {
  stage: string | null;
  stageIndex: number | null;
  label: string | null;
} {
  const meta = parseJsonObject(metadataJson);
  const session = meta && typeof meta.daytimeSession === "object" && meta.daytimeSession
    ? (meta.daytimeSession as Record<string, unknown>)
    : meta;
  const stage = typeof session?.stage === "string" ? session.stage : null;
  const stageIndex = typeof session?.stageIndex === "number" ? session.stageIndex : null;
  const label = typeof session?.label === "string"
    ? session.label
    : stage === "warmup"
      ? "Warm-up"
      : stage === "stretch"
        ? "Stretch"
        : stage === "core"
          ? "Core"
          : null;
  return { stage, stageIndex, label };
}

function startOfLocalDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function glanceRank(signal: GlanceSignal): number {
  if (signal === "TEACHER_REQUIRED") return 3;
  if (signal === "AI_STRUGGLING") return 2;
  if (signal === "AI_ASSISTING") return 1;
  return 0;
}

export async function loadLiveClassroomBoard(input: {
  dayLessonId: string;
  schoolId: string;
  schoolTeacherId: string;
  role: SchoolRole;
  now?: Date;
  supportingChildIds?: string[];
}): Promise<LiveClassroomResult> {
  const now = input.now ?? new Date();

  const period = await prisma.schoolDayLesson.findUnique({
    where: { id: input.dayLessonId },
    select: {
      id: true,
      schoolId: true,
      classroomId: true,
      teacherId: true,
      title: true,
      subject: true,
      lessonType: true,
      startsAt: true,
      endsAt: true,
      room: true,
      skillFocus: true,
      lessonId: true,
      classroom: { select: { id: true, name: true } },
      teacher: { select: { id: true, user: { select: { name: true } } } },
      lesson: { select: { id: true, title: true, contentRefs: true } },
    },
  }) as PeriodRow | null;

  if (!period) {
    return { ok: false, status: 404, error: "Period not found." };
  }
  if (period.schoolId !== input.schoolId) {
    return { ok: false, status: 403, error: "Cross-school access denied." };
  }
  if (!isWideRole(input.role) && period.teacherId !== input.schoolTeacherId) {
    return {
      ok: false,
      status: 403,
      error: "You can only open Live Classroom for your assigned periods.",
    };
  }
  if (!period.classroomId) {
    return { ok: false, status: 400, error: "This period has no classroom attached." };
  }
  if (!isPlayableDaytimeLessonType(period.lessonType)) {
    return {
      ok: false,
      status: 400,
      error: "Live Classroom is only available for teaching periods (not break/lunch/registration).",
    };
  }

  const periodState = resolvePeriodState(period.startsAt, period.endsAt, minutesNow(now));
  const minutesRemaining = minutesRemainingInPeriod(period.endsAt, now);
  const periodStillActive = periodState === "now" && minutesRemaining > 0;

  const stageContentIds = parseContentRefs(period.lesson?.contentRefs);
  const contentRows = stageContentIds.length > 0
    ? await prisma.aIContentCache.findMany({
      where: { id: { in: stageContentIds } },
      select: { id: true, metadataJson: true },
    })
    : [];
  const contentMeta = new Map(
    contentRows.map((row) => [row.id, stageMetaFromContent(row.metadataJson)]),
  );

  const roster = await prisma.schoolStudent.findMany({
    where: {
      schoolId: input.schoolId,
      classroomId: period.classroomId,
      status: "active",
    },
    select: {
      id: true,
      childId: true,
      child: { select: { id: true, name: true } },
    },
    orderBy: { joinedAt: "asc" },
  });

  const childIds = roster.map((row) => row.childId);
  const dayStart = startOfLocalDay(now);
  const supporting = new Set(input.supportingChildIds ?? []);

  const [assignments, attempts, coachLogs] = childIds.length === 0
    ? [[], [], []] as const
    : await Promise.all([
      prisma.assignment.findMany({
        where: {
          studentId: { in: childIds },
          ...(stageContentIds.length > 0
            ? { contentId: { in: stageContentIds } }
            : { createdAt: { gte: dayStart } }),
        },
        select: {
          id: true,
          studentId: true,
          contentId: true,
          status: true,
          completedAt: true,
        },
      }),
      prisma.attempt.findMany({
        where: {
          studentId: { in: childIds },
          createdAt: { gte: dayStart },
        },
        select: {
          studentId: true,
          createdAt: true,
          correct: true,
          assignmentId: true,
          contentId: true,
          questionText: true,
          answerGiven: true,
          hintsUsed: true,
        },
        orderBy: { createdAt: "desc" },
        take: 800,
      }),
      prisma.coachInteractionLog.findMany({
        where: {
          childId: { in: childIds },
          mode: "daytime_tutor",
          skillFocus: { startsWith: `dts:${period.id}:` },
          createdAt: { gte: dayStart },
        },
        select: {
          childId: true,
          skillFocus: true,
          questionText: true,
          hintLevel: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
        take: 1000,
      }),
    ]);

  const assignmentIds = new Set(assignments.map((row) => row.id));
  const filteredAttempts = attempts.filter(
    (row) =>
      (row.contentId && stageContentIds.includes(row.contentId))
      || (row.assignmentId && assignmentIds.has(row.assignmentId)),
  );

  const students: LiveStudentCard[] = roster.map((enrolment) => {
    const studentAssignments = assignments.filter((row) => row.studentId === enrolment.childId);
    const assignmentSignals: AssignmentSignal[] = studentAssignments.map((row) => {
      const meta = contentMeta.get(row.contentId);
      return {
        id: row.id,
        contentId: row.contentId,
        status: row.status,
        completedAt: row.completedAt,
        stage: meta?.stage ?? null,
        stageIndex: meta?.stageIndex ?? null,
      };
    });

    const studentAttemptsRaw = filteredAttempts.filter((row) => row.studentId === enrolment.childId);
    const attemptSignals: AttemptSignal[] = studentAttemptsRaw.map((row) => ({
      createdAt: row.createdAt,
      correct: row.correct,
      assignmentId: row.assignmentId,
      contentId: row.contentId,
      questionText: row.questionText,
    }));

    const studentLogs = coachLogs.filter((row) => row.childId === enrolment.childId);
    const helpEvents: TutorHelpEvent[] = [];
    const tutorHistory: LiveTutorHistoryItem[] = [];

    for (const log of studentLogs) {
      const parsed = parseDaytimeTutorSkillFocus(log.skillFocus);
      const payload = parseJsonObject(log.questionText);
      const source = typeof payload?.source === "string" ? payload.source : "stored-help";
      const needsTeacher = Boolean(payload?.needsTeacher);
      const intent = typeof payload?.intent === "string" ? payload.intent : null;
      const message = typeof payload?.message === "string" ? payload.message : (log.questionText ?? "");
      const questionKey = typeof payload?.questionKey === "string"
        ? payload.questionKey
        : parsed?.questionKey ?? null;
      const assignmentId = parsed?.assignmentId ?? null;

      helpEvents.push({
        createdAt: log.createdAt,
        source,
        needsTeacher,
        hintLevel: log.hintLevel,
        assignmentId,
        questionKey,
        intent,
        message,
      });

      tutorHistory.push({
        createdAt: log.createdAt.toISOString(),
        intent,
        source,
        hintLevel: log.hintLevel,
        needsTeacher,
        message,
        questionKey,
        assignmentId,
      });
    }

    const signals = deriveStudentSignals({
      stageContentIds,
      assignments: assignmentSignals,
      attempts: attemptSignals,
      helpEvents,
      periodStillActive,
      teacherSupporting: supporting.has(enrolment.childId),
    });

    const stages: LiveStageItem[] = stageContentIds.map((contentId, index) => {
      const meta = contentMeta.get(contentId);
      const assignment = studentAssignments.find((row) => row.contentId === contentId) ?? null;
      const stage = meta?.stage ?? null;
      const label = meta?.label
        ?? (stage === "warmup" ? "Warm-up" : stage === "stretch" ? "Stretch" : stage === "core" ? "Core" : `Stage ${index + 1}`);
      return {
        contentId,
        stage,
        stageIndex: meta?.stageIndex ?? index,
        label,
        assignmentId: assignment?.id ?? null,
        status: assignment?.status ?? null,
        completed: assignment ? assignment.status.toLowerCase() === "completed" : false,
      };
    });

    const activeAssignment = studentAssignments.find((row) => row.status.toLowerCase() !== "completed")
      ?? studentAssignments[studentAssignments.length - 1]
      ?? null;

    const latestHelp = helpEvents[helpEvents.length - 1] ?? null;
    const activeStage = stages.find((stage) => stage.assignmentId === activeAssignment?.id)
      ?? stages.find((stage) => !stage.completed)
      ?? null;

    const attemptItems: LiveAttemptItem[] = studentAttemptsRaw
      .slice(0, 20)
      .map((row) => ({
        createdAt: row.createdAt.toISOString(),
        correct: row.correct,
        questionText: row.questionText,
        answerGiven: row.answerGiven,
        hintsUsed: row.hintsUsed,
        assignmentId: row.assignmentId,
        contentId: row.contentId,
      }));

    return {
      schoolStudentId: enrolment.id,
      childId: enrolment.childId,
      name: enrolment.child.name,
      ...signals,
      stageLabel: activeStage?.label ?? null,
      currentQuestionKey: latestHelp?.questionKey ?? null,
      helpTurnCount: helpEvents.length,
      attemptCount: attemptSignals.length,
      lastHelpAt: latestHelp?.createdAt.toISOString() ?? null,
      stages,
      activeAssignmentId: activeAssignment?.id ?? null,
      activeContentId: activeAssignment?.contentId ?? null,
      attempts: attemptItems,
      tutorHistory: tutorHistory.slice(-30),
      misconception: latestMisconceptionFromTutorPayloads(
        studentLogs.map((log) => log.questionText),
      ),
      queueStatus: null,
      assignedToMe: false,
      assignedQueueEntryId: null,
      activeSessionId: null,
    };
  });

  students.sort((a, b) => {
    const rank = glanceRank(b.glanceSignal) - glanceRank(a.glanceSignal);
    if (rank !== 0) return rank;
    return a.name.localeCompare(b.name);
  });

  // Human Support Availability: sync queue + board summary (no false waiting when offline).
  let tutorCounts = { online: 0, available: 0, busy: 0, paused: 0 };
  let humanSupportSummary = "Human support: AI only";
  let humanSupportState: LiveClassroomBoard["humanSupportState"] = "ai-only";
  let viewerAssignment: TutorAssignmentSummary | null = null;
  let viewerActiveSession: TutorActiveSessionSummary | null = null;
  try {
    await syncEligibleStudentQueue({
      schoolId: input.schoolId,
      periodId: period.id,
      classroomId: period.classroomId,
      minutesUntilPeriodEnd: minutesRemaining,
      eligibleStudents: students.map((s) => ({
        childId: s.childId,
        humanTutorEligible: s.humanTutorEligible,
        assignmentId: s.activeAssignmentId,
        questionKey: s.currentQuestionKey,
      })),
      now,
    });

    const policy = await getOrCreateSupportPolicy(input.schoolId);
    const countsOnline = await countOnlineTutors({
      schoolId: input.schoolId,
      staleAfterSec: policy.staleAfterSec,
      now,
    });
    tutorCounts = {
      online: countsOnline.onlineTutorCount,
      available: countsOnline.availableTutorCount,
      busy: countsOnline.busyTutorCount,
      paused: countsOnline.pausedTutorCount,
    };

    const activeSessions = await prisma.humanSupportSession.findMany({
      where: {
        schoolId: input.schoolId,
        periodId: period.id,
        status: "active",
      },
      select: {
        id: true,
        childId: true,
        schoolTeacherId: true,
        budgetMinutes: true,
        plannedEndsAt: true,
        startedAt: true,
        exceededBudget: true,
        metadataJson: true,
      },
    });
    const activeByChild = new Map(activeSessions.map((row) => [row.childId, row]));
    const queueRows = await prisma.humanSupportQueueEntry.findMany({
      where: {
        schoolId: input.schoolId,
        periodId: period.id,
        status: { in: ["waiting", "assigned", "in_session"] },
      },
      select: {
        id: true,
        childId: true,
        status: true,
        assignedTutorId: true,
        assignedAt: true,
        budgetMinutes: true,
        questionKey: true,
      },
    });
    const waitingByChild = new Set(queueRows.filter((row) => row.status === "waiting").map((row) => row.childId));
    const queueByChild = new Map(queueRows.map((row) => [row.childId, row]));

    for (const student of students) {
      const queue = queueByChild.get(student.childId) ?? null;
      const active = activeByChild.get(student.childId) ?? null;
      student.queueStatus = queue
        ? (queue.status as "waiting" | "assigned" | "in_session")
        : "none";
      student.assignedToMe = Boolean(
        queue
        && queue.status === "assigned"
        && queue.assignedTutorId === input.schoolTeacherId,
      );
      student.assignedQueueEntryId = student.assignedToMe ? queue!.id : null;
      student.activeSessionId = active?.id ?? null;
      if (active) {
        student.teacherState = "supporting";
        student.canJoinAsHumanTutor = false;
      } else if (student.assignedToMe) {
        // Keep intervene visible so tutor can Accept.
        student.canJoinAsHumanTutor = student.humanTutorEligible;
      }
    }

    const nameByChild = new Map(students.map((row) => [row.childId, row.name]));
    const myAssignmentRow = queueRows.find(
      (row) => row.status === "assigned" && row.assignedTutorId === input.schoolTeacherId,
    ) ?? null;
    const myActive = activeSessions.find((row) => row.schoolTeacherId === input.schoolTeacherId) ?? null;
    let snapshotAcceptedAt: string | null = null;
    let guidanceCount = 0;
    if (myActive?.metadataJson) {
      try {
        const meta = JSON.parse(myActive.metadataJson) as {
          supportContextSnapshot?: { acceptedAt?: string };
          guidanceMessages?: unknown[];
        };
        snapshotAcceptedAt = meta.supportContextSnapshot?.acceptedAt ?? null;
        guidanceCount = Array.isArray(meta.guidanceMessages) ? meta.guidanceMessages.length : 0;
      } catch {
        snapshotAcceptedAt = null;
      }
    }

    viewerAssignment = myAssignmentRow
      ? {
          queueEntryId: myAssignmentRow.id,
          childId: myAssignmentRow.childId,
          childName: nameByChild.get(myAssignmentRow.childId) ?? "Student",
          assignedAt: myAssignmentRow.assignedAt?.toISOString() ?? null,
          budgetMinutesEstimate: myAssignmentRow.budgetMinutes,
          questionKey: myAssignmentRow.questionKey,
        }
      : null;
    viewerActiveSession = myActive
      ? {
          sessionId: myActive.id,
          childId: myActive.childId,
          childName: nameByChild.get(myActive.childId) ?? "Student",
          budgetMinutes: myActive.budgetMinutes,
          plannedEndsAt: myActive.plannedEndsAt?.toISOString() ?? null,
          startedAt: myActive.startedAt.toISOString(),
          exceededBudget: Boolean(
            myActive.plannedEndsAt && myActive.plannedEndsAt.getTime() < now.getTime(),
          ),
          snapshotAcceptedAt,
          questionKey: students.find((s) => s.childId === myActive.childId)?.currentQuestionKey ?? null,
          guidanceCount,
        }
      : null;

    const anySession = activeSessions.some((row) => row.schoolTeacherId === input.schoolTeacherId)
      || activeSessions.length > 0;
    const viewerQueued = false;
    const summary = deriveHumanSupportSummary({
      onlineTutorCount: tutorCounts.online,
      availableTutorCount: tutorCounts.available,
      busyTutorCount: tutorCounts.busy,
      studentQueued: waitingByChild.size > 0 && !anySession ? true : viewerQueued,
      studentSessionActive: activeSessions.length > 0,
    });
    if (activeSessions.length === 0) {
      const periodSummary = deriveHumanSupportSummary({
        onlineTutorCount: tutorCounts.online,
        availableTutorCount: tutorCounts.available,
        busyTutorCount: tutorCounts.busy,
        studentQueued: waitingByChild.size > 0,
        studentSessionActive: false,
      });
      humanSupportState = periodSummary.state;
      humanSupportSummary = periodSummary.label;
    } else {
      humanSupportState = summary.state;
      humanSupportSummary = summary.label;
    }
  } catch (error) {
    // Keep board usable if Human Support tables are not migrated yet.
    console.error("[live-classroom] human support sync skipped", error);
  }

  const counts = {
    total: students.length,
    normal: students.filter((row) => row.glanceSignal === "NORMAL").length,
    assisting: students.filter((row) => row.glanceSignal === "AI_ASSISTING").length,
    struggling: students.filter((row) => row.glanceSignal === "AI_STRUGGLING").length,
    teacherRequired: students.filter((row) => row.glanceSignal === "TEACHER_REQUIRED").length,
  };

  return {
    ok: true,
    board: {
      schoolId: input.schoolId,
      period: {
        id: period.id,
        title: period.title,
        subject: period.subject,
        lessonType: period.lessonType,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
        room: period.room,
        classroomId: period.classroomId,
        classroomName: period.classroom?.name ?? null,
        teacherId: period.teacherId,
        teacherName: period.teacher?.user.name ?? null,
        lessonId: period.lessonId,
        lessonTitle: period.lesson?.title ?? null,
        skillFocus: period.skillFocus,
        periodState,
        periodStillActive,
        minutesRemaining,
      },
      humanSupportSummary,
      humanSupportState,
      tutorCounts,
      counts,
      students,
      viewer: {
        myAssignment: viewerAssignment,
        myActiveSession: viewerActiveSession,
      },
      generatedAt: now.toISOString(),
    },
  };
}
