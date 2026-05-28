import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { parseQuickLevelFinderSession, sanitiseQuestion } from "@/lib/quick-level-finder";

export async function GET() {
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

  const student = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId, archived: false },
    select: {
      id: true,
      name: true,
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

  const sessionState = parseQuickLevelFinderSession(student.studentProfile?.aiLearningProfileJson ?? null);
  if (!sessionState) {
    return NextResponse.json({ error: "Quick Level Finder has not started." }, { status: 404 });
  }

  const rawCurrentQuestion = sessionState.questions[sessionState.cursor] ?? null;
  const safeCurrentQuestion = rawCurrentQuestion ? sanitiseQuestion(rawCurrentQuestion, sessionState.cursor) : null;
  if (safeCurrentQuestion !== rawCurrentQuestion && safeCurrentQuestion !== null) {
    console.warn(`[qlf-session] Repaired current question for student ${student.id}`);
  }

  return NextResponse.json({
    ok: true,
    student: {
      id: student.id,
      name: student.name,
    },
    session: {
      sessionId: sessionState.sessionId,
      status: sessionState.status,
      startedAt: sessionState.startedAt,
      completedAt: sessionState.completedAt,
      answered: sessionState.responses.length,
      totalQuestions: sessionState.questions.length,
      currentQuestion: safeCurrentQuestion,
      questionPreview: sessionState.questions.slice(sessionState.cursor, sessionState.cursor + 3),
      progressPercent: sessionState.questions.length > 0
        ? Math.round((sessionState.responses.length / sessionState.questions.length) * 100)
        : 0,
    },
  });
}
