import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { applyHomeworkOverrideAction, toHomeworkPhase1BResponseError } from "@/lib/homework-phase1b/service";

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null) as {
    childId?: string;
    batchId?: string;
    action?: "override" | "excuse" | "unlock" | "extend" | "reduce" | "regenerate";
    reason?: string;
    reduceBy?: number;
    extendToIso?: string;
  } | null;

  const childId = body?.childId?.trim();
  const batchId = body?.batchId?.trim();
  const action = body?.action;
  const reason = body?.reason?.trim() ?? "";
  const isValidAction = action === "override"
    || action === "excuse"
    || action === "unlock"
    || action === "extend"
    || action === "reduce"
    || action === "regenerate";

  if (!childId || !batchId || !isValidAction) {
    return NextResponse.json({ error: "childId, batchId and valid action are required." }, { status: 400 });
  }

  const ownedChild = await prisma.childProfile.findFirst({
    where: { id: childId, parentId: parentScope.parentId, archived: false },
    select: { id: true },
  });
  if (!ownedChild) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  try {
    const homework = await applyHomeworkOverrideAction({
      studentId: childId,
      batchId,
      action,
      reason,
      reduceBy: typeof body?.reduceBy === "number" ? body.reduceBy : undefined,
      extendToIso: typeof body?.extendToIso === "string" ? body.extendToIso : undefined,
      actorUserId: session.userId,
    });
    return NextResponse.json({ ok: true, homework });
  } catch (error) {
    const normalized = toHomeworkPhase1BResponseError(error);
    return NextResponse.json({ error: normalized.message }, { status: normalized.statusCode });
  }
}
