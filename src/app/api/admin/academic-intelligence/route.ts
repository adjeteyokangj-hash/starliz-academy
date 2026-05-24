import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { buildAcademicSourceForStudent } from "@/lib/academic-intelligence/data";
import { buildAcademicIntelligence } from "@/lib/academic-intelligence/academicIntelligence";
import { listCatchUpTasks, syncCatchUpTasks } from "@/lib/academic-intelligence/catchUpTasks";

export async function GET(request: Request) {
  const { session, response } = await requireAdminPermission("reports:view");
  if (!session) return response;

  const params = new URL(request.url).searchParams;
  const studentId = params.get("studentId")?.trim();
  if (!studentId) return NextResponse.json({ error: "studentId is required." }, { status: 400 });

  const source = await buildAcademicSourceForStudent(studentId);
  if (!source) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  const existingTasks = await listCatchUpTasks(studentId);
  let output = buildAcademicIntelligence(source, { existingCatchUpTasks: existingTasks });
  const syncedTasks = await syncCatchUpTasks({
    studentId,
    recommendations: output.catchUpRecommendations,
    schoolWeekModePlan: output.schoolWeekModePlan,
    actorUserId: session.userId,
  });
  output = buildAcademicIntelligence(source, { existingCatchUpTasks: syncedTasks });

  return NextResponse.json(output);
}
