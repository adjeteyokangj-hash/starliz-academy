import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { parseQuickLevelFinderSession } from "@/lib/quick-level-finder";
import { parseSelectedSubjectsFromProfileJson } from "@/lib/student-learning-state";
import { selectPlacementLessons } from "@/lib/placement-lesson-selector";
import { taskHrefForContentType } from "@/lib/assignments";

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
          aiLearningProfileJson: true,
        },
      },
    },
  });

  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const profileJson = student.studentProfile?.aiLearningProfileJson ?? null;
  const quick = parseQuickLevelFinderSession(profileJson);
  if (!quick || quick.status !== "completed") {
    return NextResponse.json({
      ok: true,
      student: { id: student.id, name: student.name },
      recommendations: [],
      grouped: [],
      contentGaps: [],
      placementCompleted: false,
    });
  }

  const selectedSubjects = parseSelectedSubjectsFromProfileJson(profileJson);

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

  const result = selectPlacementLessons({
    studentId: student.id,
    selectedSubjects,
    placementLevels: quick.levels,
    availableContent: contentRows,
    existingAssignments: assignments.map((assignment) => ({
      id: assignment.id,
      contentId: assignment.contentId,
      status: assignment.status,
      href: taskHrefForContentType(assignment.content.contentType, assignment.id),
    })),
    yearGroup: student.yearGroup,
    keyStage: student.studentProfile?.keyStageLevel ?? null,
  });

  return NextResponse.json({
    ok: true,
    student: {
      id: student.id,
      name: student.name,
      yearGroup: student.yearGroup,
      keyStage: student.studentProfile?.keyStageLevel ?? null,
    },
    placementCompleted: true,
    recommendations: result.recommendations,
    grouped: result.grouped,
    contentGaps: result.contentGaps,
  });
}
