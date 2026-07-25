import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { ensureLearningAccessForDaytimePeriod } from "@/lib/subscriptions/learning-access";
import { buildDaytimeSessionPlan } from "@/lib/schools/daytime-session-plan";
import {
  formatClockRange,
  studentHumanSupportDisplay,
  toStudentFacingSessionPlan,
  type StudentFacingSessionPlan,
} from "@/lib/schools/daytime-lesson-ui";
import { countOnlineTutors, getOrCreateSupportPolicy } from "@/lib/schools/human-support-presence";
import { getActiveGuidanceForChild } from "@/lib/schools/human-support-scheduler";
import type { DaytimeSessionPlanDto } from "@/lib/schools/start-daytime-period";

type RouteContext = {
  params: Promise<{ dayLessonId: string }>;
};

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

/**
 * Student-facing daytime lesson chrome context.
 * Never returns internal content / assignment / period DB ids in display fields.
 */
export async function GET(request: Request, context: RouteContext) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const { dayLessonId: rawId } = await context.params;
  const dayLessonId = rawId?.trim();
  if (!dayLessonId) {
    return NextResponse.json({ error: "Missing period id." }, { status: 400 });
  }

  const params = new URL(request.url).searchParams;
  const contentId = params.get("contentId")?.trim() || null;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const childId = await resolveParentActiveChildId(parentScope.parentId);
  if (!childId) {
    return NextResponse.json({ error: "No active learner selected." }, { status: 400 });
  }

  const access = await ensureLearningAccessForDaytimePeriod({
    parentId: parentScope.parentId,
    childId,
    dayLessonId,
  });
  if (access.response) return access.response;

  const enrolment = await prisma.schoolStudent.findFirst({
    where: { childId, status: "active", classroomId: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { schoolId: true, classroomId: true },
  });
  if (!enrolment?.classroomId) {
    return NextResponse.json({ error: "No school enrolment found." }, { status: 404 });
  }

  const period = await prisma.schoolDayLesson.findFirst({
    where: {
      id: dayLessonId,
      schoolId: enrolment.schoolId,
      classroomId: enrolment.classroomId,
    },
    select: {
      id: true,
      title: true,
      subject: true,
      skillFocus: true,
      room: true,
      startsAt: true,
      endsAt: true,
      lesson: {
        select: {
          title: true,
          contentRefs: true,
          skillFocus: true,
        },
      },
      teacher: {
        select: {
          user: { select: { name: true } },
        },
      },
      classroom: { select: { name: true } },
    },
  });

  if (!period) {
    return NextResponse.json({ error: "Period not found for this learner." }, { status: 404 });
  }

  const contentRefIds = (period.lesson?.contentRefs ?? "")
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const contents = contentRefIds.length
    ? await prisma.aIContentCache.findMany({
        where: { id: { in: contentRefIds } },
        select: { id: true, metadataJson: true },
        take: 40,
      })
    : [];
  const byId = new Map(contents.map((row) => [row.id, row]));

  const completedRows = contentRefIds.length
    ? await prisma.assignment.findMany({
        where: {
          studentId: childId,
          contentId: { in: contentRefIds },
          status: "completed",
        },
        select: { contentId: true },
      })
    : [];
  const completedIds = new Set(completedRows.map((row) => row.contentId));

  const budgetPlan = buildDaytimeSessionPlan(period.startsAt, period.endsAt);
  const stages = contentRefIds.map((id, index) => {
    const meta = parseDaytimeSessionMeta(byId.get(id)?.metadataJson);
    const stage = meta?.stage ?? (index === 0 ? "warmup" : index === 1 ? "core" : "stretch");
    const budget = budgetPlan.stages[Math.min(index, budgetPlan.stages.length - 1)];
    return {
      contentId: id,
      stageIndex: meta?.stageIndex ?? index,
      stage,
      label: meta?.label ?? budget?.label ?? "Core practice",
      estimatedMinutes: meta?.estimatedMinutes ?? budget?.estimatedMinutes ?? 8,
      completed: completedIds.has(id),
    };
  });

  const currentIndex = contentId
    ? Math.max(0, stages.findIndex((stage) => stage.contentId === contentId))
    : Math.max(0, stages.findIndex((stage) => !stage.completed));

  const sessionPlanDto: DaytimeSessionPlanDto | null = stages.length
    ? {
        stages,
        currentIndex: currentIndex >= 0 ? currentIndex : 0,
        progressLabel: `Stage ${Math.min((currentIndex >= 0 ? currentIndex : 0) + 1, stages.length)} of ${stages.length}`,
        periodEndsAt: period.endsAt,
        periodMinutes: budgetPlan.periodMinutes,
        estimatedRemainingMinutes: stages
          .filter((stage) => !stage.completed)
          .reduce((sum, stage) => sum + stage.estimatedMinutes, 0),
      }
    : null;

  const sessionPlan: StudentFacingSessionPlan | null = toStudentFacingSessionPlan(sessionPlanDto);

  const policy = await getOrCreateSupportPolicy(enrolment.schoolId);
  const tutorCounts = await countOnlineTutors({
    schoolId: enrolment.schoolId,
    staleAfterSec: policy.staleAfterSec,
  });

  const active = await getActiveGuidanceForChild({
    schoolId: enrolment.schoolId,
    childId,
  });

  const queueEntry = await prisma.humanSupportQueueEntry.findFirst({
    where: {
      schoolId: enrolment.schoolId,
      childId,
      periodId: dayLessonId,
      status: { in: ["waiting", "assigned", "in_session"] },
    },
    select: { status: true },
  });

  const humanSupport = studentHumanSupportDisplay({
    onlineTutorCount: tutorCounts.onlineTutorCount,
    availableTutorCount: tutorCounts.availableTutorCount,
    busyTutorCount: tutorCounts.busyTutorCount,
    studentQueued: Boolean(queueEntry && queueEntry.status !== "in_session" && !active),
    studentSessionActive: Boolean(active),
    plannedEndsAt: active?.plannedEndsAt ?? null,
  });

  const teacherName = period.teacher?.user.name?.trim() || null;
  const lessonTitle = period.lesson?.title?.trim() || period.title;
  const skillFocus = period.skillFocus?.trim() || period.lesson?.skillFocus?.trim() || null;

  return NextResponse.json({
    ok: true,
    lesson: {
      title: lessonTitle,
      subject: period.subject,
      skillFocus,
      room: period.room?.trim() || period.classroom?.name?.trim() || null,
      teacherName,
      scheduledPeriod: formatClockRange(period.startsAt, period.endsAt),
      startsAt: period.startsAt,
      endsAt: period.endsAt,
    },
    sessionPlan,
    teacherGuidance: active?.guidance
      ? {
          text: active.guidance.text,
          teacherName,
        }
      : null,
    humanSupport: {
      state: humanSupport.state,
      label: humanSupport.label,
      minutesRemaining: humanSupport.minutesRemaining,
    },
  });
}
