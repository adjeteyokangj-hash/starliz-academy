/**
 * GET /api/teacher/progress-report?windowDays=30&classroomId=...
 */

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { canDo, getSchoolTeacherContext } from "@/lib/schools/rbac";
import { getAccessibleStudents } from "@/lib/schools/scoping";
import { buildTeacherProgressPack } from "@/lib/progress-reporting";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ error: "No active school teacher membership." }, { status: 403 });
  }
  if (!canDo(ctx.role, "viewProgress")) {
    return NextResponse.json({ error: "Permission denied." }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const windowDays = Math.min(365, Math.max(1, parseInt(params.get("windowDays") ?? "30", 10) || 30));
  const classroomId = params.get("classroomId")?.trim() || undefined;

  const students = await getAccessibleStudents(
    ctx.schoolId,
    ctx.schoolTeacherId,
    ctx.role,
    classroomId,
  );

  const pack = await buildTeacherProgressPack({
    schoolId: ctx.schoolId,
    windowDays,
    students: students.map((row) => ({
      childId: row.childId,
      name: row.child.name,
      classroomId: row.classroomId,
      classroomName: row.classroom?.name ?? null,
      yearGroup: row.child.yearGroup ?? null,
    })),
  });

  return NextResponse.json({ ok: true, schoolId: ctx.schoolId, pack });
}
