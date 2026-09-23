import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveActiveChildForSession, resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { resolveDashboardTier } from "@/lib/dashboardResolver";
import { ensureLearningAccess } from "@/lib/subscriptions/learning-access";
import { getStudentDashboardShell } from "@/lib/student-learning-brain/dashboard-shell";
import {
  createChildSelectionToken,
  getChildSelectionCookieName,
  getChildSelectionMaxAgeSeconds,
} from "@/lib/auth";
import { activeDaySchoolEnrolmentWhere } from "@/lib/schools/day-school-access";
import { resolveStudentYearContext } from "@/lib/schools/student-year-context";
import { DEFAULT_MASTERED_REVIEW_POLICY, parseStudentDashboardSettings } from "@/lib/student-dashboard-sections";
import { syncChildAcademicFieldsFromDob } from "@/lib/uk-student-year";

export async function GET(request: Request) {
  try {
    return await handleDashboardSummaryGet(request);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2024") {
      return NextResponse.json(
        { error: "The dashboard is busy. Please try again.", code: "db_busy" },
        { status: 503 },
      );
    }
    throw error;
  }
}

async function handleDashboardSummaryGet(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const params = new URL(request.url).searchParams;
  const requestedStudentId = params.get("studentId")?.trim() || null;
  const isAdminPreview = session.role === "admin" && Boolean(requestedStudentId);

  let parentIdForAccess: string | null = null;
  let studentId: string | null = requestedStudentId;

  if (isAdminPreview) {
    // Admin preview keeps explicit studentId.
  } else if (session.role === "student") {
    const resolved = await resolveActiveChildForSession(session);
    if (!resolved.ok) {
      return NextResponse.json(
        {
          error: "No learner profile is linked to this student account.",
          code: "no_linked_profile",
        },
        { status: 403 },
      );
    }
    studentId = resolved.childId;
    parentIdForAccess = resolved.parentId;
  } else {
    const parentScope = await resolveParentScope(session);
    if (!parentScope) {
      return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
    }
    parentIdForAccess = parentScope.parentId;
    studentId = requestedStudentId ?? (await resolveParentActiveChildId(parentScope.parentId));
  }

  if (parentIdForAccess) {
    const access = await ensureLearningAccess(parentIdForAccess);
    if (access.response) return access.response;
  }

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
      nextShortLearning: null,
      dashboardSections: parseStudentDashboardSettings(null).sections,
      masteredReview: DEFAULT_MASTERED_REVIEW_POLICY,
    });
  }

  let child = await prisma.childProfile.findFirst({
    where: isAdminPreview
      ? { id: studentId, archived: false }
      : session.role === "student"
        ? { id: studentId, userId: session.userId, archived: false }
        : { id: studentId, parentId: parentIdForAccess!, archived: false },
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
          dashboardSectionsJson: true,
        },
      },
    },
  });

  if (!child) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  try {
    await syncChildAcademicFieldsFromDob(child.id);
    const refreshed = await prisma.childProfile.findUnique({
      where: { id: child.id },
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
            dashboardSectionsJson: true,
          },
        },
      },
    });
    if (refreshed) child = refreshed;
  } catch {
    // Keep original row if sync fails.
  }

  const [dashboardShell, schoolEnrolment] = await Promise.all([
    getStudentDashboardShell(studentId),
    prisma.schoolStudent.findFirst({
      where: activeDaySchoolEnrolmentWhere(studentId),
      select: {
        id: true,
        schoolId: true,
        classroomId: true,
        classroom: { select: { name: true, yearGroup: true, academicYear: true } },
        school: { select: { name: true } },
      },
      orderBy: { joinedAt: "desc" },
    }),
  ]);

  const yearContext = resolveStudentYearContext({
    officialYearGroup: child.yearGroup,
    classroomYearGroup: schoolEnrolment?.classroom?.yearGroup ?? null,
    classroomName: schoolEnrolment?.classroom?.name ?? null,
    classroomAcademicYear: schoolEnrolment?.classroom?.academicYear ?? null,
    surface: "dashboard",
  });

  const dashboardSettings = parseStudentDashboardSettings(child.studentProfile?.dashboardSectionsJson);

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
    yearContext: {
      officialYearGroup: yearContext.officialYearGroup,
      administrativeYearGroup: yearContext.administrativeYearGroup,
      classroomYearGroup: yearContext.classroomYearGroup,
      classroomName: yearContext.classroomName,
      incomingYearGroup: yearContext.incomingYearGroup,
      targetYearGroup: yearContext.targetYearGroup,
      learningYearGroup: yearContext.learningYearGroup,
      targetLearningYearGroup: yearContext.targetLearningYearGroup,
      academicYearLabel: yearContext.academicYearLabel,
      isSummerTransition: yearContext.isSummerTransition,
      yearDisplayLabel: yearContext.yearDisplayLabel,
      summerPreparationLabel: yearContext.summerPreparationLabel,
      summerSupportingCopy: yearContext.isSummerTransition && yearContext.incomingYearGroup && yearContext.officialYearGroup
        ? `Your summer learning will review important ${yearContext.officialYearGroup} knowledge and introduce ${yearContext.incomingYearGroup} topics.`
        : null,
    },
    schoolEnrolment: schoolEnrolment?.classroomId
      ? {
          schoolStudentId: schoolEnrolment.id,
          schoolId: schoolEnrolment.schoolId,
          schoolName: schoolEnrolment.school.name,
          classroomId: schoolEnrolment.classroomId,
          classroomName: schoolEnrolment.classroom?.name ?? null,
          yearGroup: schoolEnrolment.classroom?.yearGroup ?? null,
          yearDisplayLabel: yearContext.yearDisplayLabel,
          officialYearGroup: yearContext.officialYearGroup,
          incomingYearGroup: yearContext.incomingYearGroup,
          isSummerTransition: yearContext.isSummerTransition,
          summerPreparationLabel: yearContext.summerPreparationLabel,
        }
      : null,
    currentLevelSummary: {
      level: child.level,
      xp: child.xp,
      yearGroup: child.yearGroup,
      keyStage: child.studentProfile?.keyStageLevel ?? null,
    },
    assignments: dashboardShell.assignments,
    activeLanguageModules: dashboardShell.activeLanguageModules,
    assignedLanguageLessons: dashboardShell.assignedLanguageLessons,
    skills: dashboardShell.skills,
    today: {
      nextActivity: dashboardShell.assignedWork.nextActivity,
    },
    assignedWorkSummary: {
      total: dashboardShell.assignedWork.total,
      active: dashboardShell.assignedWork.active,
      completed: dashboardShell.assignedWork.completed,
      nextTitle: dashboardShell.assignedWork.nextTitle,
    },
    catchUpSummary: { total: 0, active: 0, completed: 0, overdue: 0, highPriority: 0 },
    masterMapSummary: { totalTopics: 0, needsCatchUpCount: 0, needsRevisionCount: 0, coveredCount: 0, averageScore: 0 },
    certificateProgressSummary: { issuedCount: 0, friendlyLabel: "Keep learning" },
    smartCoachSummary: dashboardShell.smartCoach,
    snapshot: { available: false, refreshed: false, lastCalculatedAt: null },
    nextShortLearning: dashboardShell.nextShortLearning,
    dashboardSections: dashboardSettings.sections,
    // Automatic platform policy — not configured per student in admin.
    masteredReview: DEFAULT_MASTERED_REVIEW_POLICY,
  });

  // Sliding renewal: keep the learner on the student dashboard while actively learning
  // instead of bouncing to /parent/profiles after the 12h child-selection cookie expires.
  // Student-owned sessions never use the selection cookie for identity.
  if (session.role === "parent" && parentIdForAccess) {
    const selectionToken = await createChildSelectionToken(parentIdForAccess, studentId);
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
