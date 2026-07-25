import { prisma } from "@/lib/db";
import {
  AssignmentSafetyError,
  DuplicateAssignmentError,
  SchoolLicenceAccessError,
  assignContentToStudent,
  taskHrefForContentType,
} from "@/lib/assignments";
import { appendDaytimePeriodQuery, buildDaytimeSessionPlan } from "@/lib/schools/daytime-session-plan";
import {
  estimatedMinutesForItemCount,
  isPlayableDaytimeLessonType,
  minutesRemainingInPeriod,
  periodMinutes,
} from "@/lib/schools/school-day-period";

const STAGE_ORDER = ["warmup", "core", "stretch"] as const;

export { isPlayableDaytimeLessonType } from "@/lib/schools/school-day-period";

export function preferredContentTypesForPeriod(subject: string, skillFocus?: string | null): string[] {
  const s = subject.trim().toLowerCase();
  const skill = (skillFocus ?? "").trim().toLowerCase();

  if (s.includes("math") || skill.includes("fraction") || skill.includes("geometry") || skill.includes("number fact")) {
    return ["math", "maths"];
  }
  if (s.includes("spell") || skill.includes("spell") || skill.includes("phonic")) {
    return ["spelling"];
  }
  if (
    s.includes("read")
    || s === "english"
    || skill.includes("reading")
    || skill.includes("comprehension")
    || skill.includes("prosody")
    || skill.includes("inference")
    || skill.includes("writing")
    || skill.includes("sentence")
    || skill.includes("grammar")
    || skill.includes("oracy")
  ) {
    return ["reading", "english-language", "lesson"];
  }
  if (s.includes("science")) {
    return ["lesson", "science", "reading"];
  }
  if (s.includes("intervention")) {
    if (skill.includes("math") || skill.includes("number")) return ["math", "maths"];
    if (skill.includes("spell") || skill.includes("phonic")) return ["spelling"];
    return ["reading", "lesson", "math", "spelling"];
  }
  return ["lesson", "reading", "math", "spelling"];
}

export function practiceHrefForPeriod(subject: string, skillFocus?: string | null, dayLessonId?: string): string | null {
  const preferred = preferredContentTypesForPeriod(subject, skillFocus)[0] ?? "reading";
  const normalized = preferred.trim().toLowerCase();
  if (normalized === "lesson" || normalized === "science" || normalized.includes("gcse")) {
    return null;
  }
  const path = taskHrefForContentType(preferred);
  const params = new URLSearchParams({ daytime: "1" });
  if (subject.trim()) params.set("subject", subject.trim());
  if (skillFocus?.trim()) params.set("skill", skillFocus.trim());
  if (dayLessonId?.trim()) params.set("daytimePeriodId", dayLessonId.trim());
  return `${path}?${params.toString()}`;
}

type ContentCandidate = {
  id: string;
  contentType: string;
  yearGroup: string | null;
  skillFocus: string | null;
  status: string;
  metadataJson?: string | null;
};

type DayLessonRow = {
  id: string;
  schoolId: string;
  classroomId: string | null;
  subject: string;
  title: string;
  lessonType: string;
  yearGroup: string | null;
  skillFocus: string | null;
  startsAt: string;
  endsAt: string;
  lessonId: string | null;
  lesson: {
    id: string;
    contentRefs: string | null;
    yearGroup: string | null;
    skillFocus: string | null;
    reviewStatus?: string | null;
  } | null;
};

export type DaytimeSessionPlanDto = {
  stages: Array<{
    contentId: string;
    stageIndex: number;
    stage: string;
    label: string;
    estimatedMinutes: number;
    completed: boolean;
  }>;
  currentIndex: number;
  /** Teacher/student facing progress, e.g. "Stage 2 of 3". */
  progressLabel: string;
  periodEndsAt: string;
  periodMinutes: number;
  estimatedRemainingMinutes: number;
};

