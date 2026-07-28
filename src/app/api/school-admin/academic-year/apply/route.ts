import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { canDo } from "@/lib/schools/permissions";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";
import { applyAcademicYearRollover } from "@/lib/schools/academic-year-rollover";

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) return NextResponse.json({ error: "School admin access required." }, { status: 403 });
  if (!canDo(ctx.role, "manageSchoolSettings")) {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const confirm = Boolean((body as { confirm?: unknown }).confirm);
  const result = await applyAcademicYearRollover({
    schoolId: ctx.schoolId,
    actorUserId: session.userId,
    confirm,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, result });
}