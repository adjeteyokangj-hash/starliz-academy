import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { buildAcademicSourceForStudent } from "@/lib/academic-intelligence/data";
import { buildAcademicIntelligence } from "@/lib/academic-intelligence/academicIntelligence";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const childId = params.get("childId")?.trim();
  if (!childId) return NextResponse.json({ error: "childId is required." }, { status: 400 });

  const ownedChild = await prisma.childProfile.findFirst({
    where: { id: childId, parentId: parentScope.parentId },
    select: { id: true },
  });
  if (!ownedChild) return NextResponse.json({ error: "Child not found." }, { status: 404 });

  const child = await buildAcademicSourceForStudent(childId);
  if (!child) return NextResponse.json({ error: "Child not found." }, { status: 404 });

  const output = buildAcademicIntelligence(child);
  return NextResponse.json({
    studentId: output.studentId,
    summary: output.summary,
    curriculumCoverage: output.curriculumCoverage,
    catchUpRecommendations: output.catchUpRecommendations,
    assessmentReadiness: output.assessmentReadiness,
    examReadinessProfile: output.examReadinessProfile,
    schoolWeekModePlan: output.schoolWeekModePlan,
    masteryExpansion: output.masteryExpansion,
    gcseReadiness: output.gcseReadiness,
    reviewActions: output.reviewActions,
    reportNotes: output.reportNotes,
    parentExplanation: "Use these recommendations to support confidence and steady progress at home.",
    generatedAt: output.generatedAt,
  });
}
