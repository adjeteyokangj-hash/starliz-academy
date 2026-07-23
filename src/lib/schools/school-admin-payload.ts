import { prisma } from "@/lib/db";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

type SecuritySettingsRow = {
  id: string;
  maxLoginAttempts: number;
  twoFaEnabled: boolean;
};

export type SecurityGatePayload = {
  blocked: boolean;
  reason: "none" | "elevated_auth_anomaly";
  twoFaEnabled: boolean;
  authAnomalySignals: number;
  threshold: number;
};

export type SchoolAdminRecord = {
  id: string;
  name: string;
  slug: string;
  status: string;
  type: string;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
  updatedAt: string;
  licence: {
    id: string;
    status: string;
    seatLimit: number;
    seatsUsed: number;
    seatsAvailable: number;
    provider: string;
    pricingPlanId: string | null;
    currency: string;
    billingInterval: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    startsAt: string | null;
    endsAt: string | null;
    notes: string | null;
    updatedAt: string;
  } | null;
  classrooms: Array<{
    id: string;
    name: string;
    yearGroup: string | null;
    academicYear: string | null;
    status: string;
    teacherId: string | null;
    teacherName: string | null;
    studentsCount: number;
    updatedAt: string;
  }>;
  teachers: Array<{
    id: string;
    userId: string;
    email: string;
    name: string | null;
    role: string;
    status: string;
    title: string | null;
    invitedAt: string | null;
    acceptedAt: string | null;
    lastActiveAt: string | null;
    updatedAt: string;
  }>;
  students: Array<{
    id: string;
    childId: string;
    childName: string;
    parentEmail: string;
    classroomId: string | null;
    classroomName: string | null;
    status: string;
    externalRef: string | null;
    joinedAt: string;
    updatedAt: string;
  }>;
  communicationPreferences: Array<{
    linkId: string;
    parentName: string | null;
    parentEmail: string;
    studentName: string;
    optedOutAt: string | null;
    optOutReason: string | null;
    safeguardingLockedAt: string | null;
    safeguardingLockReason: string | null;
    updatedAt: string;
  }>;
  communicationLogs: Array<{
    id: string;
    subject: string;
    messageBody: string;
    deliveryStatus: string;
    deliveryReason: string | null;
    parentEmail: string;
    studentName: string;
    actorName: string | null;
    createdAt: string;
  }>;
  safeguarding: {
    openAlerts: number;
    criticalAlerts: number;
  };
  safeguardingIncidents: Array<{
    id: string;
    category: string;
    severity: string;
    status: string;
    studentName: string | null;
    escalationLevel: string | null;
    reportedBy: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  activityTimeline: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    severity: string;
    actorUserId: string | null;
    createdAt: string;
  }>;
  dayLessons: Array<{
    id: string;
    title: string;
    subject: string;
    lessonType: string;
    yearGroup: string | null;
    keyStage: string | null;
    skillFocus: string | null;
    dayOfWeek: number;
    periodIndex: number;
    startsAt: string;
    endsAt: string;
    room: string | null;
    status: string;
    classroomId: string | null;
    classroomName: string | null;
    teacherId: string | null;
    teacherName: string | null;
    lessonId: string | null;
    dueDate: string | null;
    updatedAt: string;
  }>;
};

export type SchoolsAdminListPayload = {
  securityGate: SecurityGatePayload;
  schools: SchoolAdminRecord[];
};

