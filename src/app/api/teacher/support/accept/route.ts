import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { canDo } from "@/lib/schools/permissions";
import { getSchoolTeacherContext } from "@/lib/schools/rbac";
import { acceptSupportQueueEntry } from "@/lib/schools/short-learning-support-accept";

/**
 * Accept a human-support queue entry without requiring a SchoolDayLesson Live board.
 * Used for Short Learning (synthetic periodId) and works for Day School queue entries too.
 */
export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ error: "No active school teacher membership." }, { status: 403 });
  }
  if (!canDo(ctx.role, "viewHumanSupport")) {
    return NextResponse.json({ error: "Human support is not available for this role." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { queueEntryId?: string };
  const queueEntryId = typeof body.queueEntryId === "string" ? body.queueEntryId.trim() : "";
  if (!queueEntryId) {
    return NextResponse.json({ error: "queueEntryId is required." }, { status: 400 });
  }

  const result = await acceptSupportQueueEntry({
    schoolId: ctx.schoolId,
    schoolTeacherId: ctx.schoolTeacherId,
    actorUserId: session.userId,
    queueEntryId,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: "status" in result && typeof result.status === "number" ? result.status : 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    sessionId: result.sessionId,
    queueEntryId: result.queueEntryId,
    supportMode: result.display?.supportMode ?? null,
    context: result.display
      ? {
          supportMode: result.display.supportMode,
          subject: result.display.subject,
          yearGroup: result.display.yearGroup,
          shortLearningBookingId: result.display.shortLearningBookingId,
          shortLearningBlockId: result.display.shortLearningBlockId,
          questionKey: result.display.questionKey,
          bookingWindowLabel: result.display.bookingWindowLabel,
        }
      : null,
    message:
      result.display?.supportMode === "SHORT_LEARNING"
        ? "Short Learning support session started. Return the student to the same block when finished."
        : "Human support session started.",
  });
}
