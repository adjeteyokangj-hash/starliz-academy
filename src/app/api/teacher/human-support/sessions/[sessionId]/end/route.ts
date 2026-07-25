import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { getSchoolTeacherContext } from "@/lib/schools/rbac";
import { endHumanSupportSession } from "@/lib/schools/human-support-scheduler";
import { outcomeUiLabel } from "@/lib/schools/human-support-session";
import type { HumanSupportOutcome } from "@prisma/client";

type Params = { params: Promise<{ sessionId: string }> };

const OUTCOMES: HumanSupportOutcome[] = [
  "resolved",
  "partially_resolved",
  "unresolved",
  "escalated",
  "student_recovered",
  "period_ended",
  "disconnected",
];

export async function POST(request: Request, context: Params) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ error: "No active school teacher membership." }, { status: 403 });
  }

  const { sessionId } = await context.params;
  const body = await request.json().catch(() => null);
  const outcomeRaw = body && typeof body === "object" ? (body as { outcome?: unknown }).outcome : null;
  const outcome = typeof outcomeRaw === "string" && OUTCOMES.includes(outcomeRaw as HumanSupportOutcome)
    ? (outcomeRaw as HumanSupportOutcome)
    : null;
  if (!outcome) {
    return NextResponse.json({ error: "Valid outcome is required." }, { status: 400 });
  }

  const outcomeNotes = body && typeof body === "object" && typeof (body as { outcomeNotes?: unknown }).outcomeNotes === "string"
    ? (body as { outcomeNotes: string }).outcomeNotes
    : null;
  const unresolvedReport = body && typeof body === "object"
    ? (body as { unresolvedReport?: unknown }).unresolvedReport
    : null;
  const sessionNotes = body && typeof body === "object"
    ? (body as { sessionNotes?: unknown }).sessionNotes
    : null;

  const result = await endHumanSupportSession({
    schoolId: ctx.schoolId,
    schoolTeacherId: ctx.schoolTeacherId,
    actorUserId: session.userId,
    sessionId,
    outcome,
    outcomeNotes,
    unresolvedReport,
    sessionNotes: sessionNotes && typeof sessionNotes === "object"
      ? sessionNotes as {
          privateNotes?: string;
          misconception?: string;
          actionsTaken?: string[];
          followUpNeeded?: boolean;
        }
      : null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    durationMinutes: result.durationMinutes,
    exceededBudget: result.exceededBudget,
    nextAssigned: result.nextAssigned,
    escalatedQueueEntryId: result.escalatedQueueEntryId,
    returnAction: result.returnAction,
    outcome,
    outcomeLabel: outcomeUiLabel(outcome),
  });
}
