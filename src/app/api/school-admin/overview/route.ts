import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { canDo } from "@/lib/schools/permissions";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";
import { buildSchoolOpsOverview } from "@/lib/schools/school-ops-overview";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ error: "School admin access required." }, { status: 403 });
  }
  if (!canDo(ctx.role, "viewDashboard")) {
    return NextResponse.json({ error: "Not permitted to view dashboard." }, { status: 403 });
  }

  try {
    const overview = await buildSchoolOpsOverview({
      schoolId: ctx.schoolId,
      role: ctx.role,
    });
    return NextResponse.json({ ok: true, overview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load overview.";
    if (message === "School not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}