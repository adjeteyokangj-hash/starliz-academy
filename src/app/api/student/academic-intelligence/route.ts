import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { getStudentLearningBrain } from "@/lib/student-learning-brain";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const includeSync = params.get("includeSync") === "1";
  const studentId = params.get("studentId") ?? await resolveParentActiveChildId(parentScope.parentId);
  if (!studentId) {
    return NextResponse.json({
      studentId: "",
      summary: {
        totalTopics: 0,
        byStatus: {
          not_started: 0,
          started: 0,
          practising: 0,
          needs_catch_up: 0,
          nearly_secure: 0,
          mastered: 0,
          needs_revision: 0,
        },
        needsCatchUpCount: 0,
        needsRevisionCount: 0,
        coveredCount: 0,
        averageScore: 0,
      },
      catchUpRecommendations: [],
      assessmentRecommendations: [],
      nextRecommendedActions: ["Complete a lesson to build your learning map."],
      generatedAt: new Date().toISOString(),
    });
  }

  const ownedChild = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId },
    select: { id: true },
  });
  if (!ownedChild) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const brain = await getStudentLearningBrain(studentId, {
    syncTasks: includeSync,
    actorUserId: session.userId,
    refreshDashboardSnapshot: true,
  });
  if (!brain) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  return NextResponse.json(brain.studentSafeAcademicIntelligence);
}
