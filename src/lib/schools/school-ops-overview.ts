import { prisma } from "@/lib/db";
import { getAdminDayAttendanceSummary } from "@/lib/schools/attendance-register";
import { canDo, type SchoolRole } from "@/lib/schools/permissions";
import { findSchoolDashboardRecord } from "@/lib/schools/school-admin-payload";
import { minutesNow, parseHmToMinutes } from "@/lib/schools/school-day-period";
import {
  BOOKING_AUDIT_ACTIONS,
  BOOKING_ENTITY_TYPE,
  parseBookingChangeEvent,
} from "@/lib/schools/short-learning-booking-audit";
import { findDaySchoolConflicts } from "@/lib/schools/day-school-conflicts";
import { findStaffAbsentTeacherIdsOnDay } from "@/lib/schools/staff-absence";
import { countLiveTeachingHeartbeats } from "@/lib/schools/teaching-presence";
import { computeShortLearningCoverage } from "@/lib/schools/short-learning-coverage";

export const SCHOOL_OPS_LIMITATIONS = [
  "Teaching now combines a timetable estimate with live TutorPresence heartbeats linked to Day School periods; heartbeats can lag or go stale after the support policy window.",
] as const;

export type SchoolOpsAlertSeverity = "info" | "warning" | "critical";

export type SchoolOpsAlert = {
  id: string;
  severity: SchoolOpsAlertSeverity;
  title: string;
  href: string;
  count?: number;
};

export type SchoolOpsActivityItem = {
  id: string;
  at: string;
  label: string;
  href?: string;
  severity: string;
};

export type SchoolOpsQuickAction = {
  label: string;
  href: string;
  ownerOnly?: boolean;
};

export type SchoolOpsOverview = {
  school: { id: string; name: string };
  asOf: string;
  actorRole: SchoolRole;
  health: {
    students: number;
    teachers: number;
    classes: number;
    attendanceToday: {
      present: number;
      absent: number;
      late: number;
      notRecorded: number;
      marked: number;
    };
    activeParents: number;
    activeShortLearning: number;
    pendingInvites: number;
    lessonReviewsOutstanding: number;
    safeguarding?: { openAlerts: number; criticalAlerts: number };
  };
  staff: {
    teachingNowEstimate: number;
    pendingInvites: number;
    recentlyJoined: number;
    onShortLearningShifts: number;
    teachersWithoutClass: number;
    absentToday: number;
    liveTeachingHeartbeats: number;
  };
  students: {
    absentToday: number;
    withoutClass: number;
    withoutGuardian: number;
    newEnrolments: number;
  };
  daySchool: {
    awaitingReview: number;
    machineFailed: number;
    unassignedClasses: number;
    emptyClasses: number;
    registersNotStarted: number;
    missingTutorRegisters: number;
    conflictBlocking: number;
    roomWarnings: number;
    timetablePreview: Array<{
      id: string;
      title: string;
      startsAt: string;
      endsAt: string;
      classroomName: string | null;
      teacherName: string | null;
    }>;
  };
  shortLearning: {
    todayBookings: number;
    changesNeedingReview: number;
    coverageGapMinutes: number;
    liveSessions: number;
  };
  alerts: SchoolOpsAlert[];
  activity: SchoolOpsActivityItem[];
  quickActions: SchoolOpsQuickAction[];
  limitations: string[];
};

export type SchoolOpsSignalCounts = {
  unassignedClasses: number;
  emptyClasses: number;
  studentsWithoutClass: number;
  studentsWithoutGuardian: number;
  pendingInvitesOlderThan7Days: number;
  expiredUnusedInvites: number;
  awaitingReview: number;
  machineFailed: number;
  registersNotStarted: number;
  missingTutorRegisters: number;
  coverageGapMinutes: number;
  changesNeedingReview: number;
  timetableConflictBlocking: number;
  timetableRoomWarnings: number;
  staffAbsentToday: number;
  periodsWithAbsentTeacher: number;
  safeguardingOpen?: number;
  safeguardingCritical?: number;
  includeSafeguarding: boolean;
};

