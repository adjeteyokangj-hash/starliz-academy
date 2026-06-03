import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { getProgressionDecisionBrainView } from "@/lib/student-learning-brain";

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
      yearGroup: true,
      studentProfile: {
        select: {
          keyStageLevel: true,
          aiLearningProfileJson: true,
        },
      },
    },
  });

  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const decisionBrain = await getProgressionDecisionBrainView({ studentId: student.id, parentId: parentScope.parentId });
  if (!decisionBrain?.quick || decisionBrain.quick.status !== "completed") {
    return NextResponse.json({
      ok: true,
      student: { id: student.id, name: student.name },
      recommendations: [],
      grouped: [],
      contentGaps: [],
      placementCompleted: false,
    });
  }

  return NextResponse.json({
    ok: true,
    student: {
      id: student.id,
      name: student.name,
      yearGroup: student.yearGroup,
      keyStage: student.studentProfile?.keyStageLevel ?? null,
    },
    placementCompleted: true,
    recommendations: decisionBrain.placementLessons.recommendations,
    grouped: decisionBrain.placementLessons.grouped,
    contentGaps: decisionBrain.placementLessons.contentGaps,
    heartbeatSummary: decisionBrain.heartbeatSummary,
    quickLevelFinderBaseline: decisionBrain.quickLevelFinderBaseline,
  });
}
