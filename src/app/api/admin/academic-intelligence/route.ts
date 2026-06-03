import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { getStudentLearningBrain } from "@/lib/student-learning-brain";

export async function GET(request: Request) {
  const { session, response } = await requireAdminPermission("reports:view");
  if (!session) return response;

  const params = new URL(request.url).searchParams;
  const studentId = params.get("studentId")?.trim();
  if (!studentId) return NextResponse.json({ error: "studentId is required." }, { status: 400 });

  const brain = await getStudentLearningBrain(studentId, {
    includeCoachSignals: true,
    syncTasks: true,
    actorUserId: session.userId,
  });
  if (!brain) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  return NextResponse.json(brain.academicIntelligence);
}
