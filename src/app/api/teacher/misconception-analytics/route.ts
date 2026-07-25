/**
 * GET /api/teacher/misconception-analytics?windowDays=30&classroomId=...
 * School-scoped misconception summary for accessible students.
 */

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { getSchoolTeacherContext, canDo } from "@/lib/schools/rbac";
import { getAccessibleStudents } from "@/lib/schools/scoping";
import { buildMisconceptionCohortSummary } from "@/lib/misconception-analytics";

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
  const studentId = params.get("studentId")?.trim();

  const students = await getAccessibleStudents(
    ctx.schoolId,
    ctx.schoolTeacherId,
    ctx.role,
    classroomId,
  );

  let studentIds = students.map((row) => row.childId);
  if (studentId) {
    if (!studentIds.includes(studentId)) {
      return NextResponse.json({ error: "Student not in your scope." }, { status: 403 });
    }
    studentIds = [studentId];
  }

  const cohort = await buildMisconceptionCohortSummary({
    studentIds,
    windowDays,
    schoolId: ctx.schoolId,
  });

  return NextResponse.json({
    ok: true,
    schoolId: ctx.schoolId,
    cohort,
  });
}
