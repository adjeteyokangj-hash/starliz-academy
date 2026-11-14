import { worldPracticeSummaries } from "@/lib/coding/world/oversight";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api_guard";
import { canDo } from "@/lib/schools/permissions";
import { getSchoolTeacherContext } from "@/lib/schools/rbac";
import { getAccessibleStudents } from "@/lib/schools/scoping";
import {
  assignCodingLesson,
  hintTotalForRow,
  programFromRow,
  saveTeacherCodingFeedback,
  teacherCodingRows,
} from "@/lib/coding/workspace-store";
import { evidenceLabels, freshEvidence } from "@/lib/coding/assessment";
import { UNDERSTANDING_LOOPS } from "@/lib/coding/catalog";
import { codingAssistanceEnabled } from "@/lib/coding/settings";
import { teacherActivityIndex, teacherActivityDetail } from "@/lib/coding/teacher-activities";
import { loadActivityWorkspace } from "@/lib/coding/learning/workspace-store";
import { readActivityBody } from "@/lib/coding/learning/request";
import { LearningError } from "@/lib/coding/learning/state-machine";
import { evaluateStudentAssignmentAccess } from "@/lib/schools/licensing";
import { codingPlanIncludesLab } from "@/lib/coding/learning/entitlements";
import { releasedActivities } from "@/lib/coding/learning/catalogue";

function readEvidence(raw: string) {
  try {
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return {
      prediction: parsed.prediction === true,
      practical: parsed.practical === true,
      debugging: parsed.debugging === true,
      explanation: parsed.explanation === true,
      independent: parsed.independent === true,
    };
  } catch {
    return freshEvidence();
  }
}

async function teacherContext() {
  const { session, response } = await requireSession();
  if (!session) return { ctx: null, response, students: [] as Awaited<ReturnType<typeof getAccessibleStudents>> };
  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx || !canDo(ctx.role, "viewProgress")) {
    return {
      ctx: null,
      response: NextResponse.json({ error: "Coding progress is not available for this account." }, { status: 403 }),
      students: [],
    };
  }
  const students = await getAccessibleStudents(ctx.schoolId, ctx.schoolTeacherId, ctx.role);
  return { ctx, response: null as unknown as NextResponse, students };
}

export async function GET(request: Request) {
  const { ctx, response, students } = await teacherContext();
  if (!ctx) return response;
  const workspaceId = new URL(request.url).searchParams.get("activityWorkspaceId");
  if (workspaceId) {
    if (workspaceId.length > 100) return NextResponse.json({ error: "Invalid workspace identifier." }, { status: 400 });
    const activityWorkspace = await teacherActivityDetail(workspaceId, students.map((student) => student.child.id));
    return activityWorkspace ? NextResponse.json({ activityWorkspace }, { headers: { "Cache-Control": "private, no-store" } }) : NextResponse.json({ error: "That Coding activity is not available in your classes." }, { status: 404 });
  }
  const rows = await teacherCodingRows(students.map((student) => student.child.id));
  return NextResponse.json({
    worldPractice: await worldPracticeSummaries(students.map(student => student.child.id)),
    humanAssistanceEnabled: await codingAssistanceEnabled(),
    activities: releasedActivities().map((activity) => ({ id: activity.id, title: activity.title, year: activity.year, kind: activity.kind, objective: activity.objective })),
    activityWorkspaces: await teacherActivityIndex(students.map((student) => student.child.id)),
    activityWorkspaceLimit: 100,
    lesson: {
      id: UNDERSTANDING_LOOPS.id,
      title: UNDERSTANDING_LOOPS.title,
      pathwayTitle: UNDERSTANDING_LOOPS.pathwayTitle,
      objective: UNDERSTANDING_LOOPS.learningObjective,
    },
    students: students.map((student) => ({
      id: student.child.id,
      name: student.child.name,
      yearGroup: student.child.yearGroup,
    })),
    workspaces: rows.map((row) => ({
      id: row.id,
      childId: row.childId,
      learnerName: row.child.name,
      yearGroup: row.child.yearGroup,
      stage: row.stage,
      skillStatus: row.skillStatus,
      assignmentStatus: row.assignmentStatus,
      attemptCount: row.attemptCount,
      checksPassed: row.checksPassed,
      hintCount: hintTotalForRow(row.hintCountsJson),
      feedback: row.lastFeedback,
      teacherFeedback: row.teacherFeedback,
      privateProject: row.privateProject,
      evidence: evidenceLabels(readEvidence(row.evidenceJson)),
      program: programFromRow(row.programsJson, row.stage),
      supportHandoff: row.supportHandoffJson,
    })),
  });
}