export const schoolAdminInclude = {
  owner: { select: { id: true, name: true, email: true } },
  licence: true,
  classrooms: {
    orderBy: [{ updatedAt: "desc" as const }],
    include: {
      teacher: {
        include: {
          user: { select: { name: true } },
        },
      },
      _count: { select: { students: { where: { status: "active" } } } },
    },
  },
  teachers: {
    orderBy: [{ updatedAt: "desc" as const }],
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  },
  students: {
    orderBy: [{ updatedAt: "desc" as const }],
    include: {
      child: {
        select: {
          id: true,
          name: true,
          parent: { select: { email: true } },
        },
      },
      classroom: { select: { id: true, name: true } },
    },
  },
  parentLinks: {
    orderBy: [{ updatedAt: "desc" as const }],
    include: {
      parent: { select: { id: true, name: true, email: true } },
      schoolStudent: {
        include: {
          child: { select: { id: true, name: true } },
        },
      },
      communicationPreference: true,
    },
  },
  communicationLogs: {
    orderBy: [{ createdAt: "desc" as const }],
    take: 25,
    include: {
      actor: { select: { id: true, name: true, email: true } },
      parentSchoolLink: {
        include: {
          parent: { select: { id: true, name: true, email: true } },
          schoolStudent: {
            include: {
              child: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  },
  safeguardingAlerts: {
    where: { status: { in: ["open", "under_review", "escalated"] } },
    select: {
      severity: true,
    },
  },
  safeguardingIncidents: {
    orderBy: [{ updatedAt: "desc" as const }],
    take: 25,
    include: {
      student: { select: { name: true } },
      reportedBy: { select: { name: true, email: true } },
    },
  },
  auditLogs: {
    orderBy: [{ createdAt: "desc" as const }],
    take: 50,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      severity: true,
      actorUserId: true,
      createdAt: true,
    },
  },
  dayLessons: {
    orderBy: [{ dayOfWeek: "asc" as const }, { periodIndex: "asc" as const }],
    take: 120,
    include: {
      classroom: { select: { id: true, name: true } },
      teacher: {
        include: {
          user: { select: { name: true } },
        },
      },
    },
  },
};

/** List view: omit dayLessons so the registry loads before the timetable migration is applied. */
export const schoolAdminListInclude = Object.fromEntries(
  Object.entries(schoolAdminInclude).filter(([key]) => key !== "dayLessons"),
);

type DayLessonSource = {
  id: string;
  title: string;
  subject: string;
  lessonType: string;
  yearGroup: string | null;
  keyStage: string | null;
  skillFocus: string | null;
  dayOfWeek: number;
  periodIndex: number;
  startsAt: string;
  endsAt: string;
  room: string | null;
  status: string;
  classroomId: string | null;
  teacherId: string | null;
  lessonId: string | null;
  dueDate: Date | null;
  updatedAt: Date;
  classroom: { id: string; name: string } | null;
  teacher: { user: { name: string | null } } | null;
};

type SchoolAdminSource = {
  id: string;
  name: string;
  slug: string;
  status: string;
  type: string;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  ownerUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  owner: { id: string; name: string | null; email: string } | null;
  licence: {
    id: string;
    status: string;
    seatLimit: number;
    provider: string;
    pricingPlanId: string | null;
    currency: string;
    billingInterval: string;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    startsAt: Date | null;
    endsAt: Date | null;
    notes: string | null;
    updatedAt: Date;
  } | null;
  classrooms: Array<{
    id: string;
    name: string;
    yearGroup: string | null;
    academicYear: string | null;
    status: string;
    teacherId: string | null;
    updatedAt: Date;
    teacher: { user: { name: string | null } } | null;
    _count: { students: number };
  }>;
  teachers: Array<{
    id: string;
    role: string;
    status: string;
    title: string | null;
    invitedAt: Date | null;
    acceptedAt: Date | null;
    lastActiveAt: Date | null;
    updatedAt: Date;
    user: { id: string; email: string; name: string | null };
  }>;
  students: Array<{
    id: string;
    classroomId: string | null;
    status: string;
    externalRef: string | null;
    joinedAt: Date;
    updatedAt: Date;
    child: { id: string; name: string; parent: { email: string } };
    classroom: { id: string; name: string } | null;
  }>;
  parentLinks: Array<{
    id: string;
    updatedAt: Date;
    parent: { name: string | null; email: string };
    schoolStudent: { child: { name: string } };
    communicationPreference: {
      optedOutAt: Date | null;
      optOutReason: string | null;
      safeguardingLockedAt: Date | null;
      safeguardingLockReason: string | null;
    } | null;
  }>;
  communicationLogs: Array<{
    id: string;
    subject: string;
    messageBody: string;
    deliveryStatus: string;
    deliveryReason: string | null;
    createdAt: Date;
    actor: { name: string | null; email: string } | null;
    parentSchoolLink: {
      parent: { email: string };
      schoolStudent: { child: { name: string } };
    };
  }>;
  safeguardingAlerts: Array<{ severity: string }>;
  safeguardingIncidents: Array<{
    id: string;
    category: string;
    severity: string;
    status: string;
    escalationLevel: string | null;
    createdAt: Date;
    updatedAt: Date;
    student: { name: string } | null;
    reportedBy: { name: string | null; email: string } | null;
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    severity: string;
    actorUserId: string | null;
    createdAt: Date;
  }>;
  dayLessons: DayLessonSource[];
};

/** Lighter include for school Command Centre — skips parent-comms graph. */
export const schoolDashboardInclude = {
  owner: { select: { id: true, name: true, email: true } },
  licence: true,
  classrooms: {
    orderBy: [{ updatedAt: "desc" as const }],
    include: {
      teacher: {
        include: {
          user: { select: { name: true } },
        },
      },
      _count: { select: { students: { where: { status: "active" } } } },
    },
  },
  teachers: {
    orderBy: [{ updatedAt: "desc" as const }],
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  },
  students: {
    orderBy: [{ updatedAt: "desc" as const }],
    include: {
      child: {
        select: {
          id: true,
          name: true,
          parent: { select: { email: true } },
        },
      },
      classroom: { select: { id: true, name: true } },
    },
  },
  safeguardingAlerts: {
    where: { status: { in: ["open", "under_review", "escalated"] } },
    select: {
      severity: true,
    },
  },
  safeguardingIncidents: {
    orderBy: [{ updatedAt: "desc" as const }],
    take: 25,
    include: {
      student: { select: { name: true } },
      reportedBy: { select: { name: true, email: true } },
    },
  },
  auditLogs: {
    orderBy: [{ createdAt: "desc" as const }],
    take: 40,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      severity: true,
      actorUserId: true,
      createdAt: true,
    },
  },
  dayLessons: {
    orderBy: [{ dayOfWeek: "asc" as const }, { periodIndex: "asc" as const }],
    take: 120,
    include: {
      classroom: { select: { id: true, name: true } },
      teacher: {
        include: {
          user: { select: { name: true } },
        },
      },
    },
  },
};

type SchoolDashboardSource = Omit<SchoolAdminSource, "parentLinks" | "communicationLogs">;

function mapDayLessons(
  dayLessons: DayLessonSource[] | undefined,
): SchoolAdminRecord["dayLessons"] {
  return (dayLessons ?? []).map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    subject: lesson.subject,
    lessonType: lesson.lessonType,
    yearGroup: lesson.yearGroup,
    keyStage: lesson.keyStage,
    skillFocus: lesson.skillFocus,
    dayOfWeek: lesson.dayOfWeek,
    periodIndex: lesson.periodIndex,
    startsAt: lesson.startsAt,
    endsAt: lesson.endsAt,
    room: lesson.room,
    status: lesson.status,
    classroomId: lesson.classroomId,
    classroomName: lesson.classroom?.name ?? null,
    teacherId: lesson.teacherId,
    teacherName: lesson.teacher?.user.name ?? null,
    lessonId: lesson.lessonId,
    dueDate: lesson.dueDate?.toISOString() ?? null,
    updatedAt: lesson.updatedAt.toISOString(),
  }));
}