export type StartDaytimePeriodDeps = {
  findActiveEnrolment: (childId: string) => Promise<{
    id: string;
    schoolId: string;
    classroomId: string;
  } | null>;
  findDayLesson: (dayLessonId: string) => Promise<DayLessonRow | null>;
  findContentByIds: (ids: string[]) => Promise<ContentCandidate[]>;
  findCompletedContentIds: (studentId: string, contentIds: string[]) => Promise<string[]>;
  markContentCompleted?: (studentId: string, contentId: string) => Promise<void>;
  findCandidateContent: (input: {
    contentTypes: string[];
    yearGroup: string | null;
    skillFocus: string | null;
    limit: number;
  }) => Promise<ContentCandidate[]>;
  assignContent: (input: {
    studentId: string;
    contentId: string;
    actorUserId?: string;
  }) => Promise<{ id: string; contentType: string }>;
  getAssignmentContentType: (assignmentId: string) => Promise<string | null>;
  now?: () => Date;
};

export type StartDaytimePeriodResult =
  | {
      ok: true;
      href: string;
      assignmentId: string | null;
      mode: "assigned" | "practice" | "period_complete";
      contentId: string | null;
      periodTitle: string;
      sessionPlan: DaytimeSessionPlanDto | null;
    }
  | { ok: false; status: number; error: string; code?: string };

