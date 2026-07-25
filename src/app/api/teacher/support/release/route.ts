import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { canDo } from "@/lib/schools/permissions";
import { getSchoolTeacherContext } from "@/lib/schools/rbac";
import { releaseHumanSupportAssignment } from "@/lib/schools/human-support-scheduler";

/**
 * Release a claimed (not yet accepted) assignment back to waiting.
 */
export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ error: "No active school teacher membership." }, { status: 403 });
  }
  if (!canDo(ctx.role, "viewHumanSupport")) {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const queueEntryId = typeof (body as { queueEntryId?: unknown }).queueEntryId === "string"
    ? (body as { queueEntryId: string }).queueEntryId.trim()
    : "";
  const reason = typeof (body as { reason?: unknown }).reason === "string"
    ? (body as { reason: string }).reason
    : null;

  if (!queueEntryId) {
    return NextResponse.json({ error: "queueEntryId is required." }, { status: 400 });
  }

  const result = await releaseHumanSupportAssignment({
    schoolId: ctx.schoolId,
    schoolTeacherId: ctx.schoolTeacherId,
    actorUserId: session.userId,
    queueEntryId,
    reason,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    queueEntryId: result.queueEntryId,
    childId: result.childId,
    periodId: result.periodId,
    message: "Assignment released. Student remains on AI support until another tutor claims them.",
  });
}
