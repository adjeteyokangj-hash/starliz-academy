import { prisma } from "@/lib/db";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import {
  evaluateDaytimeLessonHealth,
  reviewStatusFromHealth,
  serializeMachineHealth,
  stagePacksFromContentRows,
  type LessonReviewStatus,
} from "@/lib/schools/daytime-lesson-health";
import { generateDaytimeLessonContent } from "@/lib/schools/generate-daytime-lesson-content";
import { isPlayableDaytimeLessonType } from "@/lib/schools/start-daytime-period";

function parseContentRefIds(contentRefs: string | null | undefined): string[] {
  if (!contentRefs?.trim()) return [];
  return contentRefs
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

async function loadPeriodWithLesson(dayLessonId: string) {
  return prisma.schoolDayLesson.findUnique({
    where: { id: dayLessonId },
    select: {
      id: true,
      schoolId: true,
      classroomId: true,
      dayOfWeek: true,
      title: true,
      subject: true,
      lessonType: true,
      startsAt: true,
      endsAt: true,
      skillFocus: true,
      lessonId: true,
      lesson: {
        select: {
          id: true,
          contentRefs: true,
          reviewStatus: true,
          machineHealthJson: true,
          teacherReviewedAt: true,
          teacherReviewedBy: true,
          title: true,
          subject: true,
          skillFocus: true,
        },
      },
    },
  });
}

export async function recomputeLessonHealthForPeriod(input: {
  dayLessonId: string;
}): Promise<{ ok: true; reviewStatus: LessonReviewStatus } | { ok: false; status: number; error: string }> {
  const period = await loadPeriodWithLesson(input.dayLessonId);
  if (!period?.lesson) {
    return { ok: false, status: 404, error: "Period lesson not found." };
  }

  const ids = parseContentRefIds(period.lesson.contentRefs);
  const rows = ids.length
    ? await prisma.aIContentCache.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          contentType: true,
          skillFocus: true,
          contentJson: true,
          metadataJson: true,
        },
      })
    : [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered = ids.map((id) => byId.get(id)).filter((row): row is NonNullable<typeof row> => Boolean(row));

  const health = evaluateDaytimeLessonHealth({
    startsAt: period.startsAt,
    endsAt: period.endsAt,
    subject: period.subject,
    skillFocus: period.skillFocus ?? period.lesson.skillFocus,
    stages: stagePacksFromContentRows(ordered),
  });
  const reviewStatus = reviewStatusFromHealth(health);

  await prisma.lesson.update({
    where: { id: period.lesson.id },
    data: {
      reviewStatus,
      machineHealthJson: serializeMachineHealth(health),
      teacherReviewedAt: null,
      teacherReviewedBy: null,
      updatedAt: new Date(),
    },
  });

  return { ok: true, reviewStatus };
}

export async function approveDaytimeLesson(input: {
  schoolId: string;
  dayLessonId: string;
  actorUserId: string;
}): Promise<
  | { ok: true; lessonId: string; reviewStatus: "approved" }
  | { ok: false; status: number; error: string; code?: string }
> {
  const period = await loadPeriodWithLesson(input.dayLessonId);
  if (!period || period.schoolId !== input.schoolId) {
    return { ok: false, status: 404, error: "Period not found." };
  }
  if (!period.lesson) {
    return { ok: false, status: 400, error: "No linked lesson for this period.", code: "NO_LESSON" };
  }
  if (!isPlayableDaytimeLessonType(period.lessonType)) {
    return { ok: false, status: 400, error: "This period is not a teachable lesson.", code: "NOT_PLAYABLE" };
  }

  // Refresh health before approve so Approve stays a hard gate.
  const recomputed = await recomputeLessonHealthForPeriod({ dayLessonId: period.id });
  if (!recomputed.ok) return recomputed;
  if (recomputed.reviewStatus === "machine_failed") {
    return {
      ok: false,
      status: 409,
      error: "Machine Lesson Health failed. Regenerate or repair before approving.",
      code: "MACHINE_FAILED",
    };
  }

  const contentIds = parseContentRefIds(period.lesson.contentRefs);
  if (!contentIds.length) {
    return { ok: false, status: 409, error: "No playable packs linked yet.", code: "NO_CONTENT" };
  }

  await prisma.$transaction([
    prisma.lesson.update({
      where: { id: period.lesson.id },
      data: {
        reviewStatus: "approved",
        teacherReviewedAt: new Date(),
        teacherReviewedBy: input.actorUserId,
        status: "ready",
        updatedAt: new Date(),
      },
    }),
    prisma.aIContentCache.updateMany({
      where: { id: { in: contentIds } },
      data: { status: "reviewed", reviewedAt: new Date() },
    }),
  ]);

  await writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    action: "daytime_lesson_approved",
    entityType: "lesson",
    entityId: period.lesson.id,
    metadata: { dayLessonId: period.id, contentIds },
  });

  return { ok: true, lessonId: period.lesson.id, reviewStatus: "approved" };
}

