import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { buildAcademicSourceForStudent } from "@/lib/academic-intelligence/data";
import { buildAcademicIntelligence, toStudentSafeAcademicIntelligence } from "@/lib/academic-intelligence/academicIntelligence";
import { listCatchUpTasks, syncCatchUpTasks } from "@/lib/academic-intelligence/catchUpTasks";
import { listHomeworkTasks, syncHomeworkTasks } from "@/lib/academic-intelligence/homeworkTasks";
import { buildAcademicIntelligenceSnapshot, upsertAcademicIntelligenceSnapshotJson } from "@/lib/academic-intelligence/snapshot";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const includeSync = params.get("includeSync") === "1";
  const studentId = params.get("studentId") ?? await resolveParentActiveChildId(parentScope.parentId);
  if (!studentId) {
    return NextResponse.json({
      studentId: "",
      summary: {
        totalTopics: 0,
        byStatus: {
          not_started: 0,
          started: 0,
          practising: 0,
          needs_catch_up: 0,
          nearly_secure: 0,
          mastered: 0,
          needs_revision: 0,
        },
        needsCatchUpCount: 0,
        needsRevisionCount: 0,
        coveredCount: 0,
        averageScore: 0,
      },
      catchUpRecommendations: [],
      assessmentRecommendations: [],
      nextRecommendedActions: ["Complete a lesson to build your learning map."],
      generatedAt: new Date().toISOString(),
    });
  }

  const ownedChild = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId },
    select: { id: true },
  });
  if (!ownedChild) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const source = await buildAcademicSourceForStudent(studentId);
  if (!source) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  const existingTasks = await listCatchUpTasks(studentId);
  const existingHomework = await listHomeworkTasks(studentId);
  let output = buildAcademicIntelligence(source, { existingCatchUpTasks: existingTasks, existingHomeworkTasks: existingHomework });

  if (includeSync) {
    const syncedTasks = await syncCatchUpTasks({
      studentId,
      recommendations: output.catchUpRecommendations,
      schoolWeekModePlan: output.schoolWeekModePlan,
      actorUserId: session.userId,
    });
    const syncedHomework = await syncHomeworkTasks({
      studentId,
      schoolWeekModePlan: output.schoolWeekModePlan,
      actorUserId: session.userId,
    });
    output = buildAcademicIntelligence(source, { existingCatchUpTasks: syncedTasks, existingHomeworkTasks: syncedHomework });
  }

  const profile = await prisma.studentProfile.findUnique({
    where: { childId: studentId },
    select: { aiLearningProfileJson: true },
  });
  const snapshot = buildAcademicIntelligenceSnapshot(output, includeSync ? "manual_refresh" : "stale_snapshot");
  await prisma.studentProfile.upsert({
    where: { childId: studentId },
    create: {
      childId: studentId,
      aiLearningProfileJson: upsertAcademicIntelligenceSnapshotJson(null, snapshot),
    },
    update: {
      aiLearningProfileJson: upsertAcademicIntelligenceSnapshotJson(profile?.aiLearningProfileJson ?? null, snapshot),
    },
  });

  return NextResponse.json(toStudentSafeAcademicIntelligence(output));
}
