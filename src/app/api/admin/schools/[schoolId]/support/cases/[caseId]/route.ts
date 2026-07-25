import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import { getAdminSupportCaseTimeline } from "@/lib/schools/admin-support-case";
import { writeSchoolAuditLog } from "@/lib/schools/audit";

type Params = { params: Promise<{ schoolId: string; caseId: string }> };

export async function GET(request: Request, context: Params) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const { schoolId, caseId } = await context.params;
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true },
  });
  if (!school) {
    return NextResponse.json({ error: "School not found." }, { status: 404 });
  }

  const includePrivateNotes = new URL(request.url).searchParams.get("includePrivateNotes") === "1";
  const decodedCaseId = decodeURIComponent(caseId);

  if (includePrivateNotes) {
    await writeSchoolAuditLog({
      schoolId,
      actorUserId: session.userId,
      actorAdminUserId: session.userId,
      actorType: "admin_user",
      source: "api",
      action: "human_support_admin_view_private_notes",
      entityType: "human_support",
      entityId: decodedCaseId,
      severity: "warning",
      metadata: { caseId: decodedCaseId },
    });
  }

  const result = await getAdminSupportCaseTimeline({
    schoolId,
    caseId: decodedCaseId,
    includePrivateNotes,
    actorUserId: session.userId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, case: result });
}
