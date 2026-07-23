import { prisma } from "@/lib/db";
import {
  summariseAttendanceStatuses,
  type AttendanceCountSummary,
  type RegisterCompletionState,
} from "@/lib/schools/attendance-completion";
import {
  resolveActiveClassRoster,
  type EnrolmentRow,
} from "@/lib/schools/attendance-roster";
import {
  formatSessionDateIso,
  isAttendanceStatus,
  isRegisterEligibleLessonType,
  parseSessionDateInput,
  type AttendanceStatus,
} from "@/lib/schools/attendance-status";
import { schoolDayOfWeek } from "@/lib/schools/school-day-period";

export type PeriodForRegister = {
  id: string;
  schoolId: string;
  classroomId: string | null;
  teacherId: string | null;
  title: string;
  subject: string;
  lessonType: string;
  dayOfWeek: number;
  periodIndex: number;
  startsAt: string;
  endsAt: string;
  room: string | null;
  status: string;
  classroom: { id: string; name: string } | null;
  teacher: { id: string; user: { name: string | null } } | null;
};

export type AttendanceRow = {
  id: string;
  schoolStudentId: string;
  classroomId: string | null;
  status: string;
  note: string | null;
  recordedAt: Date;
  updatedAt: Date;
  recordedByTeacherId: string | null;
};

export type RegisterStudentEntry = {
  schoolStudentId: string;
  childId: string;
  name: string;
  status: AttendanceStatus;
  note: string | null;
  attendanceId: string | null;
  onCurrentRoster: boolean;
  historicalOnly: boolean;
  recordedAt: string | null;
  updatedAt: string | null;
};

export type AttendanceRegisterDto = {
  schoolDayLessonId: string;
  schoolId: string;
  sessionDate: string;
  period: {
    title: string;
    subject: string;
    lessonType: string;
    dayOfWeek: number;
    periodIndex: number;
    startsAt: string;
    endsAt: string;
    room: string | null;
    classroomId: string | null;
    classroomName: string | null;
    teacherId: string | null;
    teacherName: string | null;
  };
  registerEligible: boolean;
  completion: RegisterCompletionState;
  summary: AttendanceCountSummary;
  students: RegisterStudentEntry[];
};

export type SaveAttendanceEntry = {
  schoolStudentId: string;
  status: AttendanceStatus;
  note?: string | null;
};

export type AttendanceRegisterDeps = {
  findPeriod: (schoolDayLessonId: string) => Promise<PeriodForRegister | null>;
  findClassroomStudents: (input: {
    schoolId: string;
    classroomId: string;
  }) => Promise<EnrolmentRow[]>;
  findAttendanceRows: (input: {
    schoolDayLessonId: string;
    sessionDate: Date;
  }) => Promise<AttendanceRow[]>;
  findStudentsByIds: (ids: string[]) => Promise<Array<{
    id: string;
    schoolId: string;
    classroomId: string | null;
    child: { id: string; name: string };
  }>>;
  upsertAttendance: (input: {
    schoolId: string;
    schoolDayLessonId: string;
    schoolStudentId: string;
    classroomId: string | null;
    recordedByTeacherId: string | null;
    status: AttendanceStatus;
    note: string | null;
    sessionDate: Date;
  }) => Promise<AttendanceRow>;
};

const periodSelect = {
  id: true,
  schoolId: true,
  classroomId: true,
  teacherId: true,
  title: true,
  subject: true,
  lessonType: true,
  dayOfWeek: true,
  periodIndex: true,
  startsAt: true,
  endsAt: true,
  room: true,
  status: true,
  classroom: { select: { id: true, name: true } },
  teacher: {
    select: {
      id: true,
      user: { select: { name: true } },
    },
  },
} as const;

