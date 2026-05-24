import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import {
  deriveStudentLearningState,
  logLearningIntegrityWarnings,
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
  const studentId = params.get("studentId") ?? await resolveParentActiveChildId(parentScope.parentId);
  if (!studentId) {
    return NextResponse.json({ error: "No active student selected." }, { status: 400 });
  }

  const ownedChild = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId, archived: false },
    select: { id: true },
  });
  if (!ownedChild) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const [
    profile,
    assignmentCount,
    skillRows,
    progressCount,
    weakAreaCount,
  ] = await Promise.all([
    prisma.studentProfile.findUnique({
      where: { childId: studentId },
      select: { subjectFocus: true, aiLearningProfileJson: true },
    }),
    prisma.assignment.count({
      where: { studentId },
    }),
    prisma.studentSkill.findMany({
      where: { studentId },
      select: { attempts: true, skill: true, status: true },
    }),
    prisma.progressRecord.count({
      where: {
        childId: studentId,
        completed: true,
      },
    }),
    prisma.weakArea.count({
      where: {
        studentId,
        status: "active",
      },
    }),
  ]);

  const selectedSubjects = parseSelectedSubjectsFromProfileJson(profile?.aiLearningProfileJson ?? null).length
    ? parseSelectedSubjectsFromProfileJson(profile?.aiLearningProfileJson ?? null)
    : parseSubjectFocus(profile?.subjectFocus ?? null);
  const skillAttempts = skillRows.reduce((sum, row) => sum + (row.attempts ?? 0), 0);
  const masteredSkills = skillRows.filter((row) => row.status === "mastered").length;
  const spellingAttempts = skillRows
    .filter((row) => row.skill.toLowerCase().includes("spell"))
    .reduce((sum, row) => sum + (row.attempts ?? 0), 0);
  const readingAttempts = skillRows
    .filter((row) => row.skill.toLowerCase().includes("read"))
    .reduce((sum, row) => sum + (row.attempts ?? 0), 0);
  const speechSamples = 0;
  const quickLevelFinderSummary = parseQuickLevelFinderSummary(profile?.aiLearningProfileJson ?? null);

  const learningState = deriveStudentLearningState({
    assignmentCount,
    selectedSubjects,
    skillAttempts,
    progressEvents: progressCount,
    weakAreaCount,
    masteredSkills,
    spellingAttempts,
    readingAttempts,
    speechSamples,
    placementResponses: quickLevelFinderSummary.responseCount,
    placementCompleted: quickLevelFinderSummary.completed,
  });

  logLearningIntegrityWarnings(studentId, learningState.integrityWarnings);

  return NextResponse.json({
    ok: true,
    studentId,
    learningState,
  });
}
