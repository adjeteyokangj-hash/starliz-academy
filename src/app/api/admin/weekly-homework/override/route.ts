import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { applyHomeworkOverrideAction, toHomeworkPhase1BResponseError } from "@/lib/homework-phase1b/service";

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("reports:view");
  if (!session) return response;

  const body = await request.json().catch(() => null) as {
    studentId?: string;
    batchId?: string;
    action?: "override" | "excuse";
    reason?: string;
  } | null;

  const studentId = body?.studentId?.trim();
  const batchId = body?.batchId?.trim();
  const action = body?.action;
  const reason = body?.reason?.trim() ?? "";
  if (!studentId || !batchId || (action !== "override" && action !== "excuse")) {
    return NextResponse.json({ error: "studentId, batchId and valid action are required." }, { status: 400 });
  }

  try {
    const homework = await applyHomeworkOverrideAction({
      studentId,
      batchId,
      action,
      reason,
      actorUserId: session.userId,
    });
    return NextResponse.json({ ok: true, homework });
  } catch (error) {
    const normalized = toHomeworkPhase1BResponseError(error);
    return NextResponse.json({ error: normalized.message }, { status: normalized.statusCode });
  }
}