export function createDefaultAttendanceRegisterDeps(): AttendanceRegisterDeps {
  return {
    findPeriod: async (schoolDayLessonId) => prisma.schoolDayLesson.findUnique({
      where: { id: schoolDayLessonId },
      select: periodSelect,
    }),
    findClassroomStudents: async ({ schoolId, classroomId }) => prisma.schoolStudent.findMany({
      where: { schoolId, classroomId },
      select: {
        id: true,
        schoolId: true,
        classroomId: true,
        status: true,
        joinedAt: true,
        leftAt: true,
        child: { select: { id: true, name: true } },
      },
    }),
    findAttendanceRows: async ({ schoolDayLessonId, sessionDate }) => prisma.schoolDayAttendance.findMany({
      where: { schoolDayLessonId, sessionDate },
      select: {
        id: true,
        schoolStudentId: true,
        classroomId: true,
        status: true,
        note: true,
        recordedAt: true,
        updatedAt: true,
        recordedByTeacherId: true,
      },
    }),
    findStudentsByIds: async (ids) => {
      if (ids.length === 0) return [];
      return prisma.schoolStudent.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          schoolId: true,
          classroomId: true,
          child: { select: { id: true, name: true } },
        },
      });
    },
    upsertAttendance: async (input) => prisma.schoolDayAttendance.upsert({
      where: {
        schoolDayLessonId_schoolStudentId_sessionDate: {
          schoolDayLessonId: input.schoolDayLessonId,
          schoolStudentId: input.schoolStudentId,
          sessionDate: input.sessionDate,
        },
      },
      create: {
        schoolId: input.schoolId,
        schoolDayLessonId: input.schoolDayLessonId,
        schoolStudentId: input.schoolStudentId,
        classroomId: input.classroomId,
        recordedByTeacherId: input.recordedByTeacherId,
        status: input.status,
        note: input.note,
        sessionDate: input.sessionDate,
        recordedAt: new Date(),
      },
      update: {
        status: input.status,
        note: input.note,
        classroomId: input.classroomId,
        recordedByTeacherId: input.recordedByTeacherId,
        recordedAt: new Date(),
      },
      select: {
        id: true,
        schoolStudentId: true,
        classroomId: true,
        status: true,
        note: true,
        recordedAt: true,
        updatedAt: true,
        recordedByTeacherId: true,
      },
    }),
  };
}

function toStatus(value: string): AttendanceStatus {
  return isAttendanceStatus(value) ? value : "not_recorded";
}

