/**
 * School-wide Admin Support Operations read model.
 * Oversight only — does not claim, accept, teach, or sync the tutor queue.
 */

import { prisma } from "@/lib/db";
import {
  countOnlineTutors,
  getOrCreateSupportPolicy,
} from "@/lib/schools/human-support-presence";
import {
  minutesNow,
  parseHmToMinutes,
  schoolDayOfWeek,
  isPlayableDaytimeLessonType,
} from "@/lib/schools/school-day-period";
import {
  deriveStudentSignals,
  parseDaytimeTutorSkillFocus,
  type AttemptSignal,
  type AssignmentSignal,
  type TutorHelpEvent,
} from "@/lib/schools/live-classroom-signals";
import { encodeAdminSupportCaseId } from "@/lib/schools/admin-support-case";
import { parseAdminFollowUp } from "@/lib/schools/admin-support-follow-up";
import { buildMisconceptionCohortSummary } from "@/lib/misconception-analytics/load";

export type AdminSupportOperations = {
  schoolId: string;
  schoolName: string;
  generatedAt: string;
  health: {
    aiRecoveryPercent: number | null;
    humanInterventionsToday: number;
    averageWaitMinutes: number | null;
    tutorCoverage: "good" | "tight" | "none" | "unknown";
    safeguardingAlertsLabel: string;
  };
  glance: {
    learningNormally: number;
    aiAssisting: number;
    aiStruggling: number;
    teacherRequired: number;
    humanSessionsActive: number;
    availableTutors: number;
    busyTutors: number;
    pausedTutors: number;
    offlineTutors: number;
  };
  liveSupport: Array<{
    caseId: string;
    childId: string;
    studentName: string;
    periodId: string | null;
    lessonTitle: string | null;
    aiStatus: string;
    tutorName: string | null;
    tutorSchoolTeacherId: string | null;
    minutesOpen: number | null;
    kind: "live" | "queue" | "session";
  }>;
  tutors: Array<{
    schoolTeacherId: string;
    name: string;
    role: string;
    status: string;
    lastHeartbeatAt: string | null;
    activeSessionId: string | null;
    currentStudentName: string | null;
    sessionsCompletedToday: number;
    rollingMedianMinutes: number | null;
    unresolvedToday: number;
  }>;
  openCases: Array<{
    caseId: string;
    childId: string;
    studentName: string;
    periodId: string | null;
    lessonTitle: string | null;
    attention: string;
    status: string;
    tutorName: string | null;
    queueEntryId: string | null;
    sessionId: string | null;
    updatedAt: string;
  }>;
  recentActivity: Array<{
    at: string;
    studentName: string;
    lessonTitle: string | null;
    tutorName: string | null;
    outcome: string | null;
    sessionId: string;
    caseId: string;
  }>;
  analytics: {
    windowDays: number;
    studentCount: number;
    totalSignals: number;
    bySource: Array<{ source: string; count: number }>;
    topSkills: Array<{ subject: string; skillFocus: string; signalCount: number; sampleText: string | null }>;
    unresolvedSessionCount: number;
    needsMonitoringSessionCount: number;
    escalatedSessionCount: number;
  } | null;
};

function startOfLocalDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return null;
}

function coverageLabel(available: number, waiting: number, busy: number): AdminSupportOperations["health"]["tutorCoverage"] {
  if (available + busy === 0) return waiting > 0 ? "none" : "unknown";
  if (available === 0 && waiting > 0) return "tight";
  if (available > 0 && waiting <= available * 2) return "good";
  if (waiting > available * 3) return "tight";
  return "good";
}

