import { prisma } from "@/lib/db";
import {
  countOnlineTutors,
  getOrCreateSupportPolicy,
} from "@/lib/schools/human-support-presence";
import {
  minutesNow,
  parseHmToMinutes,
  schoolDayOfWeek,
  weekdayLabel,
} from "@/lib/schools/school-day-period";
import { displayFromQueueMetadata } from "@/lib/schools/short-learning-support-accept";

export type TeacherSupportQueueRow = {
  queueEntryId: string;
  childId: string;
  studentName: string;
  periodId: string | null;
  subject: string | null;
  questionKey: string | null;
  budgetMinutes: number | null;
  assignedAt: string | null;
  expiresAt: string | null;
  enqueuedAt: string | null;
  liveHref: string | null;
  supportMode: "SHORT_LEARNING" | "DAY_SCHOOL";
  yearGroup: string | null;
  shortLearningBookingId: string | null;
  shortLearningBlockId: string | null;
  bookingWindowLabel: string | null;
  currentBlockLabel: string | null;
  status: string;
};

export type TeacherSupportDashboard = {
  schoolId: string;
  schoolName: string;
  schoolTeacherId: string;
  role: string;
  presence: {
    status: string;
    lastHeartbeatAt: string | null;
    activeSessionId: string | null;
  };
  counts: {
    online: number;
    available: number;
    busy: number;
    paused: number;
    waiting: number;
    assignedToMe: number;
    activeMine: number;
    completedToday: number;
    unresolvedNeeded: number;
  };
  today: {
    weekdayLabel: string;
    periods: Array<{
      id: string;
      title: string;
      subject: string;
      startsAt: string;
      endsAt: string;
      isNow: boolean;
      liveHref: string;
    }>;
  };
  waiting: TeacherSupportQueueRow[];
  assigned: TeacherSupportQueueRow[];
  activeSession: {
    sessionId: string;
    childId: string;
    studentName: string;
    periodId: string | null;
    budgetMinutes: number;
    plannedEndsAt: string | null;
    startedAt: string;
    liveHref: string | null;
    supportMode: "SHORT_LEARNING" | "DAY_SCHOOL";
    subject: string | null;
    yearGroup: string | null;
    shortLearningBookingId: string | null;
    shortLearningBlockId: string | null;
  } | null;
  recentHistory: Array<{
    sessionId: string;
    childId: string;
    studentName: string;
    outcome: string | null;
    status: string;
    startedAt: string;
    endedAt: string | null;
    exceededBudget: boolean;
    hasUnresolvedReport: boolean;
  }>;
};

function startOfLocalDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getTeacherSupportDashboard(input: {
  schoolId: string;
  schoolName: string;
  schoolTeacherId: string;
  role: string;
  now?: Date;
}): Promise<TeacherSupportDashboard> {
  const now = input.now ?? new Date();
  const dayOfWeek = schoolDayOfWeek(now);
  const nowMinutes = minutesNow(now);
  const dayStart = startOfLocalDay(now);

  const policy = await getOrCreateSupportPolicy(input.schoolId);
  const [presence, tutorCounts, waitingRows, assignedRows, activeSession, completedToday, unresolvedNeeded, periods, history] =
    await Promise.all([
      prisma.tutorPresence.findUnique({
        where: { schoolTeacherId: input.schoolTeacherId },
        select: {
          status: true,
          lastHeartbeatAt: true,
          activeSessionId: true,
        },
      }),
      countOnlineTutors({
        schoolId: input.schoolId,
        staleAfterSec: policy.staleAfterSec,
        now,
      }),
      prisma.humanSupportQueueEntry.findMany({
        where: {
          schoolId: input.schoolId,
          status: "waiting",
        },
        orderBy: [{ priority: "desc" }, { enqueuedAt: "asc" }],
        take: 30,
        select: {
          id: true,
          childId: true,
          periodId: true,
          questionKey: true,
          assignmentId: true,
          budgetMinutes: true,
          assignedAt: true,
          expiresAt: true,
          enqueuedAt: true,
          metadataJson: true,
          status: true,
        },
      }),
      prisma.humanSupportQueueEntry.findMany({
        where: {
          schoolId: input.schoolId,
          assignedTutorId: input.schoolTeacherId,
          status: "assigned",
        },
        orderBy: { assignedAt: "asc" },
        take: 20,
        select: {
          id: true,
          childId: true,
          periodId: true,
          questionKey: true,
          assignmentId: true,
          budgetMinutes: true,
          assignedAt: true,
          expiresAt: true,
          enqueuedAt: true,
          metadataJson: true,
          status: true,
        },
      }),
      prisma.humanSupportSession.findFirst({
        where: {
          schoolId: input.schoolId,
          schoolTeacherId: input.schoolTeacherId,
          status: "active",
        },
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          childId: true,
          periodId: true,
          budgetMinutes: true,
          plannedEndsAt: true,
          startedAt: true,
          metadataJson: true,
          queueEntryId: true,
        },
      }),
      prisma.humanSupportSession.count({
        where: {
          schoolId: input.schoolId,
          schoolTeacherId: input.schoolTeacherId,
          status: { in: ["completed", "abandoned", "timed_out", "handed_over"] },
          endedAt: { gte: dayStart },
        },
      }),
      prisma.humanSupportSession.count({
        where: {
          schoolId: input.schoolId,
          schoolTeacherId: input.schoolTeacherId,
          outcome: "unresolved",
          unresolvedReportJson: null,
          endedAt: { gte: dayStart },
        },
      }),
      prisma.schoolDayLesson.findMany({
        where: {
          schoolId: input.schoolId,
          teacherId: input.schoolTeacherId,
          dayOfWeek,
          status: { not: "cancelled" },
        },
        orderBy: [{ startsAt: "asc" }, { periodIndex: "asc" }],
        select: {
          id: true,
          title: true,
          subject: true,
          startsAt: true,
          endsAt: true,
        },
        take: 20,
      }),
      prisma.humanSupportSession.findMany({
        where: {
          schoolId: input.schoolId,
          schoolTeacherId: input.schoolTeacherId,
          status: { not: "active" },
        },
        orderBy: { endedAt: "desc" },
        take: 15,
        select: {
          id: true,
          childId: true,
          outcome: true,
          status: true,
          startedAt: true,
          endedAt: true,
          exceededBudget: true,
          unresolvedReportJson: true,
        },
      }),
    ]);

  const childIds = Array.from(
    new Set([
      ...waitingRows.map((row) => row.childId),
      ...assignedRows.map((row) => row.childId),
      ...(activeSession ? [activeSession.childId] : []),
      ...history.map((row) => row.childId),
    ]),
  );
  const periodIds = Array.from(
    new Set(
      [
        ...waitingRows.map((row) => row.periodId),
        ...assignedRows.map((row) => row.periodId),
        activeSession?.periodId,
      ].filter((id): id is string => typeof id === "string" && !id.startsWith("sl:")),
    ),
  );

  const [children, periodMeta, activeQueueMeta] = await Promise.all([
    childIds.length
      ? prisma.childProfile.findMany({
          where: { id: { in: childIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
    periodIds.length
      ? prisma.schoolDayLesson.findMany({
          where: { id: { in: periodIds }, schoolId: input.schoolId },
          select: { id: true, subject: true, title: true },
        })
      : Promise.resolve([] as Array<{ id: string; subject: string; title: string }>),
    activeSession?.queueEntryId
      ? prisma.humanSupportQueueEntry.findUnique({
          where: { id: activeSession.queueEntryId },
          select: { metadataJson: true, questionKey: true, assignmentId: true, periodId: true },
        })
      : Promise.resolve(null),
  ]);
  const nameById = new Map(children.map((row) => [row.id, row.name]));
  const periodById = new Map(periodMeta.map((row) => [row.id, row]));

  function mapQueueRow(row: {
    id: string;
    childId: string;
    periodId: string | null;
    questionKey: string | null;
    assignmentId: string | null;
    budgetMinutes: number | null;
    assignedAt: Date | null;
    expiresAt: Date | null;
    enqueuedAt: Date;
    metadataJson: string | null;
    status: string;
  }): TeacherSupportQueueRow {
    const display = displayFromQueueMetadata({
      periodId: row.periodId,
      questionKey: row.questionKey,
      assignmentId: row.assignmentId,
      metadataJson: row.metadataJson,
    });
    const dayMeta = row.periodId && !row.periodId.startsWith("sl:") ? periodById.get(row.periodId) : null;
    const subject = display.subject ?? dayMeta?.subject ?? dayMeta?.title ?? null;
    return {
      queueEntryId: row.id,
      childId: row.childId,
      studentName: nameById.get(row.childId) ?? "Student",
      periodId: row.periodId,
      subject,
      questionKey: display.questionKey,
      budgetMinutes: row.budgetMinutes,
      assignedAt: row.assignedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      enqueuedAt: row.enqueuedAt.toISOString(),
      liveHref: display.supportMode === "SHORT_LEARNING" ? null : display.workspaceHref,
      supportMode: display.supportMode,
      yearGroup: display.yearGroup,
      shortLearningBookingId: display.shortLearningBookingId,
      shortLearningBlockId: display.shortLearningBlockId,
      bookingWindowLabel: display.bookingWindowLabel,
      currentBlockLabel: display.currentBlockLabel,
      status: row.status,
    };
  }

  const activeDisplay = activeSession
    ? displayFromQueueMetadata({
        periodId: activeSession.periodId,
        questionKey: activeQueueMeta?.questionKey ?? null,
        assignmentId: activeQueueMeta?.assignmentId ?? null,
        metadataJson: activeQueueMeta?.metadataJson ?? activeSession.metadataJson,
      })
    : null;

  return {
    schoolId: input.schoolId,
    schoolName: input.schoolName,
    schoolTeacherId: input.schoolTeacherId,
    role: input.role,
    presence: {
      status: presence?.status ?? "offline",
      lastHeartbeatAt: presence?.lastHeartbeatAt?.toISOString() ?? null,
      activeSessionId: presence?.activeSessionId ?? null,
    },
    counts: {
      online: tutorCounts.onlineTutorCount,
      available: tutorCounts.availableTutorCount,
      busy: tutorCounts.busyTutorCount,
      paused: tutorCounts.pausedTutorCount,
      waiting: waitingRows.length,
      assignedToMe: assignedRows.length,
      activeMine: activeSession ? 1 : 0,
      completedToday,
      unresolvedNeeded,
    },
    today: {
      weekdayLabel: weekdayLabel(dayOfWeek),
      periods: periods.map((period) => {
        const start = parseHmToMinutes(period.startsAt);
        const end = parseHmToMinutes(period.endsAt);
        const isNow = start >= 0 && end > start && nowMinutes >= start && nowMinutes < end;
        return {
          id: period.id,
          title: period.title,
          subject: period.subject,
          startsAt: period.startsAt,
          endsAt: period.endsAt,
          isNow,
          liveHref: `/teacher/live/${period.id}`,
        };
      }),
    },
    waiting: waitingRows.map(mapQueueRow),
    assigned: assignedRows.map(mapQueueRow),
    activeSession: activeSession
      ? {
          sessionId: activeSession.id,
          childId: activeSession.childId,
          studentName: nameById.get(activeSession.childId) ?? "Student",
          periodId: activeSession.periodId,
          budgetMinutes: activeSession.budgetMinutes,
          plannedEndsAt: activeSession.plannedEndsAt?.toISOString() ?? null,
          startedAt: activeSession.startedAt.toISOString(),
          liveHref:
            activeDisplay?.supportMode === "SHORT_LEARNING"
              ? `/teacher/support`
              : activeSession.periodId
                ? `/teacher/live/${activeSession.periodId}`
                : null,
          supportMode: activeDisplay?.supportMode ?? "DAY_SCHOOL",
          subject: activeDisplay?.subject ?? null,
          yearGroup: activeDisplay?.yearGroup ?? null,
          shortLearningBookingId: activeDisplay?.shortLearningBookingId ?? null,
          shortLearningBlockId: activeDisplay?.shortLearningBlockId ?? null,
        }
      : null,
    recentHistory: history.map((row) => ({
      sessionId: row.id,
      childId: row.childId,
      studentName: nameById.get(row.childId) ?? "Student",
      outcome: row.outcome,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      exceededBudget: row.exceededBudget,
      hasUnresolvedReport: Boolean(row.unresolvedReportJson),
    })),
  };
}
