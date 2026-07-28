import { prisma } from "@/lib/db";
import { getOrCreateSupportPolicy } from "@/lib/schools/human-support-presence";

function isFreshHeartbeat(lastHeartbeatAt: Date, staleAfterSec: number, now: Date): boolean {
  return now.getTime() - lastHeartbeatAt.getTime() <= staleAfterSec * 1000;
}

/**
 * Count Day School–linked live teaching heartbeats (not Short Learning–only presence).
 */
export async function countLiveTeachingHeartbeats(input: {
  schoolId: string;
  currentPeriodIds: string[];
  teachingTeacherIds: string[];
  now?: Date;
}): Promise<number> {
  const now = input.now ?? new Date();
  const currentPeriodIds = new Set(input.currentPeriodIds.filter(Boolean));
  const teachingTeacherIds = new Set(input.teachingTeacherIds.filter(Boolean));
  if (currentPeriodIds.size === 0 && teachingTeacherIds.size === 0) return 0;

  const policy = await getOrCreateSupportPolicy(input.schoolId);
  const staleAfterSec = policy.staleAfterSec ?? 75;

  const rows = await prisma.tutorPresence.findMany({
    where: {
      schoolId: input.schoolId,
      status: { in: ["available", "busy"] },
      dayLessonId: { not: null },
    },
    select: {
      schoolTeacherId: true,
      dayLessonId: true,
      lastHeartbeatAt: true,
      status: true,
    },
  });

  let count = 0;
  for (const row of rows) {
    if (!isFreshHeartbeat(row.lastHeartbeatAt, staleAfterSec, now)) continue;
    const dayLessonId = row.dayLessonId;
    if (!dayLessonId) continue;
    const linkedToCurrentPeriod = currentPeriodIds.has(dayLessonId);
    const teachingNowWithLesson =
      teachingTeacherIds.has(row.schoolTeacherId) && Boolean(dayLessonId);
    if (linkedToCurrentPeriod || teachingNowWithLesson) {
      count += 1;
    }
  }
  return count;
}