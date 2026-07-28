import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { canDo } from "@/lib/schools/permissions";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";
import { listStudentYearChanges } from "@/lib/schools/academic-year-rollover";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) return NextResponse.json({ error: "School admin access required." }, { status: 403 });
  if (!canDo(ctx.role, "manageSchoolSettings") && !canDo(ctx.role, "viewDashboard")) {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }
  const childId = new URL(request.url).searchParams.get("childId")?.trim() || undefined;
  const rows = await listStudentYearChanges({ schoolId: ctx.schoolId, childId, take: 100 });
  return NextResponse.json({
    ok: true,
    changes: rows.map((r) => ({
      id: r.id,
      childId: r.childId,
      childName: r.child.name,
      schoolStudentId: r.schoolStudentId,
      fromYearGroup: r.fromYearGroup,
      toYearGroup: r.toYearGroup,
      reason: r.reason,
      academicYearFrom: r.academicYearFrom,
      academicYearTo: r.academicYearTo,
      actorUserId: r.actorUserId,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}