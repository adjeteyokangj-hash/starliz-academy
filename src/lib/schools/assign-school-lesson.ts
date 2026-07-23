import { prisma } from "@/lib/db";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import { keyStageForYearGroup } from "@/lib/curriculum";

export type AssignSchoolLessonInput = {
  schoolId: string;
  actorUserId: string;
  subject: string;
  keyStage?: string | null;
  yearGroup: string;
  classroomId?: string | null;
  teacherId?: string | null;
  skillFocus: string;
  lessonType: string;
  title?: string | null;
  dayOfWeek?: number | null;
  periodIndex?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  room?: string | null;
  dueDate?: string | null;
};

export type AssignSchoolLessonResult =
  | {
      ok: true;
      dayLessonId: string;
      lessonId: string;
    }
  | { ok: false; status: number; error: string };

const DEFAULT_PERIODS: Record<string, { startsAt: string; endsAt: string; periodIndex: number }> = {
  core: { startsAt: "09:00", endsAt: "09:50", periodIndex: 2 },
  intervention: { startsAt: "13:20", endsAt: "14:10", periodIndex: 8 },
  revision: { startsAt: "10:55", endsAt: "11:45", periodIndex: 5 },
  assessment: { startsAt: "09:00", endsAt: "09:50", periodIndex: 2 },
  homework: { startsAt: "15:00", endsAt: "15:30", periodIndex: 10 },
};

export function normalizeLessonType(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("intervention")) return "intervention";
  if (normalized.includes("revision")) return "revision";
  if (normalized.includes("assessment")) return "assessment";
  if (normalized.includes("homework")) return "homework";
  return "core";
}

export function jsDayToSchoolDay(date = new Date()): number {
  const day = date.getDay(); // 0 Sun … 6 Sat
  if (day === 0 || day === 6) return 1; // weekend → Monday board
  return day;
}

export type AssignSchoolLessonDeps = {
  findSchool: (schoolId: string) => Promise<{ id: string } | null>;
  findClassroom: (input: { classroomId: string; schoolId: string }) => Promise<{ id: string; teacherId: string | null } | null>;
  findTeacher: (input: { teacherId: string; schoolId: string }) => Promise<{ id: string } | null>;
  createLesson: (input: {
    title: string;
    subject: string;
    yearGroup: string;
    keyStage: string | null;
    skillFocus: string;
    lessonType: string;
  }) => Promise<{ id: string }>;
  createDayLesson: (input: {
    schoolId: string;
    classroomId: string | null;
    teacherId: string | null;
    lessonId: string;
    title: string;
    subject: string;
    lessonType: string;
    yearGroup: string;
    keyStage: string | null;
    skillFocus: string;
    dayOfWeek: number;
    periodIndex: number;
    startsAt: string;
    endsAt: string;
    room: string | null;
    dueDate: Date | null;
  }) => Promise<{ id: string }>;
  writeSchoolAuditLog: typeof writeSchoolAuditLog;
};

export function createDefaultAssignSchoolLessonDeps(): AssignSchoolLessonDeps {
  return {
    findSchool: (schoolId) => prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } }),
    findClassroom: ({ classroomId, schoolId }) => prisma.classroom.findFirst({
      where: { id: classroomId, schoolId },
      select: { id: true, teacherId: true },
    }),
    findTeacher: ({ teacherId, schoolId }) => prisma.schoolTeacher.findFirst({
      where: { id: teacherId, schoolId },
      select: { id: true },
    }),
    createLesson: async (input) => prisma.lesson.create({
      data: {
        title: input.title,
        subject: input.subject,
        yearGroup: input.yearGroup,
        keyStage: input.keyStage,
        skillFocus: input.skillFocus,
        template: "school-assigned",
        objectives: `Assigned school lesson: ${input.title}`,
        difficultyBand: input.lessonType === "intervention" ? "support" : "core",
        status: "assigned",
      },
      select: { id: true },
    }),
    createDayLesson: async (input) => prisma.schoolDayLesson.create({
      data: {
        schoolId: input.schoolId,
        classroomId: input.classroomId,
        teacherId: input.teacherId,
        lessonId: input.lessonId,
        title: input.title,
        subject: input.subject,
        lessonType: input.lessonType,
        yearGroup: input.yearGroup,
        keyStage: input.keyStage,
        skillFocus: input.skillFocus,
        dayOfWeek: input.dayOfWeek,
        periodIndex: input.periodIndex,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        room: input.room,
        status: "scheduled",
        dueDate: input.dueDate,
      },
      select: { id: true },
    }),
    writeSchoolAuditLog,
  };
}

export async function assignSchoolLesson(
  input: AssignSchoolLessonInput,
  deps: AssignSchoolLessonDeps = createDefaultAssignSchoolLessonDeps(),
): Promise<AssignSchoolLessonResult> {
  const school = await deps.findSchool(input.schoolId);
  if (!school) {
    return { ok: false, status: 404, error: "School not found." };
  }

  const classroomId = input.classroomId?.trim() || null;
  let classroomTeacherId: string | null = null;
  if (classroomId) {
    const classroom = await deps.findClassroom({ classroomId, schoolId: input.schoolId });
    if (!classroom) {
      return { ok: false, status: 400, error: "Classroom not found for this school." };
    }
    classroomTeacherId = classroom.teacherId;
  }

  let teacherId = input.teacherId?.trim() || null;
  if (teacherId) {
    const teacher = await deps.findTeacher({ teacherId, schoolId: input.schoolId });
    if (!teacher) {
      return { ok: false, status: 400, error: "Teacher not found for this school." };
    }
  } else if (classroomId) {
    teacherId = classroomTeacherId;
  }

  const lessonType = normalizeLessonType(input.lessonType);
  const defaults = DEFAULT_PERIODS[lessonType] ?? DEFAULT_PERIODS.core;
  const yearGroup = input.yearGroup.trim();
  const keyStage = (input.keyStage?.trim() || keyStageForYearGroup(yearGroup) || null);
  const title = (input.title?.trim() || `${input.subject.trim()} — ${input.skillFocus.trim()}`).slice(0, 160);
  const dayOfWeek = input.dayOfWeek && input.dayOfWeek >= 1 && input.dayOfWeek <= 5
    ? input.dayOfWeek
    : jsDayToSchoolDay();

  const lesson = await deps.createLesson({
    title,
    subject: input.subject.trim(),
    yearGroup,
    keyStage,
    skillFocus: input.skillFocus.trim(),
    lessonType,
  });

  const dayLesson = await deps.createDayLesson({
    schoolId: input.schoolId,
    classroomId,
    teacherId,
    lessonId: lesson.id,
    title,
    subject: input.subject.trim(),
    lessonType,
    yearGroup,
    keyStage,
    skillFocus: input.skillFocus.trim(),
    dayOfWeek,
    periodIndex: input.periodIndex ?? defaults.periodIndex,
    startsAt: input.startsAt?.trim() || defaults.startsAt,
    endsAt: input.endsAt?.trim() || defaults.endsAt,
    room: input.room?.trim() || null,
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
  });

  await deps.writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    action: "assignment_issued",
    entityType: "assignment",
    entityId: dayLesson.id,
    metadata: {
      lessonId: lesson.id,
      classroomId,
      teacherId,
      subject: input.subject,
      lessonType,
      dayOfWeek,
    },
    severity: "info",
  });

  return {
    ok: true,
    dayLessonId: dayLesson.id,
    lessonId: lesson.id,
  };
}
