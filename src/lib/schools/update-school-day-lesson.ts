import { prisma } from "@/lib/db";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
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
  | { ok: true; dayLessonId: string }
  | { ok: false; status: number; error: string };

export type UpdateSchoolDayLessonDeps = {
  findDayLesson: (input: { dayLessonId: string; schoolId: string }) => Promise<{
    id: string;
    schoolId: string;
    teacherId: string | null;
    room: string | null;
    startsAt: string;
    endsAt: string;
    subject: string;
    title: string;
    lessonId: string | null;
  } | null>;
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
        teacherId: true,
        room: true,
        startsAt: true,
        endsAt: true,
        subject: true,
        title: true,
        lessonId: true,
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
    ? undefined
    : (input.teacherId?.trim() || null);
  const nextRoom = input.room === undefined
    ? undefined
    : (input.room?.trim() || null);
  const nextSubject = input.subject?.trim();
  const nextTitle = input.title?.trim();
  const nextLessonId = input.lessonId === undefined
    ? undefined
    : (input.lessonId?.trim() || null);

  await deps.updateDayLesson({
    dayLessonId: existing.id,
    ...(nextTeacherId !== undefined ? { teacherId: nextTeacherId } : {}),
    ...(nextRoom !== undefined ? { room: nextRoom } : {}),
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
        teacherId: nextTeacherId === undefined ? existing.teacherId : nextTeacherId,
        room: nextRoom === undefined ? existing.room : nextRoom,
        startsAt: nextStartsAt,
        endsAt: nextEndsAt,
        subject: nextSubject || existing.subject,
        title: nextTitle || existing.title,
        lessonId: nextLessonId === undefined ? existing.lessonId : nextLessonId,
      },
    },
    severity: "info",
  });

  return { ok: true, dayLessonId: existing.id };
}
