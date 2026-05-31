import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { buildDailyJourney } from "@/lib/dailyJourney";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { parseQuickLevelFinderSession } from "@/lib/quick-level-finder";
import { selectPlacementLessons } from "@/lib/placement-lesson-selector";
import { taskHrefForContentType } from "@/lib/assignments";
import { getStudentHomeworkGateSnapshot } from "@/lib/homework-phase1b/service";
import {
  deriveStudentLearningState,
  parseQuickLevelFinderSummary,
  parseSelectedSubjectsFromProfileJson,
  parseSubjectFocus,
} from "@/lib/student-learning-state";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const quickMode = params.get("quick") === "1";

  const studentId = await resolveParentActiveChildId(parentScope.parentId);
  if (!studentId) {
    return NextResponse.json({ error: "No active student selected." }, { status: 400 });
  }

  const student = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId, archived: false },
    select: { id: true, name: true, yearGroup: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const [profile, assignmentCount, skillRows, progressCount, weakAreaCount] = await Promise.all([
    prisma.studentProfile.findUnique({
      where: { childId: student.id },
      select: { subjectFocus: true, aiLearningProfileJson: true, keyStageLevel: true },
    }),
    prisma.assignment.count({ where: { studentId: student.id } }),
    prisma.studentSkill.findMany({ where: { studentId: student.id }, select: { attempts: true, skill: true, status: true } }),
    prisma.progressRecord.count({ where: { childId: student.id, completed: true } }),
    prisma.weakArea.count({ where: { studentId: student.id, status: "active" } }),
  ]);

  const skillAttempts = skillRows.reduce((sum, row) => sum + (row.attempts ?? 0), 0);
  const quickLevelFinderSummary = parseQuickLevelFinderSummary(profile?.aiLearningProfileJson ?? null);
  const learningState = deriveStudentLearningState({
    assignmentCount,
    selectedSubjects: parseSelectedSubjectsFromProfileJson(profile?.aiLearningProfileJson ?? null).length
      ? parseSelectedSubjectsFromProfileJson(profile?.aiLearningProfileJson ?? null)
      : parseSubjectFocus(profile?.subjectFocus ?? null),
    skillAttempts,
    progressEvents: progressCount,
    weakAreaCount,
    masteredSkills: skillRows.filter((row) => row.status === "mastered").length,
    spellingAttempts: skillRows
      .filter((row) => row.skill.toLowerCase().includes("spell"))
      .reduce((sum, row) => sum + (row.attempts ?? 0), 0),
    readingAttempts: skillRows
      .filter((row) => row.skill.toLowerCase().includes("read"))
      .reduce((sum, row) => sum + (row.attempts ?? 0), 0),
    speechSamples: 0,
    placementResponses: quickLevelFinderSummary.responseCount,
    placementCompleted: quickLevelFinderSummary.completed,
  });

  if (learningState.isFirstTimeStudent || !learningState.hasCompletedPlacement) {
    return NextResponse.json(
      {
        error: "Onboarding required before starting daily journey.",
        code: "ONBOARDING_REQUIRED",
        next: "/student/onboarding",
        learningState,
      },
      { status: 409 },
    );
  }

  const homeworkGate = await getStudentHomeworkGateSnapshot(student.id, "new_learning_session");
  if (!homeworkGate.access.allowed) {
    return NextResponse.json(
      {
        error: homeworkGate.access.reason,
        code: homeworkGate.access.code,
        featureEnabled: homeworkGate.featureEnabled,
        homeworkGate: homeworkGate.access.gate,
        homework: homeworkGate.batch,
      },
      { status: homeworkGate.access.statusCode },
    );
  }

  try {
    const journey = await buildDailyJourney(student.id);

    if (quickMode) {
      const quickAssignment = await prisma.assignment.findFirst({
        where: {
          studentId: student.id,
          student: { parentId: parentScope.parentId },
          status: { in: ["assigned", "in_progress"] },
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          contentId: true,
          content: { select: { contentType: true } },
        },
      });

      return NextResponse.json({
        ok: true,
        student,
        journey,
        lesson: quickAssignment
          ? {
              assignmentId: quickAssignment.id,
              contentId: quickAssignment.contentId,
              href: taskHrefForContentType(quickAssignment.content.contentType, quickAssignment.id),
            }
          : null,
        placementLessons: null,
        structure: [
          "Placement-guided first lesson",
          "Core practice tasks",
          "Weak-area repair",
          "Mixed reinforcement",
          "Boss gate",
        ],
      });
    }

    const quick = parseQuickLevelFinderSession(profile?.aiLearningProfileJson ?? null);

    let placementLessons: ReturnType<typeof selectPlacementLessons> | null = null;
    if (quick && quick.status === "completed") {
      const [contentRows, assignments] = await Promise.all([
        prisma.aIContentCache.findMany({
          where: {
            status: { not: "rejected" },
            ...(student.yearGroup ? { yearGroup: student.yearGroup } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 300,
          select: {
            id: true,
            contentType: true,
            level: true,
            status: true,
            topic: true,
            skillFocus: true,
            yearGroup: true,
            keyStage: true,
            metadataJson: true,
          },
        }),
        prisma.assignment.findMany({
          where: {
            studentId: student.id,
            student: { parentId: parentScope.parentId },
          },
          select: {
            id: true,
            contentId: true,
            status: true,
            content: {
              select: {
                contentType: true,
              },
            },
          },
        }),
      ]);

      placementLessons = selectPlacementLessons({
        studentId: student.id,
        selectedSubjects: parseSelectedSubjectsFromProfileJson(profile?.aiLearningProfileJson ?? null),
        placementLevels: quick.levels,
        availableContent: contentRows,
        existingAssignments: assignments.map((assignment) => ({
          id: assignment.id,
          contentId: assignment.contentId,
          status: assignment.status,
          href: taskHrefForContentType(assignment.content.contentType, assignment.id),
        })),
        yearGroup: student.yearGroup,
        keyStage: profile?.keyStageLevel ?? null,
      });
    }

    const assignedPlacementLesson = placementLessons?.recommendations.find((row) => row.status === "assigned" && row.assignmentId);

    return NextResponse.json({
      ok: true,
      student,
      journey,
      lesson: assignedPlacementLesson?.assignmentId
        ? {
            assignmentId: assignedPlacementLesson.assignmentId,
            contentId: assignedPlacementLesson.contentId,
            href: assignedPlacementLesson.href,
          }
        : null,
      placementLessons,
      structure: [
        "Placement-guided first lesson",
        "Core practice tasks",
        "Weak-area repair",
        "Mixed reinforcement",
        "Boss gate",
      ],
    });
  } catch (err) {
    console.error("[daily-journey]", err);
    return NextResponse.json({ error: "Unable to build daily journey." }, { status: 500 });
  }
}
