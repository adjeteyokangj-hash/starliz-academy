import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { buildDailyJourney } from "@/lib/dailyJourney";
import { resolveParentActiveChildId } from "@/lib/activeChild";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const studentId = await resolveParentActiveChildId(parentScope.parentId);
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

  try {
    const journey = await buildDailyJourney(student.id);

    return NextResponse.json({
      ok: true,
      student,
      journey,
      lesson: null,
      structure: [
        "1 warm-up",
        "2 core practice tasks",
        "1 weak-area repair",
        "1 mixed reinforcement",
        "1 boss gate",
      ],
    });
  } catch (err) {
    console.error("[daily-journey]", err);
    return NextResponse.json({ error: "Unable to build daily journey." }, { status: 500 });
  }
}
