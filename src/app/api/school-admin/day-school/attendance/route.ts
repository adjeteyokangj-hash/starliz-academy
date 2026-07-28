import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { getAdminDayAttendanceSummary } from "@/lib/schools/attendance-register";
import { canDo } from "@/lib/schools/permissions";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ error: "School admin access required." }, { status: 403 });
  }
  if (!canDo(ctx.role, "viewClassrooms") && !canDo(ctx.role, "viewStudents")) {
    return NextResponse.json({ error: "Not permitted to view attendance." }, { status: 403 });
  }

  const url = new URL(request.url);
  const sessionDate = url.searchParams.get("sessionDate");
  const summary = await getAdminDayAttendanceSummary({
    schoolId: ctx.schoolId,
    sessionDate,
  });

  return NextResponse.json({ ok: true, schoolId: ctx.schoolId, ...summary });
}
