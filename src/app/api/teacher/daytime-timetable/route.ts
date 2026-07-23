import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { getSchoolTeacherContext } from "@/lib/schools/rbac";
import { getTutorDaytimeBoardForSession } from "@/lib/schools/daytime-timetable-queries";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ error: "No active school teacher membership." }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const requestedTeacherId = params.get("teacherId");
  const dayRaw = params.get("dayOfWeek");
  const dayOfWeek = dayRaw ? Number(dayRaw) : undefined;

  const result = await getTutorDaytimeBoardForSession({
    schoolId: ctx.schoolId,
    schoolTeacherId: ctx.schoolTeacherId,
    requestedTeacherId,
    dayOfWeek: Number.isFinite(dayOfWeek) ? dayOfWeek : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, board: result.board });
}
