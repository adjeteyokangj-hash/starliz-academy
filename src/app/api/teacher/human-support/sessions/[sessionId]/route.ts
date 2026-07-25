import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { getSchoolTeacherContext } from "@/lib/schools/rbac";
import { prisma } from "@/lib/db";
import { parseSessionMetadata, outcomeUiLabel } from "@/lib/schools/human-support-session";
import {
  sendHumanSupportGuidance,
  updateHumanSupportSessionNotes,
} from "@/lib/schools/human-support-scheduler";

type Params = { params: Promise<{ sessionId: string }> };

export async function GET(_request: Request, context: Params) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ error: "No active school teacher membership." }, { status: 403 });
  }

  const { sessionId } = await context.params;
  const row = await prisma.humanSupportSession.findUnique({ where: { id: sessionId } });
  if (!row || row.schoolId !== ctx.schoolId) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (row.schoolTeacherId !== ctx.schoolTeacherId) {
    return NextResponse.json({ error: "Not your session." }, { status: 403 });
  }

  const meta = parseSessionMetadata(row.metadataJson);
  const now = Date.now();
  const planned = row.plannedEndsAt?.getTime() ?? null;
  const secondsRemaining = planned != null ? Math.ceil((planned - now) / 1000) : null;

  return NextResponse.json({
    ok: true,
    session: {
      id: row.id,
      childId: row.childId,
      periodId: row.periodId,
      status: row.status,
      outcome: row.outcome,
      outcomeLabel: row.outcome ? outcomeUiLabel(row.outcome) : null,
      budgetMinutes: row.budgetMinutes,
      plannedEndsAt: row.plannedEndsAt?.toISOString() ?? null,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      exceededBudget: row.exceededBudget || (planned != null && now > planned),
      secondsRemaining,
      snapshot: meta.supportContextSnapshot,
      notes: meta.sessionNotes,
      guidanceMessages: meta.guidanceMessages,
      returnAction: "resume_current",
    },
  });
}

export async function PATCH(request: Request, context: Params) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ error: "No active school teacher membership." }, { status: 403 });
  }

  const { sessionId } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "JSON body required." }, { status: 400 });
  }

  const action = typeof (body as { action?: unknown }).action === "string"
    ? (body as { action: string }).action
    : "notes";

  if (action === "notes") {
    const notes = (body as { notes?: unknown }).notes;
    if (!notes || typeof notes !== "object") {
      return NextResponse.json({ error: "notes object required." }, { status: 400 });
    }
    const result = await updateHumanSupportSessionNotes({
      schoolId: ctx.schoolId,
      schoolTeacherId: ctx.schoolTeacherId,
      sessionId,
      notes: notes as {
        privateNotes?: string;
        misconception?: string;
        actionsTaken?: string[];
        followUpNeeded?: boolean;
      },
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, notes: result.notes });
  }

  if (action === "guidance") {
    const text = typeof (body as { text?: unknown }).text === "string"
      ? (body as { text: string }).text
      : "";
    const result = await sendHumanSupportGuidance({
      schoolId: ctx.schoolId,
      schoolTeacherId: ctx.schoolTeacherId,
      sessionId,
      text,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, message: result.message, deduped: result.deduped });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