const ACTION_LABELS: Record<string, string> = {
  invite_sent: "Invitation sent",
  invite_accepted: "Invitation accepted",
  invite_expired: "Invitation expired",
  invite_resent: "Invitation resent",
  teacher_activated: "Staff member activated",
  teacher_suspended: "Staff member suspended",
  teacher_archived: "Staff member archived",
  teacher_password_reset: "Staff password reset requested",
  staff_absence_created: "Staff absence recorded",
  staff_absence_updated: "Staff absence updated",
  staff_absence_cleared: "Staff absence cleared",
  classroom_created: "Class created",
  classroom_updated: "Class updated",
  classroom_archived: "Class archived",
  classroom_reactivated: "Class reactivated",
  student_enrolled: "Student enrolled",
  student_transferred: "Student transferred",
  student_archived: "Student archived",
  student_updated: "Student updated",
  login: "Staff login",
  login_blocked: "Login blocked",
  seat_upgraded: "Licence seats upgraded",
  licence_suspended: "Licence suspended",
  licence_renewed: "Licence renewed",
  licence_updated: "Licence updated",
  assignment_issued: "Assignment issued",
  content_moderation_flag: "Content moderation flag",
  safeguarding_alert: "Safeguarding alert",
  daytime_lesson_content_generated: "Lesson content generated",
  daytime_lesson_approved: "Lesson approved",
  daytime_day_approved: "Day approved",
  short_learning_booking_created: "Short Learning booking created",
  short_learning_booking_cancelled: "Short Learning booking cancelled",
  short_learning_booking_changed: "Short Learning booking changed",
  short_learning_booking_rebooked: "Short Learning booking rebooked",
  short_learning_booking_active: "Short Learning session active",
  short_learning_booking_attended: "Short Learning session attended",
  short_learning_booking_completed: "Short Learning session completed",
  short_learning_booking_no_show: "Short Learning no-show",
  short_learning_booking_expired: "Short Learning booking expired",
};

