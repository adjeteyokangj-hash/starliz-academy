import { prisma } from "@/lib/db";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import {
  findDaySchoolConflicts,
  formatBlockingConflictError,
  type DaySchoolConflict,
  type DaySchoolPeriodForConflict,
} from "@/lib/schools/day-school-conflicts";
import { isValidTimeRange } from "@/lib/schools/school-day-period";

export type UpdateSchoolDayLessonInput = {
  schoolId: string;
  dayLessonId: string;
  actorUserId: string;
  teacherId?: string | null;
  room?: string | null;
  startsAt?: string;
  endsAt?: string;
  subject?: string;
  title?: string;
  lessonId?: string | null;
};

export type UpdateSchoolDayLessonResult =
  | { ok: true; dayLessonId: string; warnings: DaySchoolConflict[] }
  | { ok: false; status: number; error: string; conflicts?: DaySchoolConflict[] };

export type UpdateSchoolDayLessonDeps = {
  findDayLesson: (input: { dayLessonId: string; schoolId: string }) => Promise<{
    id: string;
    schoolId: string;
    dayOfWeek: number;
    classroomId: string | null;
    teacherId: string | null;
    room: string | null;
    startsAt: string;
    endsAt: string;
    subject: string;
    title: string;
    lessonId: string | null;
    lessonType: string;
    status: string;
  } | null>;
  findSiblingPeriods: (input: {
    schoolId: string;
    dayOfWeek: number;
    excludeId: string;
  }) => Promise<DaySchoolPeriodForConflict[]>;
  findTeacherInSchool: (input: { teacherId: string; schoolId: string }) => Promise<{ id: string } | null>;
  findLesson: (lessonId: string) => Promise<{ id: string } | null>;
  updateDayLesson: (input: {
    dayLessonId: string;
    teacherId?: string | null;
    room?: string | null;
    startsAt?: string;
    endsAt?: string;
    subject?: string;
    title?: string;
    lessonId?: string | null;
  }) => Promise<void>;
  writeSchoolAuditLog: typeof writeSchoolAuditLog;
};

export function createDefaultUpdateSchoolDayLessonDeps(): UpdateSchoolDayLessonDeps {
  return {
    findDayLesson: async ({ dayLessonId, schoolId }) => prisma.schoolDayLesson.findFirst({
      where: { id: dayLessonId, schoolId },
      select: {
        id: true,
        schoolId: true,
        dayOfWeek: true,
        classroomId: true,
        teacherId: true,
        room: true,
        startsAt: true,
        endsAt: true,
        subject: true,
        title: true,
        lessonId: true,
        lessonType: true,
        status: true,
      },
    }),
    findSiblingPeriods: async ({ schoolId, dayOfWeek, excludeId }) => prisma.schoolDayLesson.findMany({
      where: {
        schoolId,
        dayOfWeek,
        id: { not: excludeId },
        status: { not: "cancelled" },
      },
      select: {
        id: true,
        dayOfWeek: true,
        startsAt: true,
        endsAt: true,
        teacherId: true,
        classroomId: true,
        room: true,
        status: true,
        lessonType: true,
      },
    }),
    findTeacherInSchool: async ({ teacherId, schoolId }) => prisma.schoolTeacher.findFirst({
      where: { id: teacherId, schoolId },
      select: { id: true },
    }),
    findLesson: async (lessonId) => prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true },
    }),
    updateDayLesson: async (input) => {
      await prisma.schoolDayLesson.update({
        where: { id: input.dayLessonId },
        data: {
          ...(input.teacherId !== undefined ? { teacherId: input.teacherId } : {}),
          ...(input.room !== undefined ? { room: input.room } : {}),
          ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
          ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
          ...(input.subject !== undefined ? { subject: input.subject } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.lessonId !== undefined ? { lessonId: input.lessonId } : {}),
        },
      });
    },
    writeSchoolAuditLog,
  };
}

