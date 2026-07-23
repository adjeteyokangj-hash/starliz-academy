import { prisma } from "@/lib/db";
import {
  describeSchoolClock,
  minutesNow,
  schoolDayOfWeek,
  sortPeriodsByTime,
  weekdayLabel,
} from "@/lib/schools/school-day-period";

export type DaytimePeriodDto = {
  id: string;
  title: string;
  subject: string;
  lessonType: string;
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
  lessonTitle: string | null;
  skillFocus: string | null;
};

export type DaytimeStudentDto = {
  id: string;
  childId: string;
  name: string;
};

type PeriodRow = {
  id: string;
  title: string;
  subject: string;
  lessonType: string;
  dayOfWeek: number;
  periodIndex: number;
  startsAt: string;
  endsAt: string;
  room: string | null;
  status: string;
  classroomId: string | null;
  skillFocus: string | null;
  lessonId: string | null;
  classroom: { id: string; name: string } | null;
  teacher: { id: string; user: { name: string | null } } | null;
  lesson: { id: string; title: string } | null;
};

function mapPeriod(row: PeriodRow): DaytimePeriodDto {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    lessonType: row.lessonType,
    dayOfWeek: row.dayOfWeek,
    periodIndex: row.periodIndex,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    room: row.room,
    status: row.status,
    classroomId: row.classroomId,
    classroomName: row.classroom?.name ?? null,
    teacherId: row.teacher?.id ?? null,
    teacherName: row.teacher?.user.name ?? null,
    lessonId: row.lessonId,
    lessonTitle: row.lesson?.title ?? null,
    skillFocus: row.skillFocus,
  };
}

export type TutorBoardDeps = {
  findTutorPeriods: (input: {
    schoolId: string;
    schoolTeacherId: string;
    dayOfWeek: number;
  }) => Promise<PeriodRow[]>;
  findClassroomStudents: (input: {
    schoolId: string;
    classroomIds: string[];
  }) => Promise<Array<{
    id: string;
    classroomId: string | null;
    child: { id: string; name: string };
  }>>;
};

export type StudentBoardDeps = {
  findActiveEnrolment: (childId: string) => Promise<{
    id: string;
    schoolId: string;
    classroomId: string;
    classroomName: string | null;
    schoolName: string;
  } | null>;
  findClassPeriods: (input: {
    schoolId: string;
    classroomId: string;
    dayOfWeek: number;
  }) => Promise<PeriodRow[]>;
};

const periodInclude = {
  classroom: { select: { id: true, name: true } },
  teacher: {
    select: {
      id: true,
      user: { select: { name: true } },
    },
  },
  lesson: { select: { id: true, title: true } },
} as const;

export function createDefaultTutorBoardDeps(): TutorBoardDeps {
  return {
    findTutorPeriods: async ({ schoolId, schoolTeacherId, dayOfWeek }) => prisma.schoolDayLesson.findMany({
      where: {
        schoolId,
        teacherId: schoolTeacherId,
        dayOfWeek,
        status: { not: "cancelled" },
      },
      include: periodInclude,
      orderBy: [{ periodIndex: "asc" }, { startsAt: "asc" }],
    }),
    findClassroomStudents: async ({ schoolId, classroomIds }) => {
      if (classroomIds.length === 0) return [];
      return prisma.schoolStudent.findMany({
        where: {
          schoolId,
          classroomId: { in: classroomIds },
          status: "active",
        },
        select: {
          id: true,
          classroomId: true,
          child: { select: { id: true, name: true } },
        },
        orderBy: { joinedAt: "asc" },
      });
    },
  };
}

export function createDefaultStudentBoardDeps(): StudentBoardDeps {
  return {
    findActiveEnrolment: async (childId) => {
      const enrolment = await prisma.schoolStudent.findFirst({
        where: {
          childId,
          status: "active",
          classroomId: { not: null },
        },
        select: {
          id: true,
          schoolId: true,
          classroomId: true,
          classroom: { select: { id: true, name: true } },
          school: { select: { id: true, name: true } },
        },
        orderBy: { joinedAt: "desc" },
      });
      if (!enrolment || !enrolment.classroomId) return null;
      return {
        id: enrolment.id,
        schoolId: enrolment.schoolId,
        classroomId: enrolment.classroomId,
        classroomName: enrolment.classroom?.name ?? null,
        schoolName: enrolment.school.name,
      };
    },
    findClassPeriods: async ({ schoolId, classroomId, dayOfWeek }) => prisma.schoolDayLesson.findMany({
      where: {
        schoolId,
        classroomId,
        dayOfWeek,
        status: { not: "cancelled" },
      },
      include: periodInclude,
      orderBy: [{ periodIndex: "asc" }, { startsAt: "asc" }],
    }),
  };
}