function parseContentRefIds(contentRefs: string | null | undefined): string[] {
  if (!contentRefs?.trim()) return [];
  return contentRefs
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseDaytimeSessionMeta(metadataJson: string | null | undefined): {
  stage?: string;
  stageIndex?: number;
  estimatedMinutes?: number;
  label?: string;
} | null {
  if (!metadataJson?.trim()) return null;
  try {
    const parsed = JSON.parse(metadataJson) as { daytimeSession?: Record<string, unknown> };
    const session = parsed.daytimeSession;
    if (!session || typeof session !== "object") return null;
    return {
      stage: typeof session.stage === "string" ? session.stage : undefined,
      stageIndex: typeof session.stageIndex === "number" ? session.stageIndex : undefined,
      estimatedMinutes: typeof session.estimatedMinutes === "number" ? session.estimatedMinutes : undefined,
      label: typeof session.label === "string" ? session.label : undefined,
    };
  } catch {
    return null;
  }
}

function rankCandidates(
  candidates: ContentCandidate[],
  yearGroup: string | null,
  skillFocus: string | null,
): ContentCandidate[] {
  const year = yearGroup?.trim().toLowerCase() ?? "";
  const skill = skillFocus?.trim().toLowerCase() ?? "";
  return [...candidates].sort((a, b) => {
    const aYear = year && a.yearGroup?.trim().toLowerCase() === year ? 1 : 0;
    const bYear = year && b.yearGroup?.trim().toLowerCase() === year ? 1 : 0;
    if (aYear !== bYear) return bYear - aYear;
    const aSkill = skill && (a.skillFocus ?? "").toLowerCase().includes(skill) ? 1 : 0;
    const bSkill = skill && (b.skillFocus ?? "").toLowerCase().includes(skill) ? 1 : 0;
    if (aSkill !== bSkill) return bSkill - aSkill;
    return 0;
  });
}

function buildSessionPlanDto(input: {
  orderedContent: ContentCandidate[];
  completedIds: Set<string>;
  currentContentId: string | null;
  startsAt: string;
  endsAt: string;
}): DaytimeSessionPlanDto {
  const plan = buildDaytimeSessionPlan(input.startsAt, input.endsAt);
  const stages = input.orderedContent.map((content, index) => {
    const meta = parseDaytimeSessionMeta(content.metadataJson);
    const stage = meta?.stage
      ?? STAGE_ORDER[Math.min(index, STAGE_ORDER.length - 1)]
      ?? "core";
    const stageIndex = meta?.stageIndex ?? index;
    const budget = plan.stages[Math.min(index, plan.stages.length - 1)];
    const estimatedMinutes = meta?.estimatedMinutes
      ?? budget?.estimatedMinutes
      ?? estimatedMinutesForItemCount(8);
    const label = meta?.label
      ?? budget?.label
      ?? (stage === "warmup" ? "Warm-up" : stage === "stretch" ? "Stretch" : "Core practice");
    return {
      contentId: content.id,
      stageIndex,
      stage,
      label,
      estimatedMinutes,
      completed: input.completedIds.has(content.id),
    };
  });

  const currentIndex = input.currentContentId
    ? Math.max(0, stages.findIndex((stage) => stage.contentId === input.currentContentId))
    : stages.findIndex((stage) => !stage.completed);

  const remaining = stages
    .filter((stage) => !stage.completed && stage.contentId !== input.currentContentId)
    .reduce((sum, stage) => sum + stage.estimatedMinutes, 0)
    + (input.currentContentId
      ? (stages.find((stage) => stage.contentId === input.currentContentId)?.estimatedMinutes ?? 0)
      : 0);

  const resolvedIndex = currentIndex >= 0 ? currentIndex : 0;
  const totalStages = Math.max(1, stages.length);

  return {
    stages,
    currentIndex: resolvedIndex,
    progressLabel: `Stage ${Math.min(resolvedIndex + 1, totalStages)} of ${totalStages}`,
    periodEndsAt: input.endsAt,
    periodMinutes: periodMinutes(input.startsAt, input.endsAt) || plan.periodMinutes,
    estimatedRemainingMinutes: remaining,
  };
}

function withSessionCurrentContent(
  sessionPlan: DaytimeSessionPlanDto | null,
  contentId: string | null | undefined,
): DaytimeSessionPlanDto | null {
  if (!sessionPlan) return null;
  const idx = contentId
    ? sessionPlan.stages.findIndex((stage) => stage.contentId === contentId)
    : sessionPlan.currentIndex;
  const currentIndex = idx >= 0 ? idx : 0;
  const total = Math.max(1, sessionPlan.stages.length);
  return {
    ...sessionPlan,
    currentIndex,
    progressLabel: `Stage ${Math.min(currentIndex + 1, total)} of ${total}`,
  };
}

export function createDefaultStartDaytimePeriodDeps(): StartDaytimePeriodDeps {
  return {
    findActiveEnrolment: async (childId) => {
      const row = await prisma.schoolStudent.findFirst({
        where: { childId, status: "active", classroomId: { not: null } },
        orderBy: { updatedAt: "desc" },
        select: { id: true, schoolId: true, classroomId: true },
      });
      if (!row?.classroomId) return null;
      return { id: row.id, schoolId: row.schoolId, classroomId: row.classroomId };
    },
    findDayLesson: async (dayLessonId) => {
      return prisma.schoolDayLesson.findUnique({
        where: { id: dayLessonId },
        select: {
          id: true,
          schoolId: true,
          classroomId: true,
          subject: true,
          title: true,
          lessonType: true,
          yearGroup: true,
          skillFocus: true,
          startsAt: true,
          endsAt: true,
          lessonId: true,
          lesson: {
            select: {
              id: true,
              contentRefs: true,
              yearGroup: true,
              skillFocus: true,
              reviewStatus: true,
            },
          },
        },
      });
    },
    findContentByIds: async (ids) => {
      if (!ids.length) return [];
      const rows = await prisma.aIContentCache.findMany({
        where: {
          id: { in: ids },
          status: { in: ["reviewed", "published"] },
        },
        select: {
          id: true,
          contentType: true,
          yearGroup: true,
          skillFocus: true,
          status: true,
          metadataJson: true,
        },
        take: 40,
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      return ids.map((id) => byId.get(id)).filter((row): row is NonNullable<typeof row> => Boolean(row));
    },
    findCompletedContentIds: async (studentId, contentIds) => {
      if (!contentIds.length) return [];
      const rows = await prisma.assignment.findMany({
        where: {
          studentId,
          contentId: { in: contentIds },
          status: "completed",
        },
        select: { contentId: true },
      });
      return rows.map((row) => row.contentId);
    },
    markContentCompleted: async (studentId, contentId) => {
      await prisma.assignment.updateMany({
        where: {
          studentId,
          contentId,
          status: { notIn: ["archived"] },
        },
        data: {
          status: "completed",
          completedAt: new Date(),
        },
      });
    },
    findCandidateContent: async ({ contentTypes, yearGroup, skillFocus, limit }) => {
      const uniqueTypes = Array.from(new Set(contentTypes.map((t) => t.trim().toLowerCase()).filter(Boolean)));
      if (!uniqueTypes.length) return [];

      const baseWhere = {
        status: { in: ["reviewed", "published"] as string[] },
        contentType: { in: uniqueTypes },
      };

      const preferred: ContentCandidate[] = [];
      if (yearGroup?.trim()) {
        const byYear = await prisma.aIContentCache.findMany({
          where: { ...baseWhere, yearGroup: yearGroup.trim() },
          select: {
            id: true,
            contentType: true,
            yearGroup: true,
            skillFocus: true,
            status: true,
            metadataJson: true,
          },
          orderBy: { usedCount: "asc" },
          take: limit,
        });
        preferred.push(...byYear);
      }

      if (preferred.length < limit) {
        const remaining = limit - preferred.length;
        const seen = new Set(preferred.map((row) => row.id));
        const broader = await prisma.aIContentCache.findMany({
          where: baseWhere,
          select: {
            id: true,
            contentType: true,
            yearGroup: true,
            skillFocus: true,
            status: true,
            metadataJson: true,
          },
          orderBy: { usedCount: "asc" },
          take: limit * 2,
        });
        for (const row of broader) {
          if (seen.has(row.id)) continue;
          preferred.push(row);
          seen.add(row.id);
          if (preferred.length >= limit) break;
        }
        void remaining;
      }

      return rankCandidates(preferred, yearGroup, skillFocus).slice(0, limit);
    },
    assignContent: async ({ studentId, contentId, actorUserId }) => {
      const assignment = await assignContentToStudent({
        studentId,
        contentId,
        actorUserId,
        reason: "daytime_school_period_start",
      });
      const content = await prisma.aIContentCache.findUnique({
        where: { id: contentId },
        select: { contentType: true },
      });
      return { id: assignment.id, contentType: content?.contentType ?? "lesson" };
    },
    getAssignmentContentType: async (assignmentId) => {
      const row = await prisma.assignment.findUnique({
        where: { id: assignmentId },
        select: { content: { select: { contentType: true } } },
      });
      return row?.content.contentType ?? null;
    },
    now: () => new Date(),
  };
}

async function resolvePeriodContext(
  input: { childId: string; dayLessonId: string },
  deps: StartDaytimePeriodDeps,
): Promise<
  | { ok: true; enrolment: { id: string; schoolId: string; classroomId: string }; period: DayLessonRow }
  | Extract<StartDaytimePeriodResult, { ok: false }>
> {
  const enrolment = await deps.findActiveEnrolment(input.childId);
  if (!enrolment) {
    return {
      ok: false,
      status: 404,
      error: "You are not enrolled in an active school class.",
      code: "NO_ENROLMENT",
    };
  }

  const period = await deps.findDayLesson(input.dayLessonId);
  if (!period) {
    return { ok: false, status: 404, error: "Period not found.", code: "PERIOD_NOT_FOUND" };
  }

  if (period.schoolId !== enrolment.schoolId || period.classroomId !== enrolment.classroomId) {
    return {
      ok: false,
      status: 403,
      error: "This period is not on your class timetable.",
      code: "CLASSROOM_MISMATCH",
    };
  }

  if (!isPlayableDaytimeLessonType(period.lessonType)) {
    return {
      ok: false,
      status: 400,
      error: "This period does not have a digital lesson to start.",
      code: "NOT_PLAYABLE",
    };
  }

  if (period.lesson) {
    const reviewStatus = period.lesson.reviewStatus ?? "draft";
    if (reviewStatus !== "approved") {
      return {
        ok: false,
        status: 409,
        error: reviewStatus === "machine_failed"
          ? "This lesson failed Lesson Health. Ask your teacher to regenerate or repair it."
          : "This lesson is not approved for class yet.",
        code: "LESSON_NOT_APPROVED",
      };
    }
  }

  return { ok: true, enrolment, period };
}

async function tryAssignContent(input: {
  deps: StartDaytimePeriodDeps;
  childId: string;
  contentId: string;
  contentType: string;
  actorUserId?: string;
  dayLessonId: string;
  periodTitle: string;
  sessionPlan: DaytimeSessionPlanDto | null;
}): Promise<StartDaytimePeriodResult | null> {
  try {
    const assignment = await input.deps.assignContent({
      studentId: input.childId,
      contentId: input.contentId,
      actorUserId: input.actorUserId,
    });
    const href = appendDaytimePeriodQuery(
      taskHrefForContentType(assignment.contentType, assignment.id),
      input.dayLessonId,
      { contentId: input.contentId },
    );
    return {
      ok: true,
      href,
      assignmentId: assignment.id,
      mode: "assigned",
      contentId: input.contentId,
      periodTitle: input.periodTitle,
      sessionPlan: withSessionCurrentContent(input.sessionPlan, input.contentId),
    };
  } catch (error) {
    if (error instanceof DuplicateAssignmentError) {
      const contentType = (await input.deps.getAssignmentContentType(error.assignmentId))
        ?? input.contentType;
      const href = appendDaytimePeriodQuery(
        taskHrefForContentType(contentType, error.assignmentId),
        input.dayLessonId,
        { contentId: input.contentId },
      );
      return {
        ok: true,
        href,
        assignmentId: error.assignmentId,
        mode: "assigned",
        contentId: input.contentId,
        periodTitle: input.periodTitle,
        sessionPlan: withSessionCurrentContent(input.sessionPlan, input.contentId),
      };
    }
    if (error instanceof SchoolLicenceAccessError) {
      return {
        ok: false,
        status: 403,
        error: "School licence blocks new lesson assignments right now.",
        code: "LICENCE_BLOCKED",
      };
    }
    if (error instanceof AssignmentSafetyError) {
      return null;
    }
    throw error;
  }
}

function practiceResult(input: {
  period: DayLessonRow;
  skillFocus: string | null;
  sessionPlan: DaytimeSessionPlanDto | null;
}): StartDaytimePeriodResult | null {
  const practiceHref = practiceHrefForPeriod(input.period.subject, input.skillFocus, input.period.id);
  if (!practiceHref) return null;
  return {
    ok: true,
    href: practiceHref,
    assignmentId: null,
    mode: "practice",
    contentId: null,
    periodTitle: input.period.title,
    sessionPlan: input.sessionPlan,
  };
}

export async function startDaytimePeriod(
  input: {
    childId: string;
    dayLessonId: string;
    actorUserId?: string;
  },
  deps: StartDaytimePeriodDeps = createDefaultStartDaytimePeriodDeps(),
): Promise<StartDaytimePeriodResult> {
  const resolved = await resolvePeriodContext(input, deps);
  if (!resolved.ok) return resolved;
  const { period } = resolved;

  const yearGroup = period.yearGroup ?? period.lesson?.yearGroup ?? null;
  const skillFocus = period.skillFocus ?? period.lesson?.skillFocus ?? null;
  const preferredTypes = preferredContentTypesForPeriod(period.subject, skillFocus);

  const linkedIds = parseContentRefIds(period.lesson?.contentRefs);
  const linkedContent = await deps.findContentByIds(linkedIds);
  const linkedReviewed = linkedContent.filter((row) =>
    row.status === "reviewed" || row.status === "published",
  );
  const completedIds = new Set(
    await deps.findCompletedContentIds(input.childId, linkedReviewed.map((row) => row.id)),
  );

  if (linkedReviewed.length > 0) {
    const sessionPlan = buildSessionPlanDto({
      orderedContent: linkedReviewed,
      completedIds,
      currentContentId: null,
      startsAt: period.startsAt,
      endsAt: period.endsAt,
    });
    const nextStage = linkedReviewed.find((row) => !completedIds.has(row.id));
    if (nextStage) {
      const assigned = await tryAssignContent({
        deps,
        childId: input.childId,
        contentId: nextStage.id,
        contentType: nextStage.contentType,
        actorUserId: input.actorUserId,
        dayLessonId: period.id,
        periodTitle: period.title,
        sessionPlan: withSessionCurrentContent(sessionPlan, nextStage.id),
      });
      if (assigned) return assigned;
    } else {
      const now = deps.now?.() ?? new Date();
      if (minutesRemainingInPeriod(period.endsAt, now) > 0) {
        const practice = practiceResult({ period, skillFocus, sessionPlan });
        if (practice) return practice;
      }
      return {
        ok: true,
        href: "/student/today",
        assignmentId: null,
        mode: "period_complete",
        contentId: null,
        periodTitle: period.title,
        sessionPlan,
      };
    }
  }

  const poolCandidates = await deps.findCandidateContent({
    contentTypes: preferredTypes,
    yearGroup,
    skillFocus,
    limit: 12,
  });

  const seen = new Set<string>();
  const candidates: ContentCandidate[] = [];
  for (const row of [...linkedReviewed, ...poolCandidates]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    candidates.push(row);
  }

  let lastSafetyReason: string | null = null;

  for (const candidate of candidates) {
    try {
      const assignment = await deps.assignContent({
        studentId: input.childId,
        contentId: candidate.id,
        actorUserId: input.actorUserId,
      });
      return {
        ok: true,
        href: appendDaytimePeriodQuery(
          taskHrefForContentType(assignment.contentType, assignment.id),
          period.id,
          { contentId: candidate.id },
        ),
        assignmentId: assignment.id,
        mode: "assigned",
        contentId: candidate.id,
        periodTitle: period.title,
        sessionPlan: null,
      };
    } catch (error) {
      if (error instanceof DuplicateAssignmentError) {
        const contentType = (await deps.getAssignmentContentType(error.assignmentId))
          ?? candidate.contentType;
        return {
          ok: true,
          href: appendDaytimePeriodQuery(
            taskHrefForContentType(contentType, error.assignmentId),
            period.id,
            { contentId: candidate.id },
          ),
          assignmentId: error.assignmentId,
          mode: "assigned",
          contentId: candidate.id,
          periodTitle: period.title,
          sessionPlan: null,
        };
      }
      if (error instanceof SchoolLicenceAccessError) {
        return {
          ok: false,
          status: 403,
          error: "School licence blocks new lesson assignments right now.",
          code: "LICENCE_BLOCKED",
        };
      }
      if (error instanceof AssignmentSafetyError) {
        lastSafetyReason = error.message;
        continue;
      }
      throw error;
    }
  }

  const practice = practiceResult({ period, skillFocus, sessionPlan: null });
  if (practice) return practice;

  return {
    ok: false,
    status: 409,
    error: lastSafetyReason
      ?? "No playable lesson content is ready for this period yet. Ask your teacher or admin to publish a matching lesson.",
    code: "NO_PLAYABLE_CONTENT",
  };
}

/** Assign the next incomplete stage (or practice filler) after a daytime stage completes. */
export async function continueDaytimePeriod(
  input: {
    childId: string;
    dayLessonId: string;
    completedContentId?: string | null;
    actorUserId?: string;
  },
  deps: StartDaytimePeriodDeps = createDefaultStartDaytimePeriodDeps(),
): Promise<StartDaytimePeriodResult> {
  const resolved = await resolvePeriodContext(input, deps);
  if (!resolved.ok) return resolved;
  const { period } = resolved;
  const skillFocus = period.skillFocus ?? period.lesson?.skillFocus ?? null;
  const now = deps.now?.() ?? new Date();

  if (minutesRemainingInPeriod(period.endsAt, now) <= 0) {
    return {
      ok: true,
      href: "/student/today",
      assignmentId: null,
      mode: "period_complete",
      contentId: null,
      periodTitle: period.title,
      sessionPlan: null,
    };
  }

  const linkedIds = parseContentRefIds(period.lesson?.contentRefs);
  const linkedContent = await deps.findContentByIds(linkedIds);
  const linkedReviewed = linkedContent.filter((row) =>
    row.status === "reviewed" || row.status === "published",
  );
  const completedIds = new Set(
    await deps.findCompletedContentIds(input.childId, linkedReviewed.map((row) => row.id)),
  );
  if (input.completedContentId) {
    completedIds.add(input.completedContentId);
    if (deps.markContentCompleted) {
      await deps.markContentCompleted(input.childId, input.completedContentId);
    }
  }

  const sessionPlan = linkedReviewed.length
    ? buildSessionPlanDto({
        orderedContent: linkedReviewed,
        completedIds,
        currentContentId: null,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
      })
    : null;

  const nextStage = linkedReviewed.find((row) => !completedIds.has(row.id));
  if (nextStage) {
    const assigned = await tryAssignContent({
      deps,
      childId: input.childId,
      contentId: nextStage.id,
      contentType: nextStage.contentType,
      actorUserId: input.actorUserId,
      dayLessonId: period.id,
      periodTitle: period.title,
      sessionPlan: withSessionCurrentContent(sessionPlan, nextStage.id),
    });
    if (assigned) return assigned;
  }

  const practice = practiceResult({ period, skillFocus, sessionPlan });
  if (practice) return practice;

  return {
    ok: true,
    href: "/student/today",
    assignmentId: null,
    mode: "period_complete",
    contentId: null,
    periodTitle: period.title,
    sessionPlan,
  };
}
