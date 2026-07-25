import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import { adminForceTutorOffline } from "@/lib/schools/admin-support-actions";

type Params = { params: Promise<{ schoolId: string; schoolTeacherId: string }> };

export async function POST(request: Request, context: Params) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const { schoolId, schoolTeacherId } = await context.params;
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true },
  });
  if (!school) {
    return NextResponse.json({ error: "School not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null) as {
    reason?: unknown;
    closeActiveSession?: unknown;
  } | null;

  const reason = typeof body?.reason === "string" ? body.reason : "";
  const closeActiveSession = Boolean(body?.closeActiveSession);

  const result = await adminForceTutorOffline({
    schoolId,
    schoolTeacherId,
    actorUserId: session.userId,
    reason,
    closeActiveSession,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, closedSessionId: result.closedSessionId });
}
