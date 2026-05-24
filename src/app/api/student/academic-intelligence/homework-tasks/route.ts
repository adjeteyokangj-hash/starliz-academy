import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { applyHomeworkTaskAction, listHomeworkTasks } from "@/lib/academic-intelligence/homeworkTasks";
import type { HomeworkTaskAction } from "@/lib/academic-intelligence/types";

function parseStudentAction(value: unknown): HomeworkTaskAction | null {
  if (value === "start_homework" || value === "complete_homework") return value;
  return null;
}

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const studentId = params.get("studentId") ?? await resolveParentActiveChildId(parentScope.parentId);
  if (!studentId) return NextResponse.json({ tasks: [] });

  const ownedChild = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId },
    select: { id: true },
  });
  if (!ownedChild) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  const tasks = await listHomeworkTasks(studentId);
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null) as {
    studentId?: string;
    taskId?: string;
    action?: HomeworkTaskAction;
  } | null;

  const studentId = body?.studentId ?? await resolveParentActiveChildId(parentScope.parentId);
  if (!studentId) return NextResponse.json({ error: "studentId is required." }, { status: 400 });

  const ownedChild = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId },
    select: { id: true },
  });
  if (!ownedChild) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  const taskId = body?.taskId?.trim();
  const action = parseStudentAction(body?.action);
  if (!taskId || !action) {
    return NextResponse.json({ error: "taskId and valid student action are required." }, { status: 400 });
  }

  const updated = await applyHomeworkTaskAction({
    studentId,
    taskId,
    action,
    actorUserId: session.userId,
  });

  if (!updated) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  return NextResponse.json({ ok: true, task: updated });
}