function titleCaseAction(action: string): string {
  return action
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function humanizeSchoolAuditActivity(input: {
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}): { label: string; href?: string } {
  const mode = typeof input.metadata?.mode === "string" ? input.metadata.mode : null;
  let label = ACTION_LABELS[input.action] ?? titleCaseAction(input.action);

  if (input.action === "classroom_updated") {
    if (mode === "teacher_assigned") label = "Teacher assigned to class";
    else if (mode === "teacher_removed") label = "Teacher removed from class";
  }

  return {
    label,
    href: auditActivityHref(input.entityType, input.entityId),
  };
}

export function auditActivityHref(
  entityType?: string | null,
  entityId?: string | null,
): string | undefined {
  if (!entityType) return "/school-admin";
  switch (entityType) {
    case "student":
      return entityId
        ? `/school-admin/day-school/students/${entityId}`
        : "/school-admin/day-school/students";
    case "classroom":
      return entityId
        ? `/school-admin/day-school/classes/${entityId}`
        : "/school-admin/day-school/classes";
    case "teacher":
      return "/school-admin/day-school/teachers";
    case "lesson":
      return "/school-admin/day-school/lesson-review";
    case "attendance":
    case "register":
      return "/school-admin/day-school/attendance";
    case "timetable":
    case "period":
      return "/school-admin/day-school/timetable";
    case "learning_booking":
      return entityId
        ? `/school-admin/short-learning/bookings/${entityId}`
        : "/school-admin/short-learning/bookings";
    case "tutor_shift":
    case "shift":
      return "/school-admin/short-learning/shifts";
    case "licence":
    case "school":
      return "/school-admin/settings";
    default:
      return "/school-admin";
  }
}

export function deriveSchoolOpsAlerts(signals: SchoolOpsSignalCounts): SchoolOpsAlert[] {
  const alerts: SchoolOpsAlert[] = [];

  if (signals.unassignedClasses > 0) {
    alerts.push({
      id: "class-no-teacher",
      severity: "warning",
      title: "Class with no teacher",
      href: "/school-admin/day-school/classes",
      count: signals.unassignedClasses,
    });
  }
  if (signals.emptyClasses > 0) {
    alerts.push({
      id: "class-no-students",
      severity: "info",
      title: "Class with no students",
      href: "/school-admin/day-school/classes",
      count: signals.emptyClasses,
    });
  }
  if (signals.studentsWithoutClass > 0) {
    alerts.push({
      id: "student-no-class",
      severity: "warning",
      title: "Student with no class",
      href: "/school-admin/day-school/students",
      count: signals.studentsWithoutClass,
    });
  }
  if (signals.studentsWithoutGuardian > 0) {
    alerts.push({
      id: "student-no-guardian",
      severity: "warning",
      title: "Student with no guardian link",
      href: "/school-admin/day-school/students",
      count: signals.studentsWithoutGuardian,
    });
  }
  if (signals.pendingInvitesOlderThan7Days > 0) {
    alerts.push({
      id: "invite-stale",
      severity: "warning",
      title: "Pending invite older than 7 days",
      href: "/school-admin/day-school/teachers",
      count: signals.pendingInvitesOlderThan7Days,
    });
  }
  if (signals.expiredUnusedInvites > 0) {
    alerts.push({
      id: "invite-expired",
      severity: "info",
      title: "Expired unused invite",
      href: "/school-admin/day-school/teachers",
      count: signals.expiredUnusedInvites,
    });
  }
  if (signals.awaitingReview > 0) {
    alerts.push({
      id: "lessons-awaiting-review",
      severity: "warning",
      title: "Lessons awaiting review",
      href: "/school-admin/day-school/lesson-review",
      count: signals.awaitingReview,
    });
  }
  if (signals.machineFailed > 0) {
    alerts.push({
      id: "lessons-machine-failed",
      severity: "critical",
      title: "Lessons failed machine checks",
      href: "/school-admin/day-school/lesson-review",
      count: signals.machineFailed,
    });
  }
  if (signals.registersNotStarted > 0) {
    alerts.push({
      id: "attendance-not-started",
      severity: "warning",
      title: "Attendance registers not started",
      href: "/school-admin/day-school/attendance",
      count: signals.registersNotStarted,
    });
  }
  if (signals.missingTutorRegisters > 0) {
    alerts.push({
      id: "attendance-missing-tutor",
      severity: "warning",
      title: "Attendance registers missing tutor",
      href: "/school-admin/day-school/attendance",
      count: signals.missingTutorRegisters,
    });
  }
  if (signals.staffAbsentToday > 0) {
    alerts.push({
      id: "staff-absent-today",
      severity: "warning",
      title: "Staff absent today",
      href: "/school-admin/day-school/teachers",
      count: signals.staffAbsentToday,
    });
  }
  if (signals.periodsWithAbsentTeacher > 0) {
    alerts.push({
      id: "periods-absent-teacher",
      severity: "warning",
      title: "Today's periods with absent teacher",
      href: "/school-admin/day-school/timetable",
      count: signals.periodsWithAbsentTeacher,
    });
  }
  if (signals.timetableConflictBlocking > 0) {
    alerts.push({
      id: "timetable-conflict-blocking",
      severity: "critical",
      title: "Timetable teacher/class overlaps",
      href: "/school-admin/day-school/timetable",
      count: signals.timetableConflictBlocking,
    });
  }
  if (signals.timetableRoomWarnings > 0) {
    alerts.push({
      id: "timetable-room-warning",
      severity: "info",
      title: "Timetable room-string overlap warnings",
      href: "/school-admin/day-school/timetable",
      count: signals.timetableRoomWarnings,
    });
  }
  if (signals.coverageGapMinutes > 0) {
    alerts.push({
      id: "sl-coverage-gap",
      severity: "warning",
      title: "Short Learning coverage gap",
      href: "/school-admin/short-learning/coverage",
      count: signals.coverageGapMinutes,
    });
  }
  if (signals.changesNeedingReview > 0) {
    alerts.push({
      id: "sl-booking-changes",
      severity: "warning",
      title: "Short Learning booking changes needing review",
      href: "/school-admin/short-learning/bookings",
      count: signals.changesNeedingReview,
    });
  }
  if (signals.includeSafeguarding) {
    const critical = signals.safeguardingCritical ?? 0;
    const open = signals.safeguardingOpen ?? 0;
    if (critical > 0) {
      alerts.push({
        id: "safeguarding-critical",
        severity: "critical",
        title: "Critical safeguarding alerts open",
        href: "/school-admin/settings",
        count: critical,
      });
    } else if (open > 0) {
      alerts.push({
        id: "safeguarding-open",
        severity: "warning",
        title: "Open safeguarding alerts",
        href: "/school-admin/settings",
        count: open,
      });
    }
  }

  return alerts;
}

export function buildSchoolOpsQuickActions(role: SchoolRole): SchoolOpsQuickAction[] {
  const actions: SchoolOpsQuickAction[] = [
    { label: "Add Student", href: "/school-admin/day-school/students/new" },
    { label: "Invite Teacher", href: "/school-admin/day-school/teachers" },
    { label: "Create Class", href: "/school-admin/day-school/classes/new" },
    { label: "Create School Admin", href: "/school-admin/day-school/teachers", ownerOnly: true },
    { label: "Review Lessons", href: "/school-admin/day-school/lesson-review" },
    { label: "Today's Timetable", href: "/school-admin/day-school/timetable" },
    { label: "Short Learning bookings", href: "/school-admin/short-learning/bookings" },
    { label: "Attendance", href: "/school-admin/day-school/attendance" },
    { label: "School Settings", href: "/school-admin/settings" },
  ];
  return actions.filter((action) => !action.ownerOnly || role === "owner");
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  );
}