function getSecuritySettingsModel() {
  return (prisma as unknown as {
    securitySettings?: {
      findFirst: () => Promise<SecuritySettingsRow | null>;
    };
  }).securitySettings;
}

export async function loadSecurityGateContext(): Promise<SecurityGatePayload> {
  const model = getSecuritySettingsModel();
  const settings = model ? await model.findFirst() : null;
  const threshold = Math.max(3, settings?.maxLoginAttempts ?? 5);
  const authAnomalySignals = await prisma.schoolLoginHistory.count({
    where: {
      success: false,
      createdAt: { gte: new Date(Date.now() - FIFTEEN_MINUTES_MS) },
    },
  });
  const twoFaEnabled = Boolean(settings?.twoFaEnabled);
  const blocked = twoFaEnabled && authAnomalySignals >= threshold;

  return {
    blocked,
    reason: blocked ? "elevated_auth_anomaly" : "none",
    twoFaEnabled,
    authAnomalySignals,
    threshold,
  };
}

export function mapSchoolToAdminRecord(school: SchoolAdminSource): SchoolAdminRecord {
  const seatsUsed = school.students.filter((row) => row.status === "active").length;
  const seatLimit = school.licence?.seatLimit ?? 0;
  return {
    id: school.id,
    name: school.name,
    slug: school.slug,
    status: school.status,
    type: school.type,
    contactEmail: school.contactEmail,
    contactPhone: school.contactPhone,
    notes: school.notes,
    ownerUserId: school.ownerUserId,
    ownerName: school.owner?.name ?? null,
    ownerEmail: school.owner?.email ?? null,
    createdAt: school.createdAt.toISOString(),
    updatedAt: school.updatedAt.toISOString(),
    licence: school.licence
      ? {
        id: school.licence.id,
        status: school.licence.status,
        seatLimit,
        seatsUsed,
        seatsAvailable: seatLimit === 0 ? Number.MAX_SAFE_INTEGER : Math.max(0, seatLimit - seatsUsed),
        provider: school.licence.provider,
        pricingPlanId: school.licence.pricingPlanId,
        currency: school.licence.currency,
        billingInterval: school.licence.billingInterval,
        trialEndsAt: school.licence.trialEndsAt?.toISOString() ?? null,
        currentPeriodEnd: school.licence.currentPeriodEnd?.toISOString() ?? null,
        startsAt: school.licence.startsAt?.toISOString() ?? null,
        endsAt: school.licence.endsAt?.toISOString() ?? null,
        notes: school.licence.notes,
        updatedAt: school.licence.updatedAt.toISOString(),
      }
      : null,
    classrooms: school.classrooms.map((classroom) => ({
      id: classroom.id,
      name: classroom.name,
      yearGroup: classroom.yearGroup,
      academicYear: classroom.academicYear,
      status: classroom.status,
      teacherId: classroom.teacherId,
      teacherName: classroom.teacher?.user.name ?? null,
      studentsCount: classroom._count.students,
      updatedAt: classroom.updatedAt.toISOString(),
    })),
    teachers: school.teachers.map((teacher) => ({
      id: teacher.id,
      userId: teacher.user.id,
      email: teacher.user.email,
      name: teacher.user.name,
      role: teacher.role,
      status: teacher.status,
      title: teacher.title,
      invitedAt: teacher.invitedAt?.toISOString() ?? null,
      acceptedAt: teacher.acceptedAt?.toISOString() ?? null,
      lastActiveAt: teacher.lastActiveAt?.toISOString() ?? null,
      updatedAt: teacher.updatedAt.toISOString(),
    })),
    students: school.students.map((student) => ({
      id: student.id,
      childId: student.child.id,
      childName: student.child.name,
      parentEmail: student.child.parent.email,
      classroomId: student.classroomId,
      classroomName: student.classroom?.name ?? null,
      status: student.status,
      externalRef: student.externalRef,
      joinedAt: student.joinedAt.toISOString(),
      updatedAt: student.updatedAt.toISOString(),
    })),
    communicationPreferences: school.parentLinks.map((link) => ({
      linkId: link.id,
      parentName: link.parent.name,
      parentEmail: link.parent.email,
      studentName: link.schoolStudent.child.name,
      optedOutAt: link.communicationPreference?.optedOutAt?.toISOString() ?? null,
      optOutReason: link.communicationPreference?.optOutReason ?? null,
      safeguardingLockedAt: link.communicationPreference?.safeguardingLockedAt?.toISOString() ?? null,
      safeguardingLockReason: link.communicationPreference?.safeguardingLockReason ?? null,
      updatedAt: link.updatedAt.toISOString(),
    })),
    communicationLogs: school.communicationLogs.map((log) => ({
      id: log.id,
      subject: log.subject,
      messageBody: log.messageBody,
      deliveryStatus: log.deliveryStatus,
      deliveryReason: log.deliveryReason,
      parentEmail: log.parentSchoolLink.parent.email,
      studentName: log.parentSchoolLink.schoolStudent.child.name,
      actorName: log.actor?.name ?? log.actor?.email ?? null,
      createdAt: log.createdAt.toISOString(),
    })),
    safeguarding: {
      openAlerts: school.safeguardingAlerts.length,
      criticalAlerts: school.safeguardingAlerts.filter((alert) => alert.severity === "critical").length,
    },
    safeguardingIncidents: school.safeguardingIncidents.map((incident) => ({
      id: incident.id,
      category: incident.category,
      severity: incident.severity,
      status: incident.status,
      studentName: incident.student?.name ?? null,
      escalationLevel: incident.escalationLevel ?? null,
      reportedBy: incident.reportedBy?.name ?? incident.reportedBy?.email ?? null,
      createdAt: incident.createdAt.toISOString(),
      updatedAt: incident.updatedAt.toISOString(),
    })),
    activityTimeline: school.auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId ?? null,
      severity: log.severity,
      actorUserId: log.actorUserId ?? null,
      createdAt: log.createdAt.toISOString(),
    })),
    dayLessons: mapDayLessons(school.dayLessons),
  };
}

