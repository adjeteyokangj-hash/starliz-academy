import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { resolveDashboardTier } from "@/lib/dashboardResolver";
import { ensureLearningAccess } from "@/lib/subscriptions/learning-access";
import { getStudentLearningBrainForDashboard } from "@/lib/student-learning-brain";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const access = await ensureLearningAccess(parentScope.parentId);
  if (access.response) return access.response;

  const params = new URL(request.url).searchParams;
  const manualRefresh = params.get("refresh") === "1";
  const studentId = params.get("studentId") ?? await resolveParentActiveChildId(parentScope.parentId);
  if (!studentId) {
    return NextResponse.json({
      ok: true,
      child: null,
      assignments: [],
      skills: [],
      today: { nextActivity: null },
      assignedWorkSummary: { total: 0, active: 0, completed: 0, nextTitle: null },
      catchUpSummary: { total: 0, active: 0, completed: 0, overdue: 0, highPriority: 0 },
      masterMapSummary: { totalTopics: 0, needsCatchUpCount: 0, needsRevisionCount: 0, coveredCount: 0, averageScore: 0 },
      certificateProgressSummary: { issuedCount: 0, friendlyLabel: "Keep learning" },
      smartCoachSummary: { status: "pending", headline: "Choose a learner to begin.", weakCount: 0, masteredCount: 0 },
      snapshot: { available: false, refreshed: false, lastCalculatedAt: null },
    });
  }

  const child = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId, archived: false },
    select: {
      id: true,
      name: true,
      stars: true,
      xp: true,
      coins: true,
      streak: true,
      level: true,
      yearGroup: true,
      age: true,
      studentProfile: {
        select: {
          dateOfBirth: true,
          keyStageLevel: true,
          aiLearningProfileJson: true,
        },
      },
    },
  });

  if (!child) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const dashboardBrain = await getStudentLearningBrainForDashboard(studentId, { forceRefresh: manualRefresh });
  if (!dashboardBrain) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  return NextResponse.json({
    ok: true,
    child: {
      id: child.id,
      name: child.name,
      stars: child.stars,
      xp: child.xp,
      coins: child.coins,
      weekStreak: child.streak,
      level: child.level,
      yearGroup: child.yearGroup,
      ageYears: child.age,
      dateOfBirth: child.studentProfile?.dateOfBirth?.toISOString() ?? null,
      keyStage: child.studentProfile?.keyStageLevel ?? null,
      dashboardTier: resolveDashboardTier({
        yearGroup: child.yearGroup,
        ageYears: child.age,
        dateOfBirth: child.studentProfile?.dateOfBirth?.toISOString() ?? null,
      }),
    },
    currentLevelSummary: {
      level: child.level,
      xp: child.xp,
      yearGroup: child.yearGroup,
      keyStage: child.studentProfile?.keyStageLevel ?? null,
    },
    assignments: dashboardBrain.assignments,
    skills: dashboardBrain.skills,
    today: {
      nextActivity: dashboardBrain.assignedWork.nextActivity,
    },
    assignedWorkSummary: {
      total: dashboardBrain.assignedWork.total,
      active: dashboardBrain.assignedWork.active,
      completed: dashboardBrain.assignedWork.completed,
      nextTitle: dashboardBrain.assignedWork.nextTitle,
    },
    catchUpSummary: dashboardBrain.catchUpSummary,
    masterMapSummary: dashboardBrain.masterMapSummary,
    certificateProgressSummary: dashboardBrain.certificateProgressSummary,
    smartCoachSummary: dashboardBrain.smartCoach,
    examReadinessSummary: dashboardBrain.examReadinessSummary,
    progressionRecommendationSummary: dashboardBrain.progressionRecommendationSummary,
    heartbeatSummary: dashboardBrain.heartbeatSummary,
    quickLevelFinderBaseline: dashboardBrain.quickLevelFinderBaseline,
    languageReadiness: dashboardBrain.languageReadiness,
    snapshot: dashboardBrain.snapshot,
  });
}
