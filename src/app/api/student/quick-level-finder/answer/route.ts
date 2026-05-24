import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import {
  deriveQuickLevelFinderLevels,
  parseQuickLevelFinderSession,
  upsertQuickLevelFinderSession,
} from "@/lib/quick-level-finder";

const bodySchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  correct: z.boolean(),
  timeSpentMs: z.number().int().nonnegative().max(300_000).optional(),
});

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const studentId = await resolveParentActiveChildId(parentScope.parentId);
  if (!studentId) {
    return NextResponse.json({ error: "No active student selected." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid answer payload." }, { status: 400 });
  }

  const student = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId, archived: false },
    select: {
      id: true,
      studentProfile: {
        select: {
          aiLearningProfileJson: true,
        },
      },
    },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const state = parseQuickLevelFinderSession(student.studentProfile?.aiLearningProfileJson ?? null);
  if (!state) {
    return NextResponse.json({ error: "Quick Level Finder has not started." }, { status: 404 });
  }
  if (state.sessionId !== parsed.data.sessionId) {
    return NextResponse.json({ error: "Session mismatch. Please restart Quick Level Finder." }, { status: 409 });
  }
  if (state.status !== "in_progress") {
    return NextResponse.json({ error: "Quick Level Finder is already completed." }, { status: 409 });
  }

  const currentQuestion = state.questions[state.cursor] ?? null;
  if (!currentQuestion) {
    return NextResponse.json({ error: "No pending question in this session." }, { status: 409 });
  }
  if (currentQuestion.id !== parsed.data.questionId) {
    return NextResponse.json(
      {
        error: "Answer out of sequence.",
        expectedQuestionId: currentQuestion.id,
      },
      { status: 409 },
    );
  }

  state.responses.push({
    questionId: parsed.data.questionId,
    subject: currentQuestion.subject,
    correct: parsed.data.correct,
    timeSpentMs: parsed.data.timeSpentMs ?? 0,
    answeredAt: new Date().toISOString(),
  });
  state.cursor = Math.min(state.cursor + 1, state.questions.length);

  if (state.cursor >= state.questions.length) {
    state.status = "completed";
    state.completedAt = new Date().toISOString();
    state.levels = deriveQuickLevelFinderLevels(state);
  }

  const nextProfileJson = upsertQuickLevelFinderSession(student.studentProfile?.aiLearningProfileJson ?? null, state);
  await prisma.studentProfile.upsert({
    where: { childId: student.id },
    update: { aiLearningProfileJson: nextProfileJson },
    create: {
      childId: student.id,
      aiLearningProfileJson: nextProfileJson,
    },
  });

  return NextResponse.json({
    ok: true,
    completed: state.status === "completed",
    session: {
      sessionId: state.sessionId,
      status: state.status,
      answered: state.responses.length,
      totalQuestions: state.questions.length,
      currentQuestion: state.questions[state.cursor] ?? null,
      progressPercent: state.questions.length > 0
        ? Math.round((state.responses.length / state.questions.length) * 100)
        : 0,
    },
    levels: state.status === "completed" ? state.levels : null,
  });
}