export function mapSchoolToDashboardRecord(school: SchoolDashboardSource): SchoolAdminRecord {
  const seatsUsed = school.students.filter((row) => row.status === "active").length;
  const seatLimit = school.licence?.seatLimit ?? 0;
  return {
    id: school.id,
    name: school.name,
    slug: school.slug,
    status: school.status,
    type: school.type,
    contactEmail: school.contactEmail,
    contactPhone: school.contactPhone,
    notes: school.notes,
    ownerUserId: school.ownerUserId,
    ownerName: school.owner?.name ?? null,
    ownerEmail: school.owner?.email ?? null,
    createdAt: school.createdAt.toISOString(),
    updatedAt: school.updatedAt.toISOString(),
    licence: school.licence
      ? {
        id: school.licence.id,
        status: school.licence.status,
        seatLimit,
        seatsUsed,
        seatsAvailable: seatLimit === 0 ? Number.MAX_SAFE_INTEGER : Math.max(0, seatLimit - seatsUsed),
        provider: school.licence.provider,
        pricingPlanId: school.licence.pricingPlanId,
        currency: school.licence.currency,
        billingInterval: school.licence.billingInterval,
        trialEndsAt: school.licence.trialEndsAt?.toISOString() ?? null,
        currentPeriodEnd: school.licence.currentPeriodEnd?.toISOString() ?? null,
        startsAt: school.licence.startsAt?.toISOString() ?? null,
        endsAt: school.licence.endsAt?.toISOString() ?? null,
        notes: school.licence.notes,
        updatedAt: school.licence.updatedAt.toISOString(),
      }
      : null,
    classrooms: school.classrooms.map((classroom) => ({
      id: classroom.id,
      name: classroom.name,
      yearGroup: classroom.yearGroup,
      academicYear: classroom.academicYear,
      status: classroom.status,
      teacherId: classroom.teacherId,
      teacherName: classroom.teacher?.user.name ?? null,
      studentsCount: classroom._count.students,
      updatedAt: classroom.updatedAt.toISOString(),
    })),
    teachers: school.teachers.map((teacher) => ({
      id: teacher.id,
      userId: teacher.user.id,
      email: teacher.user.email,
      name: teacher.user.name,
      role: teacher.role,
      status: teacher.status,
      title: teacher.title,
      invitedAt: teacher.invitedAt?.toISOString() ?? null,
      acceptedAt: teacher.acceptedAt?.toISOString() ?? null,
      lastActiveAt: teacher.lastActiveAt?.toISOString() ?? null,
      updatedAt: teacher.updatedAt.toISOString(),
    })),
    students: school.students.map((student) => ({
      id: student.id,
      childId: student.child.id,
      childName: student.child.name,
      parentEmail: student.child.parent.email,
      classroomId: student.classroomId,
      classroomName: student.classroom?.name ?? null,
      status: student.status,
      externalRef: student.externalRef,
      joinedAt: student.joinedAt.toISOString(),
      updatedAt: student.updatedAt.toISOString(),
    })),
    communicationPreferences: [],
    communicationLogs: [],
    safeguarding: {
      openAlerts: school.safeguardingAlerts.length,
      criticalAlerts: school.safeguardingAlerts.filter((alert) => alert.severity === "critical").length,
    },
    safeguardingIncidents: school.safeguardingIncidents.map((incident) => ({
      id: incident.id,
      category: incident.category,
      severity: incident.severity,
      status: incident.status,
      studentName: incident.student?.name ?? null,
      escalationLevel: incident.escalationLevel ?? null,
      reportedBy: incident.reportedBy?.name ?? incident.reportedBy?.email ?? null,
      createdAt: incident.createdAt.toISOString(),
      updatedAt: incident.updatedAt.toISOString(),
    })),
    activityTimeline: school.auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId ?? null,
      severity: log.severity,
      actorUserId: log.actorUserId ?? null,
      createdAt: log.createdAt.toISOString(),
    })),
    dayLessons: mapDayLessons(school.dayLessons),
  };
}

