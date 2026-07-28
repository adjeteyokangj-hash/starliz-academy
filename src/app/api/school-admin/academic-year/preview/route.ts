import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { canDo } from "@/lib/schools/permissions";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";
import { previewAcademicYearRollover } from "@/lib/schools/academic-year-rollover";

export async function POST() {
  const { session, response } = await requireSession();
  if (!session) return response;
  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) return NextResponse.json({ error: "School admin access required." }, { status: 403 });
  if (!canDo(ctx.role, "manageSchoolSettings")) {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }
  const preview = await previewAcademicYearRollover(ctx.schoolId);
  return NextResponse.json({ ok: true, preview });
}