import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { getStudentLearningBrain } from "@/lib/student-learning-brain";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const params = new URL(request.url).searchParams;
  const includeSync = params.get("includeSync") === "1";
  const requestedStudentId = params.get("studentId")?.trim() || null;
  const isAdminPreview = session.role === "admin" && Boolean(requestedStudentId);

  let parentScope: Awaited<ReturnType<typeof resolveParentScope>> = null;
  if (!isAdminPreview) {
    parentScope = await resolveParentScope(session);
    if (!parentScope) {
      return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
    }
  }

  const studentId = requestedStudentId
    ?? (parentScope ? await resolveParentActiveChildId(parentScope.parentId) : null);
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
        denominatorCoverage: {
          expectedTopics: 0,
          coveredTopics: 0,
          missingTopics: 0,
          coveragePercent: 0,
          overIndexedTopics: [],
          underCoveredTopics: [],
          bySubject: [],
        },
      },
      masteryEvidenceGate: {
        status: "needs_review",
        allowedToProgress: false,
        confidenceScore: 0,
        gateReasons: [],
        reasonDetails: [],
        evidence: {
          denominatorCoveragePercent: 0,
          minimumAttempts: 0,
          multipleSessions: 0,
          retentionCheck: "more_data_needed",
          weakAreasActive: false,
          weakAreaCount: 0,
          confidenceScore: 0,
        },
      },
      weakAreaRevisitEffectiveness: {
        status: "insufficient_data",
        moreDataNeeded: true,
        relapseRisk: "low",
        summary: "More weak-area evidence is needed before revisit effectiveness can be judged.",
        topics: [],
      },
      recommendationQualityAudit: {
        recommendedAction: "review_placement",
        expectedOutcome: "Improve confidence in the next learning decision.",
        actualSignal: null,
        confidence: 0,
        risk: "high",
        aligned: false,
        evidenceLevel: "low",
        note: "No recommendation accuracy data is available yet.",
      },
      learningTwinAttribution: {
        preferredExplanationStyle: "step_by_step_explanation",
        supportingEvidence: [],
        outcomeTrend: "insufficient_data",
        confidence: 0,
        moreDataNeeded: true,
        note: "No learning twin attribution data is available yet.",
      },
      catchUpRecommendations: [],
      assessmentRecommendations: [],
      gcseCalibration: null,
      nextRecommendedActions: ["Complete a lesson to build your learning map."],
      generatedAt: new Date().toISOString(),
    });
  }

  const ownedChild = await prisma.childProfile.findFirst({
    where: isAdminPreview
      ? { id: studentId, archived: false }
      : { id: studentId, parentId: parentScope!.parentId },
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
