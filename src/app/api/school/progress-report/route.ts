/**
 * GET /api/school/progress-report?schoolId=...&windowDays=30&classroomId=...
 */

import { NextResponse } from "next/server";
import { requireSchoolPermission } from "@/lib/schools/guards";
import { getAccessibleStudents } from "@/lib/schools/scoping";
import { buildSchoolLeaderProgressPack } from "@/lib/progress-reporting";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const schoolId = url.searchParams.get("schoolId")?.trim();
  if (!schoolId) {
    return NextResponse.json({ error: "schoolId is required" }, { status: 400 });
  }

  const access = await requireSchoolPermission(schoolId, "viewReports", {
    method: "GET",
    route: "/api/school/progress-report",
    resourceType: "report",
  });
  if (access.response) return access.response;

  const windowDays = Math.min(365, Math.max(1, parseInt(url.searchParams.get("windowDays") ?? "30", 10) || 30));
  const classroomId = url.searchParams.get("classroomId")?.trim() || undefined;

  const students = await getAccessibleStudents(
    schoolId,
    access.context.schoolTeacherId,
    access.context.role,
    classroomId,
  );

  const pack = await buildSchoolLeaderProgressPack({
    schoolId,
    windowDays,
    students: students.map((row) => ({
      childId: row.childId,
      name: row.child.name,
      classroomId: row.classroomId,
      classroomName: row.classroom?.name ?? null,
      yearGroup: row.child.yearGroup ?? null,
    })),
  });

  return NextResponse.json({ ok: true, schoolId, pack });
}
