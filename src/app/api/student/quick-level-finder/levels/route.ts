import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { parseQuickLevelFinderSession } from "@/lib/quick-level-finder";

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

  const state = parseQuickLevelFinderSession(student.studentProfile?.aiLearningProfileJson ?? null);
  if (!state) {
    return NextResponse.json({ error: "Quick Level Finder has not started." }, { status: 404 });
  }
  if (state.status !== "completed") {
    return NextResponse.json({ error: "Quick Level Finder is not completed yet." }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    student: {
      id: student.id,
      name: student.name,
    },
    session: {
      sessionId: state.sessionId,
      completedAt: state.completedAt,
      answered: state.responses.length,
      totalQuestions: state.questions.length,
    },
    levels: state.levels,
  });
}
