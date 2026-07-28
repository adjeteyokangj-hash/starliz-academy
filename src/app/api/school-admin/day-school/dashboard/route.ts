import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";
import { findSchoolDashboardRecord } from "@/lib/schools/school-admin-payload";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ error: "School admin access required." }, { status: 403 });
  }

  const school = await findSchoolDashboardRecord(ctx.schoolId);
  if (!school) {
    return NextResponse.json({ error: "School not found." }, { status: 404 });
  }

  return NextResponse.json({ school });
}