function parseMetadataJson(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function buildSchoolOpsOverview(input: {
  schoolId: string;
  role: SchoolRole;
  now?: Date;
}): Promise<SchoolOpsOverview> {
  const now = input.now ?? new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000);
  const includeSafeguarding = canDo(input.role, "manageSafeguarding");
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const [
    schoolRecord,
    studentCount,
    teacherCount,
    classCount,
    studentsWithoutClass,
    emptyClasses,
    unassignedClasses,
    teachersWithoutClass,
    pendingInvites,
    pendingInvitesOlderThan7Days,
    expiredUnusedInvites,
    recentlyJoinedTeachers,
    newEnrolments,
    activeParentLinks,
    studentsWithoutGuardian,
    awaitingReview,
    machineFailed,
    attendance,
    auditLogs,
    slBookings,
    slShifts,
    coverage,
    bookingAuditRows,
  ] = await Promise.all([
    findSchoolDashboardRecord(input.schoolId),
    prisma.schoolStudent.count({ where: { schoolId: input.schoolId, status: "active" } }),
    prisma.schoolTeacher.count({ where: { schoolId: input.schoolId, status: "active" } }),
    prisma.classroom.count({ where: { schoolId: input.schoolId, status: "active" } }),
    prisma.schoolStudent.count({
      where: { schoolId: input.schoolId, status: "active", classroomId: null },
    }),
    prisma.classroom.count({
      where: {
        schoolId: input.schoolId,
        status: "active",
        students: { none: { status: "active" } },
      },
    }),
    prisma.classroom.count({
      where: { schoolId: input.schoolId, status: "active", teacherId: null },
    }),
    prisma.schoolTeacher.count({
      where: {
        schoolId: input.schoolId,
        status: "active",
        role: { in: ["teacher", "support"] },
        classrooms: { none: { status: "active" } },
      },
    }),
    prisma.schoolInviteToken.count({
      where: {
        schoolId: input.schoolId,
        usedAt: null,
        expiresAt: { gt: now },
      },
    }),
    prisma.schoolInviteToken.count({
      where: {
        schoolId: input.schoolId,
        usedAt: null,
        expiresAt: { gt: now },
        createdAt: { lt: sevenDaysAgo },
      },
    }),
    prisma.schoolInviteToken.count({
      where: {
        schoolId: input.schoolId,
        usedAt: null,
        expiresAt: { lte: now },
      },
    }),
    prisma.schoolTeacher.count({
      where: {
        schoolId: input.schoolId,
        status: "active",
        OR: [
          { acceptedAt: { gte: fourteenDaysAgo } },
          { acceptedAt: null, invitedAt: { gte: fourteenDaysAgo } },
        ],
      },
    }),
    prisma.schoolStudent.count({
      where: {
        schoolId: input.schoolId,
        status: "active",
        joinedAt: { gte: fourteenDaysAgo },
      },
    }),
    prisma.parentSchoolLink.count({
      where: { schoolId: input.schoolId, status: "active" },
    }),
    prisma.schoolStudent.count({
      where: {
        schoolId: input.schoolId,
        status: "active",
        parentLinks: {
          none: { status: { in: ["active", "pending_consent"] } },
        },
      },
    }),
    prisma.schoolDayLesson.count({
      where: {
        schoolId: input.schoolId,
        status: { not: "cancelled" },
        lesson: { reviewStatus: "awaiting_review" },
      },
    }),
    prisma.schoolDayLesson.count({
      where: {
        schoolId: input.schoolId,
        status: { not: "cancelled" },
        lesson: { reviewStatus: "machine_failed" },
      },
    }),
    getAdminDayAttendanceSummary({ schoolId: input.schoolId, sessionDate: now }),
    prisma.schoolAuditLog.findMany({
      where: { schoolId: input.schoolId },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        severity: true,
        metadataJson: true,
        createdAt: true,
      },
    }),
    prisma.studentLearningBooking.findMany({
      where: {
        schoolId: input.schoolId,
        status: { in: ["booked", "confirmed", "attended"] },
        startsAt: { gte: dayStart, lt: dayEnd },
      },
      select: { id: true, startsAt: true, endsAt: true, status: true },
      take: 200,
    }),
    prisma.tutorSupportShift.findMany({
      where: {
        schoolId: input.schoolId,
        published: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
        status: { not: "cancelled" },
      },
      select: { id: true },
      take: 100,
    }),
    computeShortLearningCoverage({ schoolId: input.schoolId, view: "48h", now }).catch(() => null),
    prisma.schoolAuditLog.findMany({
      where: {
        schoolId: input.schoolId,
        entityType: BOOKING_ENTITY_TYPE,
        action: { in: [...BOOKING_AUDIT_ACTIONS] },
        createdAt: { gte: sevenDaysAgo },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  if (!schoolRecord) {
    throw new Error("School not found.");
  }

  const attendanceTotals = {
    present: 0,
    absent: 0,
    late: 0,
    notRecorded: 0,
    marked: 0,
  };
  let registersNotStarted = 0;
  let missingTutorRegisters = 0;
  const nowMinutes = minutesNow(now);
  const teachingTeacherIds = new Set<string>();
  const currentTeachingPeriodIds: string[] = [];

  for (const period of attendance.periods) {
    if (!period.registerEligible) continue;
    attendanceTotals.present += period.summary.present;
    attendanceTotals.absent += period.summary.absent;
    attendanceTotals.late += period.summary.late;
    attendanceTotals.notRecorded += period.summary.notRecorded;
    attendanceTotals.marked +=
      period.summary.present
      + period.summary.absent
      + period.summary.late
      + period.summary.authorisedAbsence
      + period.summary.medical;

    if (period.completion === "not_started") registersNotStarted += 1;
    if (period.completion === "missing_tutor") missingTutorRegisters += 1;

    if (period.teacherId) {
      const start = parseHmToMinutes(period.startsAt);
      const end = parseHmToMinutes(period.endsAt);
      if (start >= 0 && end >= 0 && nowMinutes >= start && nowMinutes < end) {
        teachingTeacherIds.add(period.teacherId);
        currentTeachingPeriodIds.push(period.schoolDayLessonId);
      }
    }
  }

  const liveTeachingHeartbeats = await countLiveTeachingHeartbeats({
    schoolId: input.schoolId,
    currentPeriodIds: currentTeachingPeriodIds,
    teachingTeacherIds: [...teachingTeacherIds],
    now,
  });

  const liveSessions = slBookings.filter((booking) => {
    const start = booking.startsAt.getTime();
    const end = booking.endsAt.getTime();
    const t = now.getTime();
    return t >= start && t <= end;
  }).length;

  const todayBookings = slBookings.filter((booking) => sameCalendarDay(booking.startsAt, now)).length;

  const changesNeedingReview = bookingAuditRows
    .map((row) => parseBookingChangeEvent(row, now))
    .filter((event) => event.requiresReview).length;

  const coverageGapMinutes = coverage?.gapMinutes ?? 0;
  const absentTeacherIds = await findStaffAbsentTeacherIdsOnDay({
    schoolId: input.schoolId,
    day: now,
  });

  const weekday = now.getDay() === 0 || now.getDay() === 6 ? 1 : now.getDay();
  const weekdayLessons = schoolRecord.dayLessons.filter(
    (lesson) => lesson.dayOfWeek === weekday && lesson.status !== "cancelled",
  );
  const dayConflicts = findDaySchoolConflicts(
    weekdayLessons.map((lesson) => ({
      id: lesson.id,
      dayOfWeek: lesson.dayOfWeek,
      startsAt: lesson.startsAt,
      endsAt: lesson.endsAt,
      teacherId: lesson.teacherId,
      classroomId: lesson.classroomId,
      room: lesson.room,
      status: lesson.status,
      lessonType: lesson.lessonType,
    })),
  );
  const conflictBlocking = dayConflicts.filter((c) => c.severity === "blocking").length;
  const roomWarnings = dayConflicts.filter((c) => c.kind === "room").length;
  const absentTeacherIdSet = new Set(absentTeacherIds);
  const periodsWithAbsentTeacher = weekdayLessons.filter(
    (lesson) => lesson.teacherId && absentTeacherIdSet.has(lesson.teacherId),
  ).length;
  const timetablePreview = weekdayLessons.slice(0, 6).map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    startsAt: lesson.startsAt,
    endsAt: lesson.endsAt,
    classroomName: lesson.classroomName,
    teacherName: lesson.teacherName,
  }));

  const signals: SchoolOpsSignalCounts = {
    unassignedClasses,
    emptyClasses,
    studentsWithoutClass,
    studentsWithoutGuardian,
    pendingInvitesOlderThan7Days,
    expiredUnusedInvites,
    awaitingReview,
    machineFailed,
    registersNotStarted,
    missingTutorRegisters,
    coverageGapMinutes,
    changesNeedingReview,
    timetableConflictBlocking: conflictBlocking,
    timetableRoomWarnings: roomWarnings,
    staffAbsentToday: absentTeacherIds.length,
    periodsWithAbsentTeacher,
    safeguardingOpen: schoolRecord.safeguarding.openAlerts,
    safeguardingCritical: schoolRecord.safeguarding.criticalAlerts,
    includeSafeguarding,
  };

  const activity = auditLogs.map((row) => {
    const humanized = humanizeSchoolAuditActivity({
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      metadata: parseMetadataJson(row.metadataJson),
    });
    return {
      id: row.id,
      at: row.createdAt.toISOString(),
      label: humanized.label,
      href: humanized.href,
      severity: row.severity,
    };
  });


  return {
    school: { id: schoolRecord.id, name: schoolRecord.name },
    asOf: now.toISOString(),
    actorRole: input.role,
    health: {
      students: studentCount,
      teachers: teacherCount,
      classes: classCount,
      attendanceToday: attendanceTotals,
      activeParents: activeParentLinks,
      activeShortLearning: liveSessions,
      pendingInvites,
      lessonReviewsOutstanding: awaitingReview + machineFailed,
      ...(includeSafeguarding
        ? {
            safeguarding: {
              openAlerts: schoolRecord.safeguarding.openAlerts,
              criticalAlerts: schoolRecord.safeguarding.criticalAlerts,
            },
          }
        : {}),
    },
    staff: {
      teachingNowEstimate: teachingTeacherIds.size,
      pendingInvites,
      recentlyJoined: recentlyJoinedTeachers,
      onShortLearningShifts: slShifts.length,
      teachersWithoutClass,
      absentToday: absentTeacherIds.length,
      liveTeachingHeartbeats,
    },
    students: {
      absentToday: attendanceTotals.absent,
      withoutClass: studentsWithoutClass,
      withoutGuardian: studentsWithoutGuardian,
      newEnrolments,
    },
    daySchool: {
      awaitingReview,
      machineFailed,
      unassignedClasses,
      emptyClasses,
      registersNotStarted,
      missingTutorRegisters,
      conflictBlocking,
      roomWarnings,
      timetablePreview,
    },
    shortLearning: {
      todayBookings,
      changesNeedingReview,
      coverageGapMinutes,
      liveSessions,
    },
    alerts: deriveSchoolOpsAlerts(signals),
    activity,
    quickActions: buildSchoolOpsQuickActions(input.role),
    limitations: [...SCHOOL_OPS_LIMITATIONS],
  };
}