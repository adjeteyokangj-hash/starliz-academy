import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import type { HumanSupportOutcome } from "@prisma/client";
import { adminCloseAbandonedSession } from "@/lib/schools/admin-support-actions";

type Params = { params: Promise<{ schoolId: string; sessionId: string }> };

const ALLOWED: HumanSupportOutcome[] = [
  "disconnected",
  "unresolved",
  "period_ended",
  "escalated",
  "partially_resolved",
];

export async function POST(request: Request, context: Params) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const { schoolId, sessionId } = await context.params;
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true },
  });
  if (!school) {
    return NextResponse.json({ error: "School not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null) as {
    reason?: unknown;
    outcome?: unknown;
  } | null;

  const reason = typeof body?.reason === "string" ? body.reason : "";
  const outcomeRaw = typeof body?.outcome === "string" ? body.outcome : "disconnected";
  const outcome = ALLOWED.includes(outcomeRaw as HumanSupportOutcome)
    ? (outcomeRaw as HumanSupportOutcome)
    : "disconnected";

  const result = await adminCloseAbandonedSession({
    schoolId,
    sessionId,
    actorUserId: session.userId,
    reason,
    outcome,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
