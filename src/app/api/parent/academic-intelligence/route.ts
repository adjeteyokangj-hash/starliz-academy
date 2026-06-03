import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
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
  const childId = params.get("childId")?.trim();
  const includeSync = params.get("includeSync") === "1";
  if (!childId) return NextResponse.json({ error: "childId is required." }, { status: 400 });

  const ownedChild = await prisma.childProfile.findFirst({
    where: { id: childId, parentId: parentScope.parentId },
    select: { id: true },
  });
  if (!ownedChild) return NextResponse.json({ error: "Child not found." }, { status: 404 });

  const brain = await getStudentLearningBrain(childId, {
    syncTasks: includeSync,
    actorUserId: session.userId,
  });
  if (!brain) return NextResponse.json({ error: "Child not found." }, { status: 404 });
  const safe = brain.studentSafeAcademicIntelligence;

  return NextResponse.json({
    studentId: safe.studentId,
    summary: safe.summary,
    curriculumCoverage: safe.curriculumCoverage,
    catchUpRecommendations: safe.catchUpRecommendations,
    catchUpTasks: safe.catchUpTasks,
    homeworkTasks: safe.homeworkTasks,
    quickLevelFinderBaseline: brain.quickLevelFinderBaseline,
    assessmentReadiness: brain.academicIntelligence.assessmentReadiness,
    examReadinessProfile: safe.examReadinessProfile,
    schoolWeekModePlan: safe.schoolWeekModePlan,
    masteryExpansion: safe.masteryExpansion,
    gcseReadiness: brain.academicIntelligence.gcseReadiness,
    curriculumIntelligenceGraph: safe.curriculumIntelligenceGraph,
    reviewActions: brain.academicIntelligence.reviewActions,
    reportNotes: brain.academicIntelligence.reportNotes,
    parentExplanation: "Use these recommendations to support confidence and steady progress at home.",
    generatedAt: safe.generatedAt,
  });
}