export async function buildSchoolsAdminListPayload(): Promise<SchoolsAdminListPayload> {
  const securityGate = await loadSecurityGateContext();
  const schools = await prisma.school.findMany({
    orderBy: [{ updatedAt: "desc" }],
    include: schoolAdminListInclude as never,
  });

  return {
    securityGate,
    schools: schools.map((school) =>
      mapSchoolToAdminRecord({ ...(school as object), dayLessons: [] } as unknown as SchoolAdminSource),
    ),
  };
}

export async function findSchoolAdminRecord(schoolId: string): Promise<SchoolAdminRecord | null> {
  try {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      include: schoolAdminInclude as never,
    });
    if (!school) return null;
    return mapSchoolToAdminRecord(school as unknown as SchoolAdminSource);
  } catch (error) {
    if (!isMissingRelationTable(error, "SchoolDayLesson")) throw error;
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      include: schoolAdminListInclude as never,
    });
    if (!school) return null;
    return mapSchoolToAdminRecord({ ...(school as object), dayLessons: [] } as unknown as SchoolAdminSource);
  }
}

export async function findSchoolDashboardRecord(schoolId: string): Promise<SchoolAdminRecord | null> {
  const dashboardWithoutDayLessons = Object.fromEntries(
    Object.entries(schoolDashboardInclude).filter(([key]) => key !== "dayLessons"),
  );

  try {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      include: schoolDashboardInclude as never,
    });
    if (!school) return null;
    return mapSchoolToDashboardRecord(school as unknown as SchoolDashboardSource);
  } catch (error) {
    if (!isMissingRelationTable(error, "SchoolDayLesson")) throw error;
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      include: dashboardWithoutDayLessons as never,
    });
    if (!school) return null;
    return mapSchoolToDashboardRecord({ ...(school as object), dayLessons: [] } as unknown as SchoolDashboardSource);
  }
}

function isMissingRelationTable(error: unknown, table: string): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; meta?: { table?: string }; message?: string };
  if (maybe.code !== "P2021") return false;
  if (maybe.meta?.table?.includes(table)) return true;
  return typeof maybe.message === "string" && maybe.message.includes(table);
}