const assignSchema = z.object({
  action: z.literal("assign"),
  childId: z.string().trim().min(1),
  activityId: z.string().trim().min(1).max(100).optional(),
}).strict();

const feedbackSchema = z.object({
  action: z.literal("feedback"),
  workspaceId: z.string().trim().min(1),
  feedback: z.string().trim().min(1).max(2000),
}).strict();

export async function POST(request: Request) {
  const { ctx, response, students } = await teacherContext();
  if (!ctx) return response;
  let body: unknown;
  try { body = await readActivityBody(request); }
  catch (error) { return NextResponse.json({ error: error instanceof LearningError ? error.message : "Invalid Coding request." }, { status: error instanceof LearningError ? error.status : 400 }); }
  const childIds = students.map((student) => student.child.id);
  const assign = assignSchema.safeParse(body);
  if (assign.success) {
    if (!canDo(ctx.role, "issueAssignment")) {
      return NextResponse.json({ error: "You cannot assign coding lessons." }, { status: 403 });
    }
    if (!childIds.includes(assign.data.childId)) {
      return NextResponse.json({ error: "That learner is not in your classes." }, { status: 403 });
    }
    const student = students.find((item) => item.child.id === assign.data.childId);
    if (assign.data.activityId) {
      const access = await evaluateStudentAssignmentAccess(assign.data.childId, ctx.schoolId);
      if (!access.allowed || access.schoolId !== ctx.schoolId || !await codingPlanIncludesLab({ schoolId: ctx.schoolId })) return NextResponse.json({ error: "An active school licence covering Coding is required for this assignment." }, { status: 403 });
      try {
        await loadActivityWorkspace(assign.data.childId, assign.data.activityId, student?.child.yearGroup ?? null);
        const { activityDefinition } = await import("@/lib/coding/learning/catalogue");
        const activity = activityDefinition(assign.data.activityId)!;
        const { prisma } = await import("@/lib/db");
        await prisma.codingWorkspace.updateMany({ where: { childId: assign.data.childId, lessonId: `curriculum:${activity.version}:${activity.id}`, assignmentStatus: "available" }, data: { assignmentStatus: "assigned" } });
        return NextResponse.json({ ok: true });
      } catch (error) {
        if (error instanceof LearningError) return NextResponse.json({ error: error.message }, { status: error.status });
        throw error;
      }
    }
    await assignCodingLesson({
      childId: assign.data.childId,
      yearGroup: student?.child.yearGroup ?? null,
    });
    return NextResponse.json({ ok: true });
  }
  const feedback = feedbackSchema.safeParse(body);
  if (feedback.success) {
    if (!await codingAssistanceEnabled()) return NextResponse.json({ error: "Human assistance is disabled for Coding." }, { status: 403 });
    const result = await saveTeacherCodingFeedback({
      actorUserId: ctx.userId,
      schoolTeacherId: ctx.schoolTeacherId,
      schoolId: ctx.schoolId,
      workspaceId: feedback.data.workspaceId,
      childIds,
      feedback: feedback.data.feedback,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  return NextResponse.json({ error: "Choose assign or feedback." }, { status: 400 });
}