export async function regenerateDaytimeLesson(input: {
  schoolId: string;
  dayLessonId: string;
  actorUserId: string;
  regenerateReason?: string | null;
  allowWeeklyReview?: boolean | null;
  reviewReason?: string | null;
}): Promise<
  | { ok: true; created: number; blackBoxFailed: number; reviewStatus: LessonReviewStatus | null }
  | { ok: false; status: number; error: string }
> {
  const period = await loadPeriodWithLesson(input.dayLessonId);
  if (!period || period.schoolId !== input.schoolId) {
    return { ok: false, status: 404, error: "Period not found." };
  }

  const generated = await generateDaytimeLessonContent({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    classroomId: period.classroomId,
    dayOfWeek: period.dayOfWeek,
    force: true,
    dayLessonId: period.id,
    regenerateReason: input.regenerateReason ?? null,
    allowWeeklyReview: input.allowWeeklyReview,
    reviewReason: input.reviewReason ?? input.regenerateReason ?? null,
  });

  if (!generated.ok) {
    return { ok: false, status: generated.status, error: generated.error };
  }

  const health = await recomputeLessonHealthForPeriod({ dayLessonId: period.id });
  return {
    ok: true,
    created: generated.created,
    blackBoxFailed: generated.blackBoxFailed,
    reviewStatus: health.ok ? health.reviewStatus : null,
  };
}

export async function approveDaytimeDay(input: {
  schoolId: string;
  classroomId: string;
  dayOfWeek: number;
  actorUserId: string;
}): Promise<
  | {
      ok: true;
      approvedCount: number;
      playableCount: number;
      alreadyApproved: number;
      newlyApproved: number;
    }
  | { ok: false; status: number; error: string; code?: string; blockers?: string[] }
> {
  if (!input.classroomId.trim()) {
    return { ok: false, status: 400, error: "Select a class before approving the day." };
  }
  if (input.dayOfWeek < 1 || input.dayOfWeek > 5) {
    return { ok: false, status: 400, error: "Invalid weekday." };
  }

  const periods = await prisma.schoolDayLesson.findMany({
    where: {
      schoolId: input.schoolId,
      classroomId: input.classroomId,
      dayOfWeek: input.dayOfWeek,
      status: { not: "cancelled" },
    },
    select: {
      id: true,
      title: true,
      subject: true,
      lessonType: true,
      lesson: { select: { id: true, reviewStatus: true } },
    },
    orderBy: [{ periodIndex: "asc" }, { startsAt: "asc" }],
  });

  const playable = periods.filter((row) => isPlayableDaytimeLessonType(row.lessonType));
  if (!playable.length) {
    return { ok: false, status: 400, error: "No teachable periods on this day for the selected class." };
  }

  const blockers: string[] = [];
  let alreadyApproved = 0;
  const toApprove: string[] = [];

  for (const period of playable) {
    const status = period.lesson?.reviewStatus ?? "draft";
    if (status === "approved") {
      alreadyApproved += 1;
      continue;
    }
    if (status === "awaiting_review") {
      toApprove.push(period.id);
      continue;
    }
    blockers.push(`${period.subject}: ${period.title} (${status === "machine_failed" ? "machine failed" : "needs content"})`);
  }

  if (blockers.length) {
    return {
      ok: false,
      status: 409,
      error: `${alreadyApproved} of ${playable.length} approved. ${blockers.length} require attention.`,
      code: "DAY_NOT_READY",
      blockers,
    };
  }

  let newlyApproved = 0;
  for (const dayLessonId of toApprove) {
    const result = await approveDaytimeLesson({
      schoolId: input.schoolId,
      dayLessonId,
      actorUserId: input.actorUserId,
    });
    if (!result.ok) {
      blockers.push(result.error);
      continue;
    }
    newlyApproved += 1;
  }

  if (blockers.length) {
    return {
      ok: false,
      status: 409,
      error: "Some lessons could not be approved.",
      code: "DAY_PARTIAL",
      blockers,
    };
  }

  await writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    action: "daytime_day_approved",
    entityType: "classroom",
    entityId: input.classroomId,
    metadata: {
      dayOfWeek: input.dayOfWeek,
      playableCount: playable.length,
      alreadyApproved,
      newlyApproved,
    },
  });

  return {
    ok: true,
    approvedCount: playable.length,
    playableCount: playable.length,
    alreadyApproved,
    newlyApproved,
  };
}
