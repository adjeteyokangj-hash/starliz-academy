import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { applyHomeworkTaskAction, listHomeworkTasks } from "@/lib/academic-intelligence/homeworkTasks";
import type { HomeworkTaskAction } from "@/lib/academic-intelligence/types";

function parseParentAction(value: unknown): HomeworkTaskAction | null {
  if (value === "waive_homework" || value === "reschedule_homework" || value === "add_note") return value;
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
  const childId = params.get("childId")?.trim();
  if (!childId) return NextResponse.json({ error: "childId is required." }, { status: 400 });

  const ownedChild = await prisma.childProfile.findFirst({
    where: { id: childId, parentId: parentScope.parentId },
    select: { id: true },
  });
  if (!ownedChild) return NextResponse.json({ error: "Child not found." }, { status: 404 });

  const tasks = await listHomeworkTasks(childId);
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
    childId?: string;
    taskId?: string;
    action?: HomeworkTaskAction;
    dueDate?: string | null;
    note?: string | null;
  } | null;

  const childId = body?.childId?.trim();
  if (!childId) return NextResponse.json({ error: "childId is required." }, { status: 400 });

  const ownedChild = await prisma.childProfile.findFirst({
    where: { id: childId, parentId: parentScope.parentId },
    select: { id: true },
  });
  if (!ownedChild) return NextResponse.json({ error: "Child not found." }, { status: 404 });

  const taskId = body?.taskId?.trim();
  const action = parseParentAction(body?.action);
  if (!taskId || !action) {
    return NextResponse.json({ error: "taskId and valid parent action are required." }, { status: 400 });
  }

  const updated = await applyHomeworkTaskAction({
    studentId: childId,
    taskId,
    action,
    actorUserId: session.userId,
    dueDate: typeof body?.dueDate === "string" ? body.dueDate : null,
    note: typeof body?.note === "string" ? body.note : null,
  });

  if (!updated) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  return NextResponse.json({ ok: true, task: updated });
}
