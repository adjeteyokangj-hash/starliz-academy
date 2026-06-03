import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
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

  const decisionBrain = await getProgressionDecisionBrainView({ studentId, parentId: parentScope.parentId });
  if (!decisionBrain) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  if (!decisionBrain.selectedSubjects.length) {
    return NextResponse.json({
      ok: false,
      code: "onboarding_required",
      message: "Choose subjects first to unlock progression recommendations.",
      recommendations: [],
      grouped: [],
      contentGaps: [],
    }, { status: 409 });
  }

  if (!decisionBrain.quick || decisionBrain.quick.status !== "completed") {
    return NextResponse.json({
      ok: false,
      code: "placement_required",
      message: "Complete Quick Level Finder to unlock progression recommendations.",
      recommendations: [],
      grouped: [],
      contentGaps: [],
    }, { status: 409 });
  }

  const progression = decisionBrain.progression;
  if (!progression) {
    return NextResponse.json({ error: "Unable to build progression recommendations." }, { status: 500 });
  }
  const totalEvidencePoints = decisionBrain.attempts.length
    + decisionBrain.assignments.length
    + decisionBrain.progressRecords.filter((row) => row.completed).length
    + decisionBrain.studentSkills.filter((row) => row.attempts > 0).length;

  return NextResponse.json({
    ok: true,
    student: {
      id: decisionBrain.student.id,
      name: decisionBrain.student.name,
      yearGroup: decisionBrain.student.yearGroup,
      keyStage: decisionBrain.student.studentProfile?.keyStageLevel ?? null,
    },
    message: progression.hasEvidence && totalEvidencePoints > 0
      ? "Progression recommendations generated."
      : "Not enough learning evidence yet.",
    recommendations: progression.recommendations,
    grouped: progression.grouped,
    contentGaps: progression.contentGaps,
    summary: decisionBrain.summary,
    heartbeatSummary: decisionBrain.heartbeatSummary,
    quickLevelFinderBaseline: decisionBrain.quickLevelFinderBaseline,
    languageReadiness: decisionBrain.languageReadiness,
  });
}
