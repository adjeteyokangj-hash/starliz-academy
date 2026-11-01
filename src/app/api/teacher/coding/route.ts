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

export async function GET() {
  const { ctx, response, students } = await teacherContext();
  if (!ctx) return response;
  const rows = await teacherCodingRows(students.map((student) => student.child.id));
  return NextResponse.json({
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
});

const feedbackSchema = z.object({
  action: z.literal("feedback"),
  workspaceId: z.string().trim().min(1),
  feedback: z.string().trim().min(1).max(2000),
});

export async function POST(request: Request) {
  const { ctx, response, students } = await teacherContext();
  if (!ctx) return response;
  const body = await request.json().catch(() => null);
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
    await assignCodingLesson({
      childId: assign.data.childId,
      yearGroup: student?.child.yearGroup ?? null,
    });
    return NextResponse.json({ ok: true });
  }
  const feedback = feedbackSchema.safeParse(body);
  if (feedback.success) {
    const result = await saveTeacherCodingFeedback({
      workspaceId: feedback.data.workspaceId,
      childIds,
      feedback: feedback.data.feedback,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  return NextResponse.json({ error: "Choose assign or feedback." }, { status: 400 });
}
