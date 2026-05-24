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
    return NextResponse.json({ error: "Invalid completion payload." }, { status: 400 });
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

  state.status = "completed";
  state.completedAt = state.completedAt ?? new Date().toISOString();
  state.cursor = state.questions.length;
  state.levels = deriveQuickLevelFinderLevels(state);

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
    completed: true,
    session: {
      sessionId: state.sessionId,
      status: state.status,
      answered: state.responses.length,
      totalQuestions: state.questions.length,
      completedAt: state.completedAt,
    },
    levels: state.levels,
  });
}
