import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { applyCatchUpTaskAction, listCatchUpTasks } from "@/lib/academic-intelligence/catchUpTasks";
import type { CatchUpTaskAction } from "@/lib/academic-intelligence/types";

function parseAdminAction(value: unknown): CatchUpTaskAction | null {
  if (
    value === "approve_catch_up"
    || value === "reschedule_catch_up"
    || value === "convert_to_homework"
    || value === "waive_catch_up"
    || value === "mark_reviewed"
    || value === "add_note"
    || value === "start_task"
    || value === "complete_task"
    || value === "skip_task"
  ) return value;
  return null;
}

function parseDay(value: unknown): "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | null {
  if (value === "Monday" || value === "Tuesday" || value === "Wednesday" || value === "Thursday" || value === "Friday") {
    return value;
  }
  return null;
}

export async function GET(request: Request) {
  const { session, response } = await requireAdminPermission("reports:view");
  if (!session) return response;

  const params = new URL(request.url).searchParams;
  const studentId = params.get("studentId")?.trim();
  if (!studentId) return NextResponse.json({ error: "studentId is required." }, { status: 400 });

  const tasks = await listCatchUpTasks(studentId);
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("reports:view");
  if (!session) return response;

  const body = await request.json().catch(() => null) as {
    studentId?: string;
    taskId?: string;
    action?: CatchUpTaskAction;
    dueDate?: string | null;
    scheduledDay?: string | null;
    note?: string | null;
  } | null;

  const studentId = body?.studentId?.trim();
  const taskId = body?.taskId?.trim();
  const action = parseAdminAction(body?.action);
  if (!studentId || !taskId || !action) {
    return NextResponse.json({ error: "studentId, taskId and valid action are required." }, { status: 400 });
  }

  const updated = await applyCatchUpTaskAction({
    studentId,
    taskId,
    action,
    actorUserId: session.userId,
    dueDate: typeof body?.dueDate === "string" ? body.dueDate : null,
    scheduledDay: parseDay(body?.scheduledDay),
    note: typeof body?.note === "string" ? body.note : null,
  });

  if (!updated) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  return NextResponse.json({ ok: true, task: updated });
}