export async function getAdminSupportOperations(input: {
  schoolId: string;
  now?: Date;
}): Promise<AdminSupportOperations | null> {
  const now = input.now ?? new Date();
  const school = await prisma.school.findUnique({
    where: { id: input.schoolId },
    select: { id: true, name: true },
  });
  if (!school) return null;

  const dayOfWeek = schoolDayOfWeek(now);
  const nowMinutes = minutesNow(now);
  const dayStart = startOfLocalDay(now);
  const policy = await getOrCreateSupportPolicy(input.schoolId);

  const currentPeriods = await prisma.schoolDayLesson.findMany({
    where: {
      schoolId: input.schoolId,
      dayOfWeek,
      status: { not: "cancelled" },
      classroomId: { not: null },
    },
    orderBy: [{ startsAt: "asc" }, { periodIndex: "asc" }],
    select: {
      id: true,
      title: true,
      subject: true,
      startsAt: true,
      endsAt: true,
      classroomId: true,
      lessonType: true,
    },
    take: 40,
  });

  const livePeriods = currentPeriods
    .filter((period) => {
      if (!isPlayableDaytimeLessonType(period.lessonType)) return false;
      const start = parseHmToMinutes(period.startsAt);
      const end = parseHmToMinutes(period.endsAt);
      return start >= 0 && end > start && nowMinutes >= start && nowMinutes < end;
    })
    .slice(0, 5);

  const classroomIds = Array.from(
    new Set(livePeriods.map((p) => p.classroomId).filter((id): id is string => Boolean(id))),
  );

  const [
    tutorCounts,
    presenceRows,
    teachers,
    waitingEntries,
    assignedEntries,
    activeSessions,
    abandonedSessions,
    unresolvedSessions,
    completedToday,
    recentSessions,
    waitSamples,
  ] = await Promise.all([
    countOnlineTutors({
      schoolId: input.schoolId,
      staleAfterSec: policy.staleAfterSec,
      now,
    }),
    prisma.tutorPresence.findMany({
      where: { schoolId: input.schoolId },
      select: {
        schoolTeacherId: true,
        status: true,
        lastHeartbeatAt: true,
        activeSessionId: true,
        rollingMedianMinutes: true,
        sessionsCompleted: true,
      },
    }),
    prisma.schoolTeacher.findMany({
      where: { schoolId: input.schoolId, status: "active" },
      select: {
        id: true,
        role: true,
        user: { select: { name: true } },
      },
    }),
    prisma.humanSupportQueueEntry.findMany({
      where: { schoolId: input.schoolId, status: "waiting" },
      orderBy: { enqueuedAt: "asc" },
      take: 50,
      select: {
        id: true,
        childId: true,
        periodId: true,
        status: true,
        enqueuedAt: true,
        estimatedWaitSec: true,
        assignedTutorId: true,
      },
    }),
    prisma.humanSupportQueueEntry.findMany({
      where: { schoolId: input.schoolId, status: "assigned" },
      orderBy: { assignedAt: "asc" },
      take: 50,
      select: {
        id: true,
        childId: true,
        periodId: true,
        status: true,
        assignedAt: true,
        enqueuedAt: true,
        assignedTutorId: true,
      },
    }),
    prisma.humanSupportSession.findMany({
      where: { schoolId: input.schoolId, status: "active" },
      orderBy: { startedAt: "asc" },
      take: 50,
      select: {
        id: true,
        childId: true,
        periodId: true,
        schoolTeacherId: true,
        startedAt: true,
        plannedEndsAt: true,
        budgetMinutes: true,
        queueEntryId: true,
      },
    }),
    prisma.humanSupportSession.findMany({
      where: {
        schoolId: input.schoolId,
        OR: [
          { status: "abandoned" },
          { outcome: "disconnected", endedAt: { gte: dayStart } },
        ],
      },
      orderBy: { endedAt: "desc" },
      take: 40,
      select: {
        id: true,
        childId: true,
        periodId: true,
        schoolTeacherId: true,
        status: true,
        outcome: true,
        startedAt: true,
        endedAt: true,
        queueEntryId: true,
        metadataJson: true,
      },
    }),
    prisma.humanSupportSession.findMany({
      where: {
        schoolId: input.schoolId,
        outcome: "unresolved",
        endedAt: { gte: dayStart },
      },
      orderBy: { endedAt: "desc" },
      take: 40,
      select: {
        id: true,
        childId: true,
        periodId: true,
        schoolTeacherId: true,
        status: true,
        outcome: true,
        startedAt: true,
        endedAt: true,
        queueEntryId: true,
        metadataJson: true,
        unresolvedReportJson: true,
      },
    }),
    prisma.humanSupportSession.groupBy({
      by: ["schoolTeacherId"],
      where: {
        schoolId: input.schoolId,
        status: { in: ["completed", "abandoned", "timed_out", "handed_over"] },
        endedAt: { gte: dayStart },
      },
      _count: { _all: true },
    }),
    prisma.humanSupportSession.findMany({
      where: {
        schoolId: input.schoolId,
        endedAt: { gte: dayStart },
        status: { not: "active" },
      },
      orderBy: { endedAt: "desc" },
      take: 20,
      select: {
        id: true,
        childId: true,
        periodId: true,
        schoolTeacherId: true,
        outcome: true,
        endedAt: true,
      },
    }),
    prisma.humanSupportQueueEntry.findMany({
      where: {
        schoolId: input.schoolId,
        status: { in: ["assigned", "in_session", "completed"] },
        assignedAt: { gte: dayStart },
      },
      select: { enqueuedAt: true, assignedAt: true },
      take: 100,
    }),
  ]);

  const followUpOpen = unresolvedSessions.filter((row) => {
    const fu = parseAdminFollowUp(row.metadataJson);
    return !fu || fu.status === "open" || fu.status === "in_progress";
  });

  const needsFollowUpExtra = await prisma.humanSupportSession.findMany({
    where: {
      schoolId: input.schoolId,
      endedAt: { gte: dayStart },
      metadataJson: { contains: '"followUpNeeded":true' },
    },
    take: 30,
    select: {
      id: true,
      childId: true,
      periodId: true,
      schoolTeacherId: true,
      status: true,
      outcome: true,
      startedAt: true,
      endedAt: true,
      queueEntryId: true,
      metadataJson: true,
    },
  });

  const offlineTutorCount = await prisma.schoolTeacher.count({
    where: { schoolId: input.schoolId, status: "active" },
  }).then((total) => Math.max(0, total - tutorCounts.onlineTutorCount));

  // --- Glance from live periods (read-only; no queue sync) ---
  let learningNormally = 0;
  let aiAssisting = 0;
  let aiStruggling = 0;
  let teacherRequiredFromSignals = 0;
  const liveSupportRows: AdminSupportOperations["liveSupport"] = [];
  const periodTitleById = new Map(currentPeriods.map((p) => [p.id, p.title]));

  if (classroomIds.length > 0) {
    const roster = await prisma.schoolStudent.findMany({
      where: {
        schoolId: input.schoolId,
        classroomId: { in: classroomIds },
        status: "active",
      },
      select: {
        childId: true,
        classroomId: true,
        child: { select: { name: true } },
      },
    });
    const childIds = roster.map((r) => r.childId);
    const sinceHelp = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const [coachLogs, attempts, assignments] = childIds.length
      ? await Promise.all([
          prisma.coachInteractionLog.findMany({
            where: {
              childId: { in: childIds },
              createdAt: { gte: sinceHelp },
              mode: { in: ["daytime_tutor", "mistake_recovery"] },
            },
            orderBy: { createdAt: "asc" },
            take: 3000,
            select: {
              childId: true,
              createdAt: true,
              hintLevel: true,
              skillFocus: true,
              questionText: true,
            },
          }),
          prisma.attempt.findMany({
            where: { studentId: { in: childIds }, createdAt: { gte: sinceHelp } },
            orderBy: { createdAt: "desc" },
            take: 3000,
            select: {
              studentId: true,
              createdAt: true,
              correct: true,
              assignmentId: true,
              contentId: true,
              questionText: true,
            },
          }),
          prisma.assignment.findMany({
            where: { studentId: { in: childIds }, createdAt: { gte: sinceHelp } },
            select: {
              id: true,
              studentId: true,
              contentId: true,
              status: true,
              completedAt: true,
            },
            take: 2000,
          }),
        ])
      : [[], [], []];

    const supporting = new Set(activeSessions.map((s) => s.childId));
    const periodByClassroom = new Map(
      livePeriods.map((p) => [p.classroomId as string, p]),
    );

    for (const enrolment of roster) {
      const period = periodByClassroom.get(enrolment.classroomId ?? "");
      const periodStillActive = Boolean(period);
      const studentLogs = coachLogs.filter((row) => row.childId === enrolment.childId);
      const helpEvents: TutorHelpEvent[] = studentLogs.map((log) => {
        const payload = parseJsonObject(log.questionText);
        const parsed = parseDaytimeTutorSkillFocus(log.skillFocus);
        return {
          createdAt: log.createdAt,
          source: typeof payload?.source === "string" ? payload.source : "stored-help",
          needsTeacher: Boolean(payload?.needsTeacher),
          hintLevel: log.hintLevel,
          assignmentId: parsed?.assignmentId ?? null,
          questionKey: typeof payload?.questionKey === "string" ? payload.questionKey : parsed?.questionKey ?? null,
        };
      });
      const attemptSignals: AttemptSignal[] = attempts
        .filter((row) => row.studentId === enrolment.childId)
        .map((row) => ({
          createdAt: row.createdAt,
          correct: row.correct,
          assignmentId: row.assignmentId,
          contentId: row.contentId,
          questionText: row.questionText,
        }));
      const assignmentSignals: AssignmentSignal[] = assignments
        .filter((row) => row.studentId === enrolment.childId)
        .map((row) => ({
          id: row.id,
          contentId: row.contentId,
          status: row.status,
          completedAt: row.completedAt,
          stage: null,
          stageIndex: null,
        }));

      const signals = deriveStudentSignals({
        stageContentIds: [],
        assignments: assignmentSignals,
        attempts: attemptSignals,
        helpEvents,
        periodStillActive,
        teacherSupporting: supporting.has(enrolment.childId),
      });

      if (signals.glanceSignal === "TEACHER_REQUIRED") teacherRequiredFromSignals += 1;
      else if (signals.glanceSignal === "AI_STRUGGLING") aiStruggling += 1;
      else if (signals.glanceSignal === "AI_ASSISTING") aiAssisting += 1;
      else learningNormally += 1;

      if (
        signals.glanceSignal === "TEACHER_REQUIRED"
        || signals.glanceSignal === "AI_STRUGGLING"
        || supporting.has(enrolment.childId)
      ) {
        const active = activeSessions.find((s) => s.childId === enrolment.childId);
        const assigned = assignedEntries.find((s) => s.childId === enrolment.childId);
        const tutorId = active?.schoolTeacherId ?? assigned?.assignedTutorId ?? null;
        const tutor = tutorId ? teachers.find((t) => t.id === tutorId) : null;
        const startedAt = active?.startedAt ?? assigned?.assignedAt ?? null;
        liveSupportRows.push({
          caseId: encodeAdminSupportCaseId({
            childId: enrolment.childId,
            periodId: period?.id ?? active?.periodId ?? assigned?.periodId ?? null,
          }),
          childId: enrolment.childId,
          studentName: enrolment.child.name,
          periodId: period?.id ?? active?.periodId ?? assigned?.periodId ?? null,
          lessonTitle: period?.title
            ?? (active?.periodId ? periodTitleById.get(active.periodId) ?? null : null),
          aiStatus: signals.aiSupportState,
          tutorName: tutor?.user.name ?? null,
          tutorSchoolTeacherId: tutorId,
          minutesOpen: startedAt
            ? Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 60_000))
            : null,
          kind: active ? "session" : assigned ? "queue" : "live",
        });
      }
    }
  }

  const teacherRequired = Math.max(
    teacherRequiredFromSignals,
    waitingEntries.length + assignedEntries.length,
  );

  // --- Names for open cases / activity ---
  const nameChildIds = Array.from(new Set([
    ...waitingEntries.map((r) => r.childId),
    ...assignedEntries.map((r) => r.childId),
    ...activeSessions.map((r) => r.childId),
    ...abandonedSessions.map((r) => r.childId),
    ...unresolvedSessions.map((r) => r.childId),
    ...needsFollowUpExtra.map((r) => r.childId),
    ...recentSessions.map((r) => r.childId),
    ...activeSessions.map((r) => r.childId),
  ]));
  const children = nameChildIds.length
    ? await prisma.childProfile.findMany({
        where: { id: { in: nameChildIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(children.map((c) => [c.id, c.name]));
  const teacherNameById = new Map(teachers.map((t) => [t.id, t.user.name ?? "Tutor"]));
  const completedByTutor = new Map(
    completedToday.map((row) => [row.schoolTeacherId, row._count._all]),
  );
  const unresolvedByTutor = new Map<string, number>();
  for (const row of unresolvedSessions) {
    unresolvedByTutor.set(
      row.schoolTeacherId,
      (unresolvedByTutor.get(row.schoolTeacherId) ?? 0) + 1,
    );
  }

  const activeChildNames = new Map<string, string>();
  for (const session of activeSessions) {
    activeChildNames.set(session.id, nameById.get(session.childId) ?? "Student");
  }

  const tutors: AdminSupportOperations["tutors"] = teachers.map((teacher) => {
    const presence = presenceRows.find((p) => p.schoolTeacherId === teacher.id);
    const status = presence?.status ?? "offline";
    const activeSessionId = presence?.activeSessionId ?? null;
    return {
      schoolTeacherId: teacher.id,
      name: teacher.user.name ?? "Tutor",
      role: teacher.role,
      status,
      lastHeartbeatAt: presence?.lastHeartbeatAt?.toISOString() ?? null,
      activeSessionId,
      currentStudentName: activeSessionId
        ? (activeChildNames.get(activeSessionId) ?? null)
        : null,
      sessionsCompletedToday: completedByTutor.get(teacher.id) ?? 0,
      rollingMedianMinutes: presence?.rollingMedianMinutes ?? null,
      unresolvedToday: unresolvedByTutor.get(teacher.id) ?? 0,
    };
  });
  // Alphabetical only — no performance ranking
  tutors.sort((a, b) => a.name.localeCompare(b.name));

  const openCases: AdminSupportOperations["openCases"] = [];
  const pushCase = (row: {
    childId: string;
    periodId: string | null;
    attention: string;
    status: string;
    tutorId: string | null;
    queueEntryId: string | null;
    sessionId: string | null;
    updatedAt: Date;
  }) => {
    openCases.push({
      caseId: encodeAdminSupportCaseId({ childId: row.childId, periodId: row.periodId }),
      childId: row.childId,
      studentName: nameById.get(row.childId) ?? "Student",
      periodId: row.periodId,
      lessonTitle: row.periodId ? periodTitleById.get(row.periodId) ?? null : null,
      attention: row.attention,
      status: row.status,
      tutorName: row.tutorId ? teacherNameById.get(row.tutorId) ?? null : null,
      queueEntryId: row.queueEntryId,
      sessionId: row.sessionId,
      updatedAt: row.updatedAt.toISOString(),
    });
  };

  for (const row of waitingEntries) {
    pushCase({
      childId: row.childId,
      periodId: row.periodId,
      attention: "AI exhausted / waiting",
      status: row.status,
      tutorId: null,
      queueEntryId: row.id,
      sessionId: null,
      updatedAt: row.enqueuedAt,
    });
  }
  for (const row of assignedEntries) {
    pushCase({
      childId: row.childId,
      periodId: row.periodId,
      attention: "Tutor assigned",
      status: row.status,
      tutorId: row.assignedTutorId,
      queueEntryId: row.id,
      sessionId: null,
      updatedAt: row.assignedAt ?? row.enqueuedAt,
    });
  }
  for (const row of activeSessions) {
    pushCase({
      childId: row.childId,
      periodId: row.periodId,
      attention: "Human session active",
      status: "active",
      tutorId: row.schoolTeacherId,
      queueEntryId: row.queueEntryId,
      sessionId: row.id,
      updatedAt: row.startedAt,
    });
  }
  for (const row of abandonedSessions) {
    pushCase({
      childId: row.childId,
      periodId: row.periodId,
      attention: row.status === "abandoned" ? "Abandoned" : "Disconnected",
      status: row.status,
      tutorId: row.schoolTeacherId,
      queueEntryId: row.queueEntryId,
      sessionId: row.id,
      updatedAt: row.endedAt ?? row.startedAt,
    });
  }
  for (const row of unresolvedSessions) {
    const fu = parseAdminFollowUp(row.metadataJson);
    pushCase({
      childId: row.childId,
      periodId: row.periodId,
      attention: fu && fu.status !== "closed" ? "Needs follow-up" : "Unresolved",
      status: row.outcome ?? "unresolved",
      tutorId: row.schoolTeacherId,
      queueEntryId: row.queueEntryId,
      sessionId: row.id,
      updatedAt: row.endedAt ?? row.startedAt,
    });
  }
  for (const row of followUpOpen) {
    // already included via unresolved; skip dupes below
    void row;
  }
  for (const row of needsFollowUpExtra) {
    if (openCases.some((c) => c.sessionId === row.id)) continue;
    pushCase({
      childId: row.childId,
      periodId: row.periodId,
      attention: "Needs follow-up",
      status: row.outcome ?? row.status,
      tutorId: row.schoolTeacherId,
      queueEntryId: row.queueEntryId,
      sessionId: row.id,
      updatedAt: row.endedAt ?? row.startedAt,
    });
  }

  const recentActivity: AdminSupportOperations["recentActivity"] = recentSessions.map((row) => ({
    at: row.endedAt?.toISOString() ?? now.toISOString(),
    studentName: nameById.get(row.childId) ?? "Student",
    lessonTitle: row.periodId ? periodTitleById.get(row.periodId) ?? null : null,
    tutorName: teacherNameById.get(row.schoolTeacherId) ?? null,
    outcome: row.outcome,
    sessionId: row.id,
    caseId: encodeAdminSupportCaseId({ childId: row.childId, periodId: row.periodId }),
  }));

  const waitMinutes = waitSamples
    .filter((row) => row.assignedAt)
    .map((row) => (row.assignedAt!.getTime() - row.enqueuedAt.getTime()) / 60_000)
    .filter((n) => Number.isFinite(n) && n >= 0 && n < 120);
  const averageWaitMinutes = waitMinutes.length
    ? Math.round((waitMinutes.reduce((a, b) => a + b, 0) / waitMinutes.length) * 10) / 10
    : null;

  const interventionsToday = completedToday.reduce((sum, row) => sum + row._count._all, 0);

  // Analytics — consume existing misconception layer
  const schoolStudentIds = await prisma.schoolStudent.findMany({
    where: { schoolId: input.schoolId, status: "active" },
    select: { childId: true },
    take: 500,
  });
  let analytics: AdminSupportOperations["analytics"] = null;
  try {
    const cohort = await buildMisconceptionCohortSummary({
      studentIds: schoolStudentIds.map((s) => s.childId),
      windowDays: 14,
      schoolId: input.schoolId,
      now,
    });
    const unresolvedSessionCount = cohort.students.reduce((n, s) => n + s.unresolvedSessionCount, 0);
    const needsMonitoringSessionCount = cohort.students.reduce((n, s) => n + s.needsMonitoringSessionCount, 0);
    const escalatedSessionCount = cohort.students.reduce((n, s) => n + s.escalatedSessionCount, 0);
    const recoveredish = Math.max(0, interventionsToday - unresolvedSessionCount);
    const aiRecoveryPercent = interventionsToday > 0
      ? Math.round((recoveredish / Math.max(1, interventionsToday)) * 100)
      : null;

    analytics = {
      windowDays: cohort.windowDays,
      studentCount: cohort.studentCount,
      totalSignals: cohort.totalSignals,
      bySource: cohort.bySource,
      topSkills: cohort.topSkills.slice(0, 8).map((skill) => ({
        subject: skill.subject,
        skillFocus: skill.skillFocus,
        signalCount: skill.signalCount,
        sampleText: skill.sampleText,
      })),
      unresolvedSessionCount,
      needsMonitoringSessionCount,
      escalatedSessionCount,
    };

    // Prefer analytics-informed recovery when available; else leave null on health
    void aiRecoveryPercent;
  } catch {
    analytics = null;
  }

  const resolvedToday = await prisma.humanSupportSession.count({
    where: {
      schoolId: input.schoolId,
      endedAt: { gte: dayStart },
      outcome: { in: ["resolved", "student_recovered", "partially_resolved"] },
    },
  });
  const endedHumanToday = await prisma.humanSupportSession.count({
    where: {
      schoolId: input.schoolId,
      endedAt: { gte: dayStart },
      status: { not: "active" },
    },
  });
  // AI recovery proxy: share of help that did not escalate to unresolved human outcomes
  const aiHelpToday = await prisma.coachInteractionLog.count({
    where: {
      childId: { in: schoolStudentIds.map((s) => s.childId).slice(0, 500) },
      createdAt: { gte: dayStart },
      mode: { in: ["daytime_tutor", "mistake_recovery"] },
    },
  });
  const aiRecoveryPercent = aiHelpToday > 0
    ? Math.min(99, Math.round(((aiHelpToday - Math.min(aiHelpToday, teacherRequired + interventionsToday)) / aiHelpToday) * 100))
    : (endedHumanToday > 0 ? Math.round((resolvedToday / endedHumanToday) * 100) : null);

  return {
    schoolId: school.id,
    schoolName: school.name,
    generatedAt: now.toISOString(),
    health: {
      aiRecoveryPercent,
      humanInterventionsToday: interventionsToday,
      averageWaitMinutes,
      tutorCoverage: coverageLabel(
        tutorCounts.availableTutorCount,
        waitingEntries.length,
        tutorCounts.busyTutorCount,
      ),
      safeguardingAlertsLabel: "Safeguarding alerts are managed in Safeguarding — not summarised here",
    },
    glance: {
      learningNormally,
      aiAssisting,
      aiStruggling,
      teacherRequired,
      humanSessionsActive: activeSessions.length,
      availableTutors: tutorCounts.availableTutorCount,
      busyTutors: tutorCounts.busyTutorCount,
      pausedTutors: tutorCounts.pausedTutorCount,
      offlineTutors: offlineTutorCount,
    },
    liveSupport: liveSupportRows.slice(0, 40),
    tutors,
    openCases: openCases.slice(0, 80),
    recentActivity,
    analytics,
  };
}

export async function buildAdminSupportExport(input: {
  schoolId: string;
  sensitive?: boolean;
  now?: Date;
}) {
  const ops = await getAdminSupportOperations({ schoolId: input.schoolId, now: input.now });
  if (!ops) return null;

  const dayStart = startOfLocalDay(input.now ?? new Date());
  const sessions = await prisma.humanSupportSession.findMany({
    where: {
      schoolId: input.schoolId,
      OR: [
        { endedAt: { gte: dayStart } },
        { status: "active" },
      ],
    },
    orderBy: { startedAt: "desc" },
    take: 200,
    select: {
      id: true,
      childId: true,
      periodId: true,
      schoolTeacherId: true,
      status: true,
      outcome: true,
      outcomeNotes: true,
      budgetMinutes: true,
      exceededBudget: true,
      startedAt: true,
      endedAt: true,
      unresolvedReportJson: true,
      metadataJson: true,
    },
  });

  const rows = sessions.map((session) => {
    const followUp = parseAdminFollowUp(session.metadataJson);
    const base: Record<string, unknown> = {
      sessionId: session.id,
      childId: session.childId,
      periodId: session.periodId,
      schoolTeacherId: session.schoolTeacherId,
      status: session.status,
      outcome: session.outcome,
      budgetMinutes: session.budgetMinutes,
      exceededBudget: session.exceededBudget,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      followUpStatus: followUp?.status ?? null,
      hasUnresolvedReport: Boolean(session.unresolvedReportJson),
    };
    if (input.sensitive) {
      base.outcomeNotes = session.outcomeNotes;
      if (session.unresolvedReportJson) {
        try {
          base.unresolvedReport = JSON.parse(session.unresolvedReportJson);
        } catch {
          base.unresolvedReport = null;
        }
      }
      try {
        const meta = session.metadataJson ? JSON.parse(session.metadataJson) : null;
        base.privateNotes = meta?.sessionNotes?.privateNotes ?? null;
      } catch {
        base.privateNotes = null;
      }
    }
    return base;
  });

  return {
    schoolId: ops.schoolId,
    schoolName: ops.schoolName,
    generatedAt: ops.generatedAt,
    sensitive: Boolean(input.sensitive),
    glance: ops.glance,
    health: ops.health,
    sessions: rows,
  };
}