export async function getTutorDaytimeBoard(
  input: {
    schoolId: string;
    schoolTeacherId: string;
    dayOfWeek?: number;
    now?: Date;
  },
  deps: TutorBoardDeps = createDefaultTutorBoardDeps(),
) {
  const dayOfWeek = input.dayOfWeek && input.dayOfWeek >= 1 && input.dayOfWeek <= 5
    ? input.dayOfWeek
    : schoolDayOfWeek(input.now ?? new Date());

  const rows = await deps.findTutorPeriods({
    schoolId: input.schoolId,
    schoolTeacherId: input.schoolTeacherId,
    dayOfWeek,
  });

  // Defence in depth: never return another tutor's rows even if the store misfilters.
  const ownedRows = rows.filter((row) => row.teacher?.id === input.schoolTeacherId);
  const periods = sortPeriodsByTime(ownedRows.map(mapPeriod));
  const nowMinutes = minutesNow(input.now ?? new Date());
  const clock = describeSchoolClock(periods, nowMinutes);

  const classroomIds = Array.from(
    new Set(periods.map((period) => period.classroomId).filter((id): id is string => Boolean(id))),
  );

  const students = await deps.findClassroomStudents({
    schoolId: input.schoolId,
    classroomIds,
  });
  const studentsByClassroom = new Map<string, DaytimeStudentDto[]>();
  for (const student of students) {
    if (!student.classroomId || !classroomIds.includes(student.classroomId)) continue;
    const list = studentsByClassroom.get(student.classroomId) ?? [];
    list.push({
      id: student.id,
      childId: student.child.id,
      name: student.child.name,
    });
    studentsByClassroom.set(student.classroomId, list);
  }

  return {
    schoolId: input.schoolId,
    schoolTeacherId: input.schoolTeacherId,
    dayOfWeek,
    weekdayLabel: weekdayLabel(dayOfWeek),
    dateIso: (input.now ?? new Date()).toISOString(),
    phase: clock.phase,
    currentPeriodId: clock.current?.id ?? null,
    nextPeriodId: clock.next?.id ?? null,
    periods,
    studentsByClassroom: Object.fromEntries(studentsByClassroom.entries()),
  };
}

export async function getTutorDaytimeBoardForSession(input: {
  schoolId: string;
  schoolTeacherId: string;
  requestedTeacherId?: string | null;
  dayOfWeek?: number;
  now?: Date;
}, deps: TutorBoardDeps = createDefaultTutorBoardDeps()) {
  if (input.requestedTeacherId && input.requestedTeacherId !== input.schoolTeacherId) {
    return {
      ok: false as const,
      status: 403,
      error: "Tutors can only view their own timetable.",
    };
  }
  const board = await getTutorDaytimeBoard({
    schoolId: input.schoolId,
    schoolTeacherId: input.schoolTeacherId,
    dayOfWeek: input.dayOfWeek,
    now: input.now,
  }, deps);
  return { ok: true as const, board };
}

export async function getStudentDaytimeBoard(
  input: {
    childId: string;
    dayOfWeek?: number;
    now?: Date;
  },
  deps: StudentBoardDeps = createDefaultStudentBoardDeps(),
) {
  const enrolment = await deps.findActiveEnrolment(input.childId);
  if (!enrolment) {
    return {
      ok: true as const,
      board: {
        childId: input.childId,
        enrolment: null as null,
        dayOfWeek: schoolDayOfWeek(input.now ?? new Date()),
        weekdayLabel: weekdayLabel(schoolDayOfWeek(input.now ?? new Date())),
        dateIso: (input.now ?? new Date()).toISOString(),
        phase: "no_timetable" as const,
        currentPeriodId: null,
        nextPeriodId: null,
        periods: [] as DaytimePeriodDto[],
        schoolName: null as string | null,
        classroomName: null as string | null,
      },
    };
  }

  const dayOfWeek = input.dayOfWeek && input.dayOfWeek >= 1 && input.dayOfWeek <= 5
    ? input.dayOfWeek
    : schoolDayOfWeek(input.now ?? new Date());

  const rows = await deps.findClassPeriods({
    schoolId: enrolment.schoolId,
    classroomId: enrolment.classroomId,
    dayOfWeek,
  });

  // Defence in depth: only keep periods for the enrolled class/school.
  const scopedRows = rows.filter(
    (row) => row.classroomId === enrolment.classroomId,
  );
  const periods = sortPeriodsByTime(scopedRows.map(mapPeriod));
  const nowMinutes = minutesNow(input.now ?? new Date());
  const clock = describeSchoolClock(periods, nowMinutes);

  return {
    ok: true as const,
    board: {
      childId: input.childId,
      enrolment: {
        schoolStudentId: enrolment.id,
        schoolId: enrolment.schoolId,
        classroomId: enrolment.classroomId,
      },
      dayOfWeek,
      weekdayLabel: weekdayLabel(dayOfWeek),
      dateIso: (input.now ?? new Date()).toISOString(),
      phase: clock.phase,
      currentPeriodId: clock.current?.id ?? null,
      nextPeriodId: clock.next?.id ?? null,
      periods,
      schoolName: enrolment.schoolName,
      classroomName: enrolment.classroomName,
    },
  };
}

export async function getStudentDaytimeBoardScoped(input: {
  childId: string;
  requestedClassroomId?: string | null;
  requestedSchoolId?: string | null;
  dayOfWeek?: number;
  now?: Date;
}, deps: StudentBoardDeps = createDefaultStudentBoardDeps()) {
  const result = await getStudentDaytimeBoard({
    childId: input.childId,
    dayOfWeek: input.dayOfWeek,
    now: input.now,
  }, deps);

  if (!result.ok) return result;
  const enrolment = result.board.enrolment;
  if (!enrolment) return result;

  if (input.requestedClassroomId && input.requestedClassroomId !== enrolment.classroomId) {
    return {
      ok: false as const,
      status: 403,
      error: "Students can only view their enrolled class timetable.",
    };
  }
  if (input.requestedSchoolId && input.requestedSchoolId !== enrolment.schoolId) {
    return {
      ok: false as const,
      status: 403,
      error: "Students can only view their school timetable.",
    };
  }
  return result;
}
