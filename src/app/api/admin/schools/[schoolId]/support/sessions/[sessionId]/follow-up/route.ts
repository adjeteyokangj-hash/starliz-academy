import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import { adminUpdateUnresolvedFollowUp } from "@/lib/schools/admin-support-actions";
import type { AdminFollowUpStatus } from "@/lib/schools/admin-support-follow-up";

type Params = { params: Promise<{ schoolId: string; sessionId: string }> };

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
    status?: unknown;
    ownerUserId?: unknown;
    dueAt?: unknown;
    adminNote?: unknown;
  } | null;

  const statusRaw = typeof body?.status === "string" ? body.status : "";
  if (statusRaw !== "open" && statusRaw !== "in_progress" && statusRaw !== "closed") {
    return NextResponse.json({ error: "status must be open, in_progress, or closed." }, { status: 400 });
  }

  const result = await adminUpdateUnresolvedFollowUp({
    schoolId,
    sessionId,
    actorUserId: session.userId,
    status: statusRaw as AdminFollowUpStatus,
    ownerUserId: typeof body?.ownerUserId === "string" ? body.ownerUserId : null,
    dueAt: typeof body?.dueAt === "string" ? body.dueAt : null,
    adminNote: typeof body?.adminNote === "string" ? body.adminNote : null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, followUp: result.followUp });
}
