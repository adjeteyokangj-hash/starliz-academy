import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { parseQuickLevelFinderSession } from "@/lib/quick-level-finder";
import { parseSelectedSubjectsFromProfileJson, parseSubjectFocus } from "@/lib/student-learning-state";
import { selectPlacementLessons } from "@/lib/placement-lesson-selector";
import { taskHrefForContentType } from "@/lib/assignments";
import { buildSubjectLevelProgression, progressionFriendlyLabel } from "@/lib/subject-level-progression";

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

  const student = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId, archived: false },
    select: {
      id: true,
      name: true,
      yearGroup: true,
      studentProfile: {
        select: {
          keyStageLevel: true,
          subjectFocus: true,
          aiLearningProfileJson: true,
        },
      },
    },
  });

  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const profileJson = student.studentProfile?.aiLearningProfileJson ?? null;
  const selectedSubjects = parseSelectedSubjectsFromProfileJson(profileJson).length
    ? parseSelectedSubjectsFromProfileJson(profileJson)
    : parseSubjectFocus(student.studentProfile?.subjectFocus ?? null);

  if (!selectedSubjects.length) {
    return NextResponse.json({
      ok: false,
      code: "onboarding_required",
      message: "Choose subjects first to unlock progression recommendations.",
      recommendations: [],
      grouped: [],
      contentGaps: [],
    }, { status: 409 });
  }

  const quick = parseQuickLevelFinderSession(profileJson);
  if (!quick || quick.status !== "completed") {
    return NextResponse.json({
      ok: false,
      code: "placement_required",
      message: "Complete Quick Level Finder to unlock progression recommendations.",
      recommendations: [],
      grouped: [],
      contentGaps: [],
    }, { status: 409 });
  }

  const [attempts, assignments, weakAreas, studentSkills, progressRecords, contentRows] = await Promise.all([
    prisma.attempt.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: "desc" },
      take: 800,
      select: {
        subject: true,
        skillFocus: true,
        correct: true,
      },
    }),
    prisma.assignment.findMany({
      where: {
        studentId: student.id,
        student: { parentId: parentScope.parentId },
      },
      orderBy: { updatedAt: "desc" },
      take: 400,
      select: {
        status: true,
        contentId: true,
        content: {
          select: {
            contentType: true,
            topic: true,
            skillFocus: true,
            metadataJson: true,
          },
        },
      },
    }),
    prisma.weakArea.findMany({
      where: { studentId: student.id },
      orderBy: { updatedAt: "desc" },
      take: 300,
      select: {
        subject: true,
        skillFocus: true,
        status: true,
      },
    }),
    prisma.studentSkill.findMany({
      where: { studentId: student.id },
      orderBy: { updatedAt: "desc" },
      take: 250,
      select: {
        skill: true,
        status: true,
        accuracy: true,
        attempts: true,
      },
    }),
    prisma.progressRecord.findMany({
      where: { childId: student.id },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        activityType: true,
        activityName: true,
        score: true,
        accuracy: true,
        completed: true,
      },
    }),
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
  ]);

  const placementLessons = selectPlacementLessons({
    studentId: student.id,
    selectedSubjects,
    placementLevels: quick.levels,
    availableContent: contentRows,
    existingAssignments: assignments.map((assignment) => ({
      id: assignment.contentId,
      contentId: assignment.contentId,
      status: assignment.status,
      href: taskHrefForContentType(assignment.content.contentType, undefined),
    })),
    yearGroup: student.yearGroup,
    keyStage: student.studentProfile?.keyStageLevel ?? null,
  });

  const progression = buildSubjectLevelProgression({
    studentId: student.id,
    yearGroup: student.yearGroup,
    keyStage: student.studentProfile?.keyStageLevel ?? null,
    selectedSubjects,
    placementLevels: quick.levels,
    attempts,
    assignments: assignments.map((row) => ({
      status: row.status,
      contentType: row.content.contentType,
      topic: row.content.topic,
      skillFocus: row.content.skillFocus,
      metadataJson: row.content.metadataJson,
    })),
    weakAreas,
    studentSkills,
    progressRecords,
    placementRecommendations: placementLessons.recommendations,
  });

  const totalEvidencePoints = attempts.length + assignments.length + progressRecords.filter((row) => row.completed).length + studentSkills.filter((row) => row.attempts > 0).length;

  return NextResponse.json({
    ok: true,
    student: {
      id: student.id,
      name: student.name,
      yearGroup: student.yearGroup,
      keyStage: student.studentProfile?.keyStageLevel ?? null,
    },
    message: progression.hasEvidence && totalEvidencePoints > 0
      ? "Progression recommendations generated."
      : "Not enough learning evidence yet.",
    recommendations: progression.recommendations,
    grouped: progression.grouped,
    contentGaps: progression.contentGaps,
    summary: {
      total: progression.recommendations.length,
      needsSupport: progression.recommendations.filter((row) => row.status === "needs_support").length,
      readyToAdvance: progression.recommendations.filter((row) => row.status === "ready_to_advance").length,
      reviewNeeded: progression.recommendations.filter((row) => row.status === "review_needed").length,
      friendlyHeadline: progression.recommendations[0] ? progressionFriendlyLabel(progression.recommendations[0].status) : "Keep practising",
    },
  });
}
