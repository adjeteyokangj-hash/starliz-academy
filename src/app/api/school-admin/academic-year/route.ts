import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { canDo } from "@/lib/schools/permissions";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";
import {
  getOrCreateAcademicYearConfig,
  updateAcademicYearConfig,
} from "@/lib/schools/academic-year-config";
import { isAcademicYearStatus } from "@/lib/schools/academic-year-labels";
import { writeSchoolAuditLog } from "@/lib/schools/audit";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;
  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) return NextResponse.json({ error: "School admin access required." }, { status: 403 });
  if (!canDo(ctx.role, "manageSchoolSettings") && !canDo(ctx.role, "viewDashboard")) {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }
  const config = await getOrCreateAcademicYearConfig(ctx.schoolId);
  return NextResponse.json({ ok: true, config });
}

export async function PATCH(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) return NextResponse.json({ error: "School admin access required." }, { status: 403 });
  if (!canDo(ctx.role, "manageSchoolSettings")) {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const statusRaw = typeof (body as { status?: unknown }).status === "string"
    ? (body as { status: string }).status
    : undefined;
  if (statusRaw !== undefined && !isAcademicYearStatus(statusRaw)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const updated = await updateAcademicYearConfig({
    schoolId: ctx.schoolId,
    currentAcademicYear:
      typeof (body as { currentAcademicYear?: unknown }).currentAcademicYear === "string"
        ? (body as { currentAcademicYear: string }).currentAcademicYear
        : undefined,
    nextAcademicYear:
      typeof (body as { nextAcademicYear?: unknown }).nextAcademicYear === "string"
        ? (body as { nextAcademicYear: string }).nextAcademicYear
        : undefined,
    promotionDate:
      typeof (body as { promotionDate?: unknown }).promotionDate === "string"
        ? (body as { promotionDate: string }).promotionDate
        : undefined,
    status: statusRaw as "waiting" | "ready" | "applied" | undefined,
  });

  if ("ok" in updated && updated.ok === false) {
    return NextResponse.json({ error: updated.error }, { status: updated.status });
  }

  await writeSchoolAuditLog({
    schoolId: ctx.schoolId,
    actorUserId: session.userId,
    action: "school_status_changed",
    entityType: "school",
    entityId: ctx.schoolId,
    metadata: { event: "academic_year_config_updated", config: updated },
    severity: "info",
  });

  return NextResponse.json({ ok: true, config: updated });
}