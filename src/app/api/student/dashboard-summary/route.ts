import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { taskHrefForContentType } from "@/lib/assignments";
import { resolveDashboardTier } from "@/lib/dashboardResolver";
import { getOrRefreshAcademicIntelligenceSnapshot } from "@/lib/academic-intelligence/snapshot";
import { buildAssignedWorkSummary, buildSmartCoachSummary } from "@/lib/student-dashboard-summary";
import { ensureLearningAccess } from "@/lib/subscriptions/learning-access";

function parseProfileJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // Ignore malformed JSON and return a safe empty profile.
  }
  return {};
}

function issuedCertificateCount(profileJson: string | null | undefined): number {
  const parsed = parseProfileJson(profileJson);
  const certificates = parsed.certificates;
  if (!certificates || typeof certificates !== "object" || Array.isArray(certificates)) return 0;
  const issued = (certificates as Record<string, unknown>).issued;
  return Array.isArray(issued) ? issued.length : 0;
}

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

  const [assignments, skills, snapshotResult] = await Promise.all([
    prisma.assignment.findMany({
      where: {
        studentId,
        content: {
          NOT: {
            createdBy: "auto_lesson_engine",
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        status: true,
        contentId: true,
        updatedAt: true,
        content: {
          select: {
            contentType: true,
            topic: true,
            skillFocus: true,
            level: true,
          },
        },
      },
    }),
    prisma.studentSkill.findMany({
      where: { studentId },
      orderBy: { accuracy: "asc" },
      take: 8,
      select: {
        skill: true,
        status: true,
        accuracy: true,
      },
    }),
    getOrRefreshAcademicIntelligenceSnapshot({
      studentId,
      forceRefresh: manualRefresh,
      reason: manualRefresh ? "manual_refresh" : undefined,
    }),
  ]);

  const mappedAssignments = assignments.map((assignment) => ({
    id: assignment.id,
    status: assignment.status,
    subject: assignment.content.contentType,
    contentId: assignment.contentId,
    title: assignment.content.topic || assignment.content.skillFocus || assignment.content.contentType,
    skillFocus: assignment.content.skillFocus,
    difficulty: assignment.content.level,
    href: taskHrefForContentType(assignment.content.contentType, assignment.id),
    updatedAt: assignment.updatedAt.toISOString(),
  }));
  const snapshot = snapshotResult.snapshot;
  const assignedWork = buildAssignedWorkSummary(mappedAssignments);
  const smartCoach = buildSmartCoachSummary({
    skills,
    bestExplanationStyle: snapshot?.learningTwinSummary.bestExplanationStyle,
    hasLearningTwinData: snapshot?.learningTwinSummary.hasEnoughData,
  });

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
    assignments: mappedAssignments,
    skills,
    today: {
      nextActivity: assignedWork.nextActivity,
    },
    assignedWorkSummary: {
      total: assignedWork.total,
      active: assignedWork.active,
      completed: assignedWork.completed,
      nextTitle: assignedWork.nextTitle,
    },
    catchUpSummary: snapshot?.smartCatchUpSummary ?? { total: 0, active: 0, completed: 0, overdue: 0, highPriority: 0, topPriorityTopics: [] },
    masterMapSummary: snapshot?.masterMapSummary ?? { totalTopics: 0, needsCatchUpCount: 0, needsRevisionCount: 0, coveredCount: 0, averageScore: 0 },
    certificateProgressSummary: {
      issuedCount: issuedCertificateCount(child.studentProfile?.aiLearningProfileJson ?? null),
      friendlyLabel: issuedCertificateCount(child.studentProfile?.aiLearningProfileJson ?? null) > 0 ? "Certificates issued" : "Keep learning",
    },
    smartCoachSummary: {
      ...smartCoach,
      learningTwin: snapshot?.learningTwinSummary ?? null,
    },
    examReadinessSummary: snapshot?.examReadinessSummary ?? null,
    progressionRecommendationSummary: snapshot?.progressionRecommendationSummary ?? null,
    snapshot: {
      available: Boolean(snapshot),
      refreshed: snapshotResult.refreshed,
      lastCalculatedAt: snapshot?.lastCalculatedAt ?? null,
      refreshReason: snapshot?.refreshReason ?? null,
    },
  });
}
