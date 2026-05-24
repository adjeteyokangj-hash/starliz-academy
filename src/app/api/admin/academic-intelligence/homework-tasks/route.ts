import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { applyHomeworkTaskAction, listHomeworkTasks } from "@/lib/academic-intelligence/homeworkTasks";
import type { HomeworkTaskAction } from "@/lib/academic-intelligence/types";

function parseAdminAction(value: unknown): HomeworkTaskAction | null {
  if (
    value === "start_homework"
    || value === "complete_homework"
    || value === "waive_homework"
    || value === "reschedule_homework"
    || value === "add_note"
  ) return value;
  return null;
}

export async function GET(request: Request) {
  const { session, response } = await requireAdminPermission("reports:view");
  if (!session) return response;

  const params = new URL(request.url).searchParams;
  const studentId = params.get("studentId")?.trim();
  if (!studentId) return NextResponse.json({ error: "studentId is required." }, { status: 400 });

  const tasks = await listHomeworkTasks(studentId);
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("reports:view");
  if (!session) return response;

  const body = await request.json().catch(() => null) as {
    studentId?: string;
    taskId?: string;
    action?: HomeworkTaskAction;
    dueDate?: string | null;
    note?: string | null;
  } | null;

  const studentId = body?.studentId?.trim();
  const taskId = body?.taskId?.trim();
  const action = parseAdminAction(body?.action);
  if (!studentId || !taskId || !action) {
    return NextResponse.json({ error: "studentId, taskId and valid action are required." }, { status: 400 });
  }

  const updated = await applyHomeworkTaskAction({
    studentId,
    taskId,
    action,
    actorUserId: session.userId,
    dueDate: typeof body?.dueDate === "string" ? body.dueDate : null,
    note: typeof body?.note === "string" ? body.note : null,
  });

  if (!updated) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  return NextResponse.json({ ok: true, task: updated });
}
