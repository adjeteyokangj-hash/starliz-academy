import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import { buildAdminSupportExport } from "@/lib/schools/admin-support-dashboard";
import { writeSchoolAuditLog } from "@/lib/schools/audit";

type Params = { params: Promise<{ schoolId: string }> };

export async function GET(request: Request, context: Params) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const { schoolId } = await context.params;
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true },
  });
  if (!school) {
    return NextResponse.json({ error: "School not found." }, { status: 404 });
  }

  const sensitive = new URL(request.url).searchParams.get("sensitive") === "1";
  const pack = await buildAdminSupportExport({ schoolId, sensitive });
  if (!pack) {
    return NextResponse.json({ error: "Unable to export." }, { status: 500 });
  }

  await writeSchoolAuditLog({
    schoolId,
    actorUserId: session.userId,
    actorAdminUserId: session.userId,
    actorType: "admin_user",
    source: "api",
    action: "human_support_admin_export",
    entityType: "human_support",
    severity: sensitive ? "warning" : "info",
    metadata: { sensitive, sessionCount: pack.sessions.length },
  });

  return NextResponse.json({ ok: true, export: pack });
}
