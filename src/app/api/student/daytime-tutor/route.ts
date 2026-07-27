import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getRequestIp, requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { ensureLearningAccessForDaytimePeriod } from "@/lib/subscriptions/learning-access";
import {
  AI_TUTOR_SCOPE_DAYTIME_SCHOOL,
  assertDaytimeSchoolTutorAccess,
} from "@/lib/schools/daytime-school-tutor-access";
import {
  DAYTIME_TUTOR_INTENTS,
  respondDaytimeSchoolTutor,
} from "@/lib/schools/daytime-school-tutor";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import { AI_TUTOR_SCOPE_SHORT_LEARNING } from "@/lib/schools/short-learning-support-context";
import { assertShortLearningTutorAccess } from "@/lib/schools/short-learning-tutor-access";
import { shortLearningSupportMetadata } from "@/lib/schools/short-learning-support-context";
import { syncShortLearningEligibleQueue } from "@/lib/schools/human-support-scheduler";
import { resolveStudentHumanSupportEligibility } from "@/lib/schools/support-eligibility";

const daytimeSchema = z.object({
  aiTutorScope: z.literal(AI_TUTOR_SCOPE_DAYTIME_SCHOOL),
  assignmentId: z.string().trim().min(1),
  contentId: z.string().trim().min(1),
  periodId: z.string().trim().min(1),
  questionId: z.string().trim().min(1).optional(),
  questionIndex: z.number().int().min(0).optional(),
  intent: z.enum(DAYTIME_TUTOR_INTENTS),
  word: z.string().trim().max(80).optional(),
  studentAttempt: z.string().trim().max(500).optional(),
  conversationId: z.string().trim().min(1).optional(),
  studentId: z.string().trim().min(1).optional(),
});

const shortLearningSchema = z.object({
  aiTutorScope: z.literal(AI_TUTOR_SCOPE_SHORT_LEARNING),
  shortLearningBookingId: z.string().trim().min(1),
  shortLearningSessionId: z.string().trim().min(1).optional(),
  shortLearningBlockId: z.string().trim().min(1).optional(),
  assignmentId: z.string().trim().min(1),
  contentId: z.string().trim().min(1),
  questionId: z.string().trim().min(1).optional(),
  questionIndex: z.number().int().min(0).optional(),
  intent: z.enum(DAYTIME_TUTOR_INTENTS),
  word: z.string().trim().max(80).optional(),
  studentAttempt: z.string().trim().max(500).optional(),
  conversationId: z.string().trim().min(1).optional(),
  studentId: z.string().trim().min(1).optional(),
});

const requestSchema = z.union([daytimeSchema, shortLearningSchema]);

