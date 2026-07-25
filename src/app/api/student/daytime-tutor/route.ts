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

const requestSchema = z.object({
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

  const isAdminPreview = session.role === "admin" && Boolean(payload.studentId);
  let childId: string | null = null;

  if (isAdminPreview) {
    childId = payload.studentId ?? null;
  } else {
    const parentScope = await resolveParentScope(session);
    if (!parentScope) {
      return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
    }

    childId = payload.studentId || await resolveParentActiveChildId(parentScope.parentId);
    if (!childId) {
      return NextResponse.json({ error: "No active learner selected." }, { status: 400 });
    }
    const owned = await prisma.childProfile.findFirst({
      where: { id: childId, parentId: parentScope.parentId, archived: false },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    const access = await ensureLearningAccessForDaytimePeriod({
      parentId: parentScope.parentId,
      childId,
      dayLessonId: payload.periodId,
    });
    if (access.response) return access.response;
  }

  if (!childId) {
    return NextResponse.json({ error: "No active learner selected." }, { status: 400 });
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

  // Never trust client-supplied answers as truth — context.question.modelAnswer is server-derived.
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