function buildRegisterDto(input: {
  period: PeriodForRegister;
  sessionDate: Date;
  roster: EnrolmentRow[];
  rows: AttendanceRow[];
  historicalStudents: Array<{ id: string; child: { id: string; name: string } }>;
}): AttendanceRegisterDto {
  const eligible = isRegisterEligibleLessonType(input.period.lessonType);
  const byStudent = new Map(input.rows.map((row) => [row.schoolStudentId, row]));
  const rosterIds = new Set(input.roster.map((row) => row.id));

  const students: RegisterStudentEntry[] = [];

  for (const student of input.roster) {
    const row = byStudent.get(student.id);
    students.push({
      schoolStudentId: student.id,
      childId: student.child.id,
      name: student.child.name,
      status: row ? toStatus(row.status) : "not_recorded",
      note: row?.note ?? null,
      attendanceId: row?.id ?? null,
      onCurrentRoster: true,
      historicalOnly: false,
      recordedAt: row?.recordedAt.toISOString() ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    });
  }

  for (const student of input.historicalStudents) {
    if (rosterIds.has(student.id)) continue;
    const row = byStudent.get(student.id);
    if (!row) continue;
    students.push({
      schoolStudentId: student.id,
      childId: student.child.id,
      name: student.child.name,
      status: toStatus(row.status),
      note: row.note,
      attendanceId: row.id,
      onCurrentRoster: false,
      historicalOnly: true,
      recordedAt: row.recordedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  students.sort((a, b) => a.name.localeCompare(b.name));

  const rosterStatuses = students
    .filter((student) => student.onCurrentRoster)
    .map((student) => student.status);

  const summary = summariseAttendanceStatuses(
    eligible && input.period.classroomId ? rosterStatuses : [],
  );

  let completion: RegisterCompletionState = "not_applicable";
  if (!eligible) {
    completion = "not_applicable";
  } else if (!input.period.classroomId) {
    completion = "no_roster";
  } else if (!input.period.teacherId && summary.completion === "not_started") {
    completion = "missing_tutor";
  } else if (!input.period.teacherId && summary.completion === "no_roster") {
    completion = "missing_tutor";
  } else {
    completion = summary.completion;
  }

  return {
    schoolDayLessonId: input.period.id,
    schoolId: input.period.schoolId,
    sessionDate: formatSessionDateIso(input.sessionDate),
    period: {
      title: input.period.title,
      subject: input.period.subject,
      lessonType: input.period.lessonType,
      dayOfWeek: input.period.dayOfWeek,
      periodIndex: input.period.periodIndex,
      startsAt: input.period.startsAt,
      endsAt: input.period.endsAt,
      room: input.period.room,
      classroomId: input.period.classroomId,
      classroomName: input.period.classroom?.name ?? null,
      teacherId: input.period.teacherId,
      teacherName: input.period.teacher?.user.name ?? null,
    },
    registerEligible: eligible,
    completion,
    summary,
    students,
  };
}

export type LoadRegisterResult =
  | { ok: true; register: AttendanceRegisterDto }
  | { ok: false; status: number; error: string };

export async function loadAttendanceRegister(
  input: {
    schoolDayLessonId: string;
    sessionDate?: string | Date | null;
    /** When set, period must belong to this school. */
    expectedSchoolId?: string | null;
    /** When set, period must be assigned to this tutor. */
    expectedTeacherId?: string | null;
  },
  deps: AttendanceRegisterDeps = createDefaultAttendanceRegisterDeps(),
): Promise<LoadRegisterResult> {
  const period = await deps.findPeriod(input.schoolDayLessonId);
  if (!period) return { ok: false, status: 404, error: "Period not found." };
  if (input.expectedSchoolId && period.schoolId !== input.expectedSchoolId) {
    return { ok: false, status: 403, error: "Cross-school access denied." };
  }
  if (input.expectedTeacherId && period.teacherId !== input.expectedTeacherId) {
    return { ok: false, status: 403, error: "You can only open registers for your assigned periods." };
  }

  const sessionDate = parseSessionDateInput(input.sessionDate);
  if (schoolDayOfWeek(sessionDate) !== period.dayOfWeek) {
    // Soft warning path: still allow loading (holidays / overrides), but keep weekday mismatch visible via period.dayOfWeek
  }

  if (!isRegisterEligibleLessonType(period.lessonType)) {
    return {
      ok: true,
      register: buildRegisterDto({
        period,
        sessionDate,
        roster: [],
        rows: [],
        historicalStudents: [],
      }),
    };
  }

  if (!period.classroomId) {
    return {
      ok: true,
      register: buildRegisterDto({
        period,
        sessionDate,
        roster: [],
        rows: await deps.findAttendanceRows({ schoolDayLessonId: period.id, sessionDate }),
        historicalStudents: [],
      }),
    };
  }

  const enrolled = await deps.findClassroomStudents({
    schoolId: period.schoolId,
    classroomId: period.classroomId,
  });
  const roster = resolveActiveClassRoster({
    schoolId: period.schoolId,
    classroomId: period.classroomId,
    sessionDate,
    students: enrolled,
  });
  const rows = await deps.findAttendanceRows({ schoolDayLessonId: period.id, sessionDate });
  const rosterIdSet = new Set(roster.map((row) => row.id));
  const historicalIds = rows
    .map((row) => row.schoolStudentId)
    .filter((id) => !rosterIdSet.has(id));
  const historicalStudents = await deps.findStudentsByIds(historicalIds);

  return {
    ok: true,
    register: buildRegisterDto({
      period,
      sessionDate,
      roster,
      rows,
      historicalStudents,
    }),
  };
}

export type SaveRegisterResult =
  | { ok: true; register: AttendanceRegisterDto; savedCount: number }
  | { ok: false; status: number; error: string };

export async function saveAttendanceRegister(
  input: {
    schoolDayLessonId: string;
    sessionDate?: string | Date | null;
    entries: SaveAttendanceEntry[];
    mode: "draft" | "register" | "mark_all_present";
    actor: {
      schoolId: string;
      schoolTeacherId: string | null;
      /** admin bypasses tutor ownership check but still needs school match */
      role: "tutor" | "admin";
    };
  },
  deps: AttendanceRegisterDeps = createDefaultAttendanceRegisterDeps(),
): Promise<SaveRegisterResult> {
  const period = await deps.findPeriod(input.schoolDayLessonId);
  if (!period) return { ok: false, status: 404, error: "Period not found." };
  if (period.schoolId !== input.actor.schoolId) {
    return { ok: false, status: 403, error: "Cross-school access denied." };
  }
  if (input.actor.role === "tutor") {
    if (!input.actor.schoolTeacherId || period.teacherId !== input.actor.schoolTeacherId) {
      return { ok: false, status: 403, error: "You can only save registers for your assigned periods." };
    }
  }
  if (!isRegisterEligibleLessonType(period.lessonType)) {
    return { ok: false, status: 400, error: "Break and lunch periods do not have student registers." };
  }
  if (!period.classroomId) {
    return { ok: false, status: 400, error: "This period has no class roster." };
  }

  const sessionDate = parseSessionDateInput(input.sessionDate);
  const enrolled = await deps.findClassroomStudents({
    schoolId: period.schoolId,
    classroomId: period.classroomId,
  });
  const roster = resolveActiveClassRoster({
    schoolId: period.schoolId,
    classroomId: period.classroomId,
    sessionDate,
    students: enrolled,
  });
  const existingRows = await deps.findAttendanceRows({
    schoolDayLessonId: period.id,
    sessionDate,
  });
  const allowedIds = new Set([
    ...roster.map((row) => row.id),
    ...existingRows.map((row) => row.schoolStudentId),
  ]);

  let entries = input.entries;
  if (input.mode === "mark_all_present") {
    entries = roster.map((student) => ({
      schoolStudentId: student.id,
      status: "present" as const,
      note: null,
    }));
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: false, status: 400, error: "No attendance entries supplied." };
  }

  for (const entry of entries) {
    if (!entry || typeof entry.schoolStudentId !== "string") {
      return { ok: false, status: 400, error: "Malformed attendance entry." };
    }
    if (!isAttendanceStatus(entry.status)) {
      return { ok: false, status: 400, error: `Invalid attendance status: ${String(entry.status)}.` };
    }
    if (!allowedIds.has(entry.schoolStudentId)) {
      return { ok: false, status: 403, error: "Student is not on this class register." };
    }
  }

  // Deduplicate by student — last write wins within the payload.
  const unique = new Map<string, SaveAttendanceEntry>();
  for (const entry of entries) unique.set(entry.schoolStudentId, entry);

  let savedCount = 0;
  for (const entry of unique.values()) {
    const rosterStudent = roster.find((row) => row.id === entry.schoolStudentId);
    const existing = existingRows.find((row) => row.schoolStudentId === entry.schoolStudentId);
    const classroomId = rosterStudent?.classroomId
      ?? existing?.classroomId
      ?? period.classroomId;

    await deps.upsertAttendance({
      schoolId: period.schoolId,
      schoolDayLessonId: period.id,
      schoolStudentId: entry.schoolStudentId,
      classroomId,
      recordedByTeacherId: input.actor.schoolTeacherId,
      status: entry.status,
      note: entry.note?.trim() ? entry.note.trim() : null,
      sessionDate,
    });
    savedCount += 1;
  }

  const reloaded = await loadAttendanceRegister({
    schoolDayLessonId: period.id,
    sessionDate,
    expectedSchoolId: input.actor.schoolId,
    expectedTeacherId: input.actor.role === "tutor" ? input.actor.schoolTeacherId : null,
  }, deps);

  if (!reloaded.ok) return reloaded;
  return { ok: true, register: reloaded.register, savedCount };
}

export type AdminDayAttendanceSummary = {
  sessionDate: string;
  periods: Array<{
    schoolDayLessonId: string;
    title: string;
    subject: string;
    lessonType: string;
    startsAt: string;
    endsAt: string;
    room: string | null;
    classroomName: string | null;
    teacherName: string | null;
    teacherId: string | null;
    registerEligible: boolean;
    completion: RegisterCompletionState;
    summary: AttendanceCountSummary;
  }>;
};

export type AdminSummaryDeps = {
  findPeriodsForDay: (input: {
    schoolId: string;
    dayOfWeek: number;
  }) => Promise<PeriodForRegister[]>;
  loadRegister: typeof loadAttendanceRegister;
};

export function createDefaultAdminSummaryDeps(): AdminSummaryDeps {
  return {
    findPeriodsForDay: async ({ schoolId, dayOfWeek }) => prisma.schoolDayLesson.findMany({
      where: {
        schoolId,
        dayOfWeek,
        status: { not: "cancelled" },
      },
      select: periodSelect,
      orderBy: [{ periodIndex: "asc" }, { startsAt: "asc" }],
    }),
    loadRegister: loadAttendanceRegister,
  };
}

export async function getAdminDayAttendanceSummary(
  input: {
    schoolId: string;
    sessionDate?: string | Date | null;
  },
  deps: AdminSummaryDeps = createDefaultAdminSummaryDeps(),
  registerDeps: AttendanceRegisterDeps = createDefaultAttendanceRegisterDeps(),
): Promise<AdminDayAttendanceSummary> {
  const sessionDate = parseSessionDateInput(input.sessionDate);
  const dayOfWeek = schoolDayOfWeek(sessionDate);
  const periods = await deps.findPeriodsForDay({ schoolId: input.schoolId, dayOfWeek });

  const mapped = [];
  for (const period of periods) {
    if (period.schoolId !== input.schoolId) continue;
    const loaded = await deps.loadRegister({
      schoolDayLessonId: period.id,
      sessionDate,
      expectedSchoolId: input.schoolId,
    }, registerDeps);
    if (!loaded.ok) continue;

    let completion = loaded.register.completion;
    if (loaded.register.registerEligible && !period.teacherId) {
      if (completion === "not_started" || completion === "no_roster") {
        completion = "missing_tutor";
      }
    }

    mapped.push({
      schoolDayLessonId: period.id,
      title: period.title,
      subject: period.subject,
      lessonType: period.lessonType,
      startsAt: period.startsAt,
      endsAt: period.endsAt,
      room: period.room,
      classroomName: period.classroom?.name ?? null,
      teacherName: period.teacher?.user.name ?? null,
      teacherId: period.teacherId,
      registerEligible: loaded.register.registerEligible,
      completion,
      summary: loaded.register.summary,
    });
  }

  return {
    sessionDate: formatSessionDateIso(sessionDate),
    periods: mapped,
  };
}

export type StudentAttendanceHistoryItem = {
  id: string;
  sessionDate: string;
  status: AttendanceStatus;
  note: string | null;
  periodTitle: string;
  subject: string;
  startsAt: string;
  endsAt: string;
  classroomName: string | null;
};

export type StudentHistoryDeps = {
  findActiveEnrolment: (childId: string) => Promise<{ id: string; schoolId: string } | null>;
  findAttendanceForStudent: (input: {
    schoolStudentId: string;
    schoolId: string;
    take: number;
  }) => Promise<Array<{
    id: string;
    status: string;
    note: string | null;
    sessionDate: Date;
    schoolDayLesson: {
      title: string;
      subject: string;
      startsAt: string;
      endsAt: string;
      classroom: { name: string } | null;
    };
  }>>;
};

export function createDefaultStudentHistoryDeps(): StudentHistoryDeps {
  return {
    findActiveEnrolment: async (childId) => {
      const row = await prisma.schoolStudent.findFirst({
        where: { childId, status: "active" },
        select: { id: true, schoolId: true },
        orderBy: { joinedAt: "desc" },
      });
      return row;
    },
    findAttendanceForStudent: async ({ schoolStudentId, schoolId, take }) => prisma.schoolDayAttendance.findMany({
      where: {
        schoolStudentId,
        schoolId,
        status: { not: "not_recorded" },
      },
      orderBy: [{ sessionDate: "desc" }, { recordedAt: "desc" }],
      take,
      select: {
        id: true,
        status: true,
        note: true,
        sessionDate: true,
        schoolDayLesson: {
          select: {
            title: true,
            subject: true,
            startsAt: true,
            endsAt: true,
            classroom: { select: { name: true } },
          },
        },
      },
    }),
  };
}

export async function getStudentAttendanceHistory(
  input: {
    childId: string;
    /** Must match the child's enrolment; rejects cross-student peeking. */
    expectedSchoolStudentId?: string | null;
    take?: number;
  },
  deps: StudentHistoryDeps = createDefaultStudentHistoryDeps(),
): Promise<
  | { ok: true; items: StudentAttendanceHistoryItem[]; schoolStudentId: string }
  | { ok: false; status: number; error: string }
> {
  const enrolment = await deps.findActiveEnrolment(input.childId);
  if (!enrolment) {
    return { ok: false, status: 404, error: "No active school enrolment." };
  }
  if (input.expectedSchoolStudentId && input.expectedSchoolStudentId !== enrolment.id) {
    return { ok: false, status: 403, error: "You can only view your own attendance." };
  }

  const rows = await deps.findAttendanceForStudent({
    schoolStudentId: enrolment.id,
    schoolId: enrolment.schoolId,
    take: input.take ?? 60,
  });

  return {
    ok: true,
    schoolStudentId: enrolment.id,
    items: rows.map((row) => ({
      id: row.id,
      sessionDate: formatSessionDateIso(row.sessionDate),
      status: toStatus(row.status),
      note: row.status === "late" || row.status === "absent" || row.status === "authorised_absence" || row.status === "medical"
        ? row.note
        : null,
      periodTitle: row.schoolDayLesson.title,
      subject: row.schoolDayLesson.subject,
      startsAt: row.schoolDayLesson.startsAt,
      endsAt: row.schoolDayLesson.endsAt,
      classroomName: row.schoolDayLesson.classroom?.name ?? null,
    })),
  };
}
