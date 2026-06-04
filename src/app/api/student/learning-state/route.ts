import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import {
  logLearningIntegrityWarnings,
  parseQuickLevelFinderSummary,
  parseSelectedSubjectsFromProfileJson,
  parseSubjectFocus,
} from "@/lib/student-learning-state";
import { parseQuickLevelFinderRetestEnabled } from "@/lib/quick-level-finder";
import { getStudentLearningBrain, toBrainBackedStudentLearningState } from "@/lib/student-learning-brain";

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

  const [profile, brain] = await Promise.all([
    prisma.studentProfile.findUnique({
      where: { childId: studentId },
      select: { subjectFocus: true, aiLearningProfileJson: true },
    }),
    getStudentLearningBrain(studentId),
  ]);
  if (!brain) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const selectedSubjects = parseSelectedSubjectsFromProfileJson(profile?.aiLearningProfileJson ?? null).length
    ? parseSelectedSubjectsFromProfileJson(profile?.aiLearningProfileJson ?? null)
    : parseSubjectFocus(profile?.subjectFocus ?? null);
  const quickLevelFinderSummary = parseQuickLevelFinderSummary(profile?.aiLearningProfileJson ?? null);
  const learningState = toBrainBackedStudentLearningState(brain, {
    selectedSubjects,
    placementResponses: quickLevelFinderSummary.responseCount,
    speechSamples: 0,
  });

  logLearningIntegrityWarnings(studentId, learningState.integrityWarnings);

  return NextResponse.json({
    ok: true,
    studentId,
    learningState,
    quickLevelFinderRetestEnabled: parseQuickLevelFinderRetestEnabled(profile?.aiLearningProfileJson ?? null),
  });
}
