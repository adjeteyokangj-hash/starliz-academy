import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { resolveDashboardTier } from "@/lib/dashboardResolver";
import { ensureLearningAccess } from "@/lib/subscriptions/learning-access";
import { getStudentLearningBrainForDashboard } from "@/lib/student-learning-brain";
import {
  createChildSelectionToken,
  getChildSelectionCookieName,
  getChildSelectionMaxAgeSeconds,
} from "@/lib/auth";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const params = new URL(request.url).searchParams;
  const manualRefresh = params.get("refresh") === "1";
  const requestedStudentId = params.get("studentId")?.trim() || null;
  const isAdminPreview = session.role === "admin" && Boolean(requestedStudentId);

  let parentScope: Awaited<ReturnType<typeof resolveParentScope>> = null;
  if (!isAdminPreview) {
    parentScope = await resolveParentScope(session);
    if (!parentScope) {
      return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
    }

    const access = await ensureLearningAccess(parentScope.parentId);
    if (access.response) return access.response;
  }

  const studentId = requestedStudentId
    ?? (parentScope ? await resolveParentActiveChildId(parentScope.parentId) : null);
  if (!studentId) {
    return NextResponse.json({
      ok: true,
      child: null,
      schoolEnrolment: null,
      assignments: [],
      skills: [],
      today: { nextActivity: null },
      assignedWorkSummary: { total: 0, active: 0, completed: 0, nextTitle: null },
      activeLanguageModules: [],
      assignedLanguageLessons: [],
      catchUpSummary: { total: 0, active: 0, completed: 0, overdue: 0, highPriority: 0 },
      masterMapSummary: { totalTopics: 0, needsCatchUpCount: 0, needsRevisionCount: 0, coveredCount: 0, averageScore: 0 },
      certificateProgressSummary: { issuedCount: 0, friendlyLabel: "Keep learning" },
      smartCoachSummary: { status: "pending", headline: "Choose a learner to begin.", weakCount: 0, masteredCount: 0 },
      snapshot: { available: false, refreshed: false, lastCalculatedAt: null },
    });
  }

  const child = await prisma.childProfile.findFirst({
    where: isAdminPreview
      ? { id: studentId, archived: false }
      : { id: studentId, parentId: parentScope!.parentId, archived: false },
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

  const [dashboardBrain, schoolEnrolment] = await Promise.all([
    getStudentLearningBrainForDashboard(studentId, { forceRefresh: manualRefresh }),
    prisma.schoolStudent.findFirst({
      where: {
        childId: studentId,
        status: "active",
        classroomId: { not: null },
      },
      select: {
        id: true,
        schoolId: true,
        classroomId: true,
        classroom: { select: { name: true, yearGroup: true } },
        school: { select: { name: true } },
      },
      orderBy: { joinedAt: "desc" },
    }),
  ]);
  if (!dashboardBrain) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  const reply = NextResponse.json({
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
    schoolEnrolment: schoolEnrolment?.classroomId
      ? {
          schoolStudentId: schoolEnrolment.id,
          schoolId: schoolEnrolment.schoolId,
          schoolName: schoolEnrolment.school.name,
          classroomId: schoolEnrolment.classroomId,
          classroomName: schoolEnrolment.classroom?.name ?? null,
          yearGroup: schoolEnrolment.classroom?.yearGroup ?? null,
        }
      : null,
    currentLevelSummary: {
      level: child.level,
      xp: child.xp,
      yearGroup: child.yearGroup,
      keyStage: child.studentProfile?.keyStageLevel ?? null,
    },
    assignments: dashboardBrain.assignments,
    activeLanguageModules: dashboardBrain.activeLanguageModules,
    assignedLanguageLessons: dashboardBrain.assignedLanguageLessons,
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

  // Sliding renewal: keep the learner on the student dashboard while actively learning
  // instead of bouncing to /parent/profiles after the 12h child-selection cookie expires.
  if (parentScope) {
    const selectionToken = await createChildSelectionToken(parentScope.parentId, studentId);
    reply.cookies.set(getChildSelectionCookieName(), selectionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getChildSelectionMaxAgeSeconds(),
    });
  }

  return reply;
}
