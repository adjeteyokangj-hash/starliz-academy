import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import { adminReassignQueueEntry } from "@/lib/schools/admin-support-actions";

type Params = { params: Promise<{ schoolId: string; entryId: string }> };

export async function POST(request: Request, context: Params) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const { schoolId, entryId } = await context.params;
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true },
  });
  if (!school) {
    return NextResponse.json({ error: "School not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null) as {
    targetSchoolTeacherId?: unknown;
    reason?: unknown;
  } | null;

  const targetSchoolTeacherId = typeof body?.targetSchoolTeacherId === "string"
    ? body.targetSchoolTeacherId
    : "";
  if (!targetSchoolTeacherId) {
    return NextResponse.json({ error: "targetSchoolTeacherId is required." }, { status: 400 });
  }

  const result = await adminReassignQueueEntry({
    schoolId,
    queueEntryId: entryId,
    actorUserId: session.userId,
    targetSchoolTeacherId,
    reason: typeof body?.reason === "string" ? body.reason : null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
