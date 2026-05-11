import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
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
    return NextResponse.json({ ok: true, lesson: null, message: "No active student selected." });
  }

  const student = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId, archived: false },
    select: { id: true, level: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  try {
    const lesson = await autoBuildLessonForStudent({ studentId, actorUserId: session.userId });
    return NextResponse.json({ ok: true, ...lesson });
  } catch {
    return NextResponse.json({ error: "Unable to build daily lesson." }, { status: 500 });
  }
}