async function resolveChildId(input: {
  session: { userId: string; role: string };
  payloadStudentId?: string;
}): Promise<{ childId: string | null; error?: NextResponse; isAdminPreview: boolean }> {
  const isAdminPreview = input.session.role === "admin" && Boolean(input.payloadStudentId);
  if (isAdminPreview) {
    return { childId: input.payloadStudentId ?? null, isAdminPreview: true };
  }

  // Student role with child cookie / parent scope
  if (input.session.role === "teacher" || input.session.role === "admin") {
    return {
      childId: null,
      isAdminPreview: false,
      error: NextResponse.json({ error: "Select a child profile first." }, { status: 400 }),
    };
  }

  const parentScope = await resolveParentScope(input.session as never);
  if (!parentScope) {
    return {
      childId: null,
      isAdminPreview: false,
      error: NextResponse.json({ error: "Parent account not found." }, { status: 404 }),
    };
  }

  const childId = input.payloadStudentId || (await resolveParentActiveChildId(parentScope.parentId));
  if (!childId) {
    return {
      childId: null,
      isAdminPreview: false,
      error: NextResponse.json({ error: "No active learner selected." }, { status: 400 }),
    };
  }
  const owned = await prisma.childProfile.findFirst({
    where: { id: childId, parentId: parentScope.parentId, archived: false },
    select: { id: true },
  });
  if (!owned) {
    return {
      childId: null,
      isAdminPreview: false,
      error: NextResponse.json({ error: "Student not found." }, { status: 404 }),
    };
  }
  return { childId, isAdminPreview: false };
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid School AI Tutor request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  const resolvedChild = await resolveChildId({
    session,
    payloadStudentId: payload.studentId,
  });
  if (resolvedChild.error) return resolvedChild.error;
  const childId = resolvedChild.childId;
  if (!childId) {
    return NextResponse.json({ error: "No active learner selected." }, { status: 400 });
  }

  if (payload.aiTutorScope === AI_TUTOR_SCOPE_DAYTIME_SCHOOL && !resolvedChild.isAdminPreview) {
    const parentScope = await resolveParentScope(session);
    if (parentScope) {
      const access = await ensureLearningAccessForDaytimePeriod({
        parentId: parentScope.parentId,
        childId,
        dayLessonId: payload.periodId,
      });
      if (access.response) return access.response;
    }
  }

  const ip = getRequestIp(request);
  const rate = checkRateLimit({
    key: `daytime-tutor:${childId}:${payload.assignmentId}:${ip}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many tutor requests. Please wait a moment.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  if (payload.aiTutorScope === AI_TUTOR_SCOPE_SHORT_LEARNING) {
    const access = await assertShortLearningTutorAccess({
      studentId: childId,
      bookingId: payload.shortLearningBookingId,
      assignmentId: payload.assignmentId,
      contentId: payload.contentId,
      blockId: payload.shortLearningBlockId,
      sessionId: payload.shortLearningSessionId,
      questionId: payload.questionId,
      questionIndex: payload.questionIndex,
      studentAttempt: payload.studentAttempt,
    });
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error, code: access.code },
        { status: access.status },
      );
    }

    const tutor = await respondDaytimeSchoolTutor({
      context: {
        ...access.context,
        studentAttempt: payload.studentAttempt?.trim() || access.context.studentAttempt,
      },
      intent: payload.intent,
      word: payload.word,
      conversationId: payload.conversationId,
    });

    const sl = access.slContext!;
    const meta = shortLearningSupportMetadata(sl, {
      questionId: access.context.question.id,
      intent: payload.intent,
      needsTeacher: tutor.needsTeacher,
    });

    await writeSchoolAuditLog({
      schoolId: sl.schoolId,
      actorUserId: session.userId,
      source: "api",
      action: "daytime_tutor_help",
      entityType: "assignment",
      entityId: sl.assignmentId,
      metadata: meta,
    });

    let humanSupport: Record<string, unknown> | null = null;
    if (tutor.needsTeacher) {
      await writeSchoolAuditLog({
        schoolId: sl.schoolId,
        actorType: "system",
        source: "api",
        action: "human_support_eligible",
        entityType: "student",
        entityId: childId,
        metadata: { ...meta, aiExhausted: true, stage: "ai_help_exhausted" },
      });

      const eligibility = resolveStudentHumanSupportEligibility({
        mode: "SHORT_LEARNING",
        aiExhausted: true,
        studentRecovered: false,
        bookingActive: true,
      });
      const minutesUntilBookingEnd = Math.max(
        1,
        Math.ceil((sl.bookingEndsAt.getTime() - Date.now()) / 60_000),
      );
      const sync = await syncShortLearningEligibleQueue({
        schoolId: sl.schoolId,
        classroomId: sl.classroomId,
        supportScopeKey: sl.supportScopeKey,
        minutesUntilBookingEnd,
        childId,
        humanTutorEligible: eligibility.humanTutorEligible,
        assignmentId: sl.assignmentId,
        questionKey: access.context.question.id,
        metadata: meta,
      });
      humanSupport = {
        state: sync.humanSupportState,
        queued: sync.queued,
        continueAi: sync.continueAi,
        unmetEscalation: sync.unmetEscalation,
        summary: sync.humanSupportState === "ai-only" ? "ai-only" : sync.humanSupportState,
        wording: {
          aiAvailable: "AI support is available throughout.",
          humanMayBeOffered: "Human support may be offered when available.",
          notGuaranteed: "Human support is not guaranteed.",
          notPrivate: "This is not a private one-to-one tutor booking.",
        },
      };
    }

    return NextResponse.json({
      conversationId: tutor.conversationId,
      source: tutor.source,
      intent: tutor.intent,
      message: tutor.message,
      hintLevel: tutor.hintLevel,
      revealsAnswer: tutor.revealsAnswer,
      canAskAgain: tutor.canAskAgain,
      nextSuggestedIntents: tutor.nextSuggestedIntents,
      periodEndsAt: tutor.periodEndsAt,
      bookingEndsAt: sl.bookingEndsAt.toISOString(),
      needsTeacher: tutor.needsTeacher,
      supportMode: "SHORT_LEARNING",
      shortLearningBookingId: sl.bookingId,
      shortLearningSessionId: sl.sessionId,
      shortLearningBlockId: sl.blockId,
      humanSupport,
    });
  }

  const access = await assertDaytimeSchoolTutorAccess({
    studentId: childId,
    periodId: payload.periodId,
    assignmentId: payload.assignmentId,
    contentId: payload.contentId,
    questionId: payload.questionId,
    questionIndex: payload.questionIndex,
    studentAttempt: payload.studentAttempt,
  });

  if (!access.ok) {
    return NextResponse.json(
      { error: access.error, code: access.code },
      { status: access.status },
    );
  }

  const tutor = await respondDaytimeSchoolTutor({
    context: {
      ...access.context,
      studentAttempt: payload.studentAttempt?.trim() || access.context.studentAttempt,
    },
    intent: payload.intent,
    word: payload.word,
    conversationId: payload.conversationId,
  });

  return NextResponse.json({
    conversationId: tutor.conversationId,
    source: tutor.source,
    intent: tutor.intent,
    message: tutor.message,
    hintLevel: tutor.hintLevel,
    revealsAnswer: tutor.revealsAnswer,
    canAskAgain: tutor.canAskAgain,
    nextSuggestedIntents: tutor.nextSuggestedIntents,
    periodEndsAt: tutor.periodEndsAt,
    needsTeacher: tutor.needsTeacher,
  });
}