export async function updateSchoolDayLesson(
  input: UpdateSchoolDayLessonInput,
  deps: UpdateSchoolDayLessonDeps = createDefaultUpdateSchoolDayLessonDeps(),
): Promise<UpdateSchoolDayLessonResult> {
  const existing = await deps.findDayLesson({
    dayLessonId: input.dayLessonId,
    schoolId: input.schoolId,
  });
  if (!existing) {
    return { ok: false, status: 404, error: "Timetable period not found for this school." };
  }

  if (input.teacherId) {
    const teacher = await deps.findTeacherInSchool({
      teacherId: input.teacherId,
      schoolId: input.schoolId,
    });
    if (!teacher) {
      return { ok: false, status: 400, error: "Tutor does not belong to this school." };
    }
  }

  if (input.lessonId) {
    const lesson = await deps.findLesson(input.lessonId);
    if (!lesson) {
      return { ok: false, status: 400, error: "Linked lesson was not found." };
    }
  }

  const nextStartsAt = input.startsAt?.trim() || existing.startsAt;
  const nextEndsAt = input.endsAt?.trim() || existing.endsAt;
  if (!isValidTimeRange(nextStartsAt, nextEndsAt)) {
    return { ok: false, status: 400, error: "End time must be later than start time." };
  }

  const nextTeacherId = input.teacherId === undefined
    ? existing.teacherId
    : (input.teacherId?.trim() || null);
  const nextRoom = input.room === undefined
    ? existing.room
    : (input.room?.trim() || null);
  const nextSubject = input.subject?.trim();
  const nextTitle = input.title?.trim();
  const nextLessonId = input.lessonId === undefined
    ? undefined
    : (input.lessonId?.trim() || null);

  const siblings = await deps.findSiblingPeriods({
    schoolId: input.schoolId,
    dayOfWeek: existing.dayOfWeek,
    excludeId: existing.id,
  });
  const proposed: DaySchoolPeriodForConflict = {
    id: existing.id,
    dayOfWeek: existing.dayOfWeek,
    startsAt: nextStartsAt,
    endsAt: nextEndsAt,
    teacherId: nextTeacherId,
    classroomId: existing.classroomId,
    room: nextRoom,
    status: existing.status,
    lessonType: existing.lessonType,
  };
  const conflicts = findDaySchoolConflicts([...siblings, proposed]);
  const involving = conflicts.filter((c) => c.periodIds.includes(existing.id));
  const blocking = involving.filter((c) => c.severity === "blocking");
  if (blocking.length > 0) {
    return {
      ok: false,
      status: 409,
      error: formatBlockingConflictError(blocking),
      conflicts: blocking,
    };
  }
  const warnings = involving.filter((c) => c.severity === "warning");

  await deps.updateDayLesson({
    dayLessonId: existing.id,
    ...(input.teacherId !== undefined ? { teacherId: nextTeacherId } : {}),
    ...(input.room !== undefined ? { room: nextRoom } : {}),
    ...(input.startsAt !== undefined ? { startsAt: nextStartsAt } : {}),
    ...(input.endsAt !== undefined ? { endsAt: nextEndsAt } : {}),
    ...(nextSubject ? { subject: nextSubject } : {}),
    ...(nextTitle ? { title: nextTitle } : {}),
    ...(nextLessonId !== undefined ? { lessonId: nextLessonId } : {}),
  });

  await deps.writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    action: "assignment_issued",
    entityType: "assignment",
    entityId: existing.id,
    metadata: {
      update: "school_day_lesson",
      before: {
        teacherId: existing.teacherId,
        room: existing.room,
        startsAt: existing.startsAt,
        endsAt: existing.endsAt,
        subject: existing.subject,
        title: existing.title,
        lessonId: existing.lessonId,
      },
      after: {
        teacherId: nextTeacherId,
        room: nextRoom,
        startsAt: nextStartsAt,
        endsAt: nextEndsAt,
        subject: nextSubject || existing.subject,
        title: nextTitle || existing.title,
        lessonId: nextLessonId === undefined ? existing.lessonId : nextLessonId,
      },
      roomWarnings: warnings.map((w) => w.label),
    },
    severity: "info",
  });

  return { ok: true, dayLessonId: existing.id, warnings };
}