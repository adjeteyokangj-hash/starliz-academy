import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { canDo } from "@/lib/schools/permissions";
import { getSchoolTeacherContext } from "@/lib/schools/rbac";
import { getTeacherSupportDashboard } from "@/lib/schools/teacher-support-dashboard";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ error: "No active school teacher membership." }, { status: 403 });
  }
  if (!canDo(ctx.role, "viewHumanSupport")) {
    return NextResponse.json({ error: "Human support dashboard is not available for this role." }, { status: 403 });
  }

  const dashboard = await getTeacherSupportDashboard({
    schoolId: ctx.schoolId,
    schoolName: ctx.schoolName,
    schoolTeacherId: ctx.schoolTeacherId,
    role: ctx.role,
  });

  return NextResponse.json({ ok: true, dashboard });
}
