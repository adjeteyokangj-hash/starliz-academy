import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { buildAcademicSourceForStudent } from "@/lib/academic-intelligence/data";
import { buildAcademicIntelligence, toStudentSafeAcademicIntelligence } from "@/lib/academic-intelligence/academicIntelligence";
import { listCatchUpTasks, syncCatchUpTasks } from "@/lib/academic-intelligence/catchUpTasks";
import { listHomeworkTasks, syncHomeworkTasks } from "@/lib/academic-intelligence/homeworkTasks";

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

  const child = await buildAcademicSourceForStudent(childId);
  if (!child) return NextResponse.json({ error: "Child not found." }, { status: 404 });

  const existingTasks = await listCatchUpTasks(childId);
  const existingHomework = await listHomeworkTasks(childId);
  let output = buildAcademicIntelligence(child, { existingCatchUpTasks: existingTasks, existingHomeworkTasks: existingHomework });

  if (includeSync) {
    const syncedTasks = await syncCatchUpTasks({
      studentId: childId,
      recommendations: output.catchUpRecommendations,
      schoolWeekModePlan: output.schoolWeekModePlan,
      actorUserId: session.userId,
    });
    const syncedHomework = await syncHomeworkTasks({
      studentId: childId,
      schoolWeekModePlan: output.schoolWeekModePlan,
      actorUserId: session.userId,
    });
    output = buildAcademicIntelligence(child, { existingCatchUpTasks: syncedTasks, existingHomeworkTasks: syncedHomework });
  }

  const safe = toStudentSafeAcademicIntelligence(output);

  return NextResponse.json({
    studentId: safe.studentId,
    summary: safe.summary,
    curriculumCoverage: safe.curriculumCoverage,
    catchUpRecommendations: safe.catchUpRecommendations,
    catchUpTasks: safe.catchUpTasks,
    homeworkTasks: safe.homeworkTasks,
    quickLevelFinderBaseline: child.quickLevelFinderBaseline,
    assessmentReadiness: output.assessmentReadiness,
    examReadinessProfile: safe.examReadinessProfile,
    schoolWeekModePlan: safe.schoolWeekModePlan,
    masteryExpansion: safe.masteryExpansion,
    gcseReadiness: output.gcseReadiness,
    curriculumIntelligenceGraph: safe.curriculumIntelligenceGraph,
    reviewActions: output.reviewActions,
    reportNotes: output.reportNotes,
    parentExplanation: "Use these recommendations to support confidence and steady progress at home.",
    generatedAt: safe.generatedAt,
  });
}
