import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { buildDailyJourney } from "@/lib/dailyJourney";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import {
  deriveStudentLearningState,
  parseQuickLevelFinderSummary,
  parseSelectedSubjectsFromProfileJson,
  parseSubjectFocus,
} from "@/lib/student-learning-state";

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
    select: { id: true, name: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const [profile, assignmentCount, skillRows, progressCount, weakAreaCount] = await Promise.all([
    prisma.studentProfile.findUnique({
      where: { childId: student.id },
      select: { subjectFocus: true, aiLearningProfileJson: true },
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

  try {
    const journey = await buildDailyJourney(student.id);

    return NextResponse.json({
      ok: true,
      student,
      journey,
      lesson: null,
      structure: [
        "1 warm-up",
        "2 core practice tasks",
        "1 weak-area repair",
        "1 mixed reinforcement",
        "1 boss gate",
      ],
    });
  } catch (err) {
    console.error("[daily-journey]", err);
    return NextResponse.json({ error: "Unable to build daily journey." }, { status: 500 });
  }
}
