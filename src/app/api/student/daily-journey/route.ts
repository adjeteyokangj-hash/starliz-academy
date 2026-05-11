import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { buildDailyJourney } from "@/lib/dailyJourney";
import { autoBuildLessonForStudent } from "@/lib/autoLesson";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const activeUser = await prisma.user.findUnique({
    where: { id: parentScope.parentId },
    select: { activeChildId: true },
  });
  const studentId = activeUser?.activeChildId;
  if (!studentId) {
    return NextResponse.json({ error: "No active student selected." }, { status: 400 });
  }

  const student = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId, archived: false },
    select: { id: true, name: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const [journey, lesson] = await Promise.all([
    buildDailyJourney(student.id),
    autoBuildLessonForStudent({ studentId: student.id, actorUserId: session.userId }),
  ]);

  return NextResponse.json({
    ok: true,
    student,
    journey,
    lesson,
    structure: [
      "1 warm-up",
      "2 core practice tasks",
      "1 weak-area repair",
      "1 mixed reinforcement",
      "1 boss gate",
    ],
  });
}
