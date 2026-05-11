import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { autoBuildLessonForStudent } from "@/lib/autoLesson";

const bodySchema = z.object({
  studentId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const activeUser = await prisma.user.findUnique({
    where: { id: parentScope.parentId },
    select: { activeChildId: true },
  });
  const studentId = body.data.studentId ?? activeUser?.activeChildId;
  if (!studentId) {
    return NextResponse.json({ error: "No active student selected." }, { status: 400 });
  }

  const student = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId, archived: false },
    select: { id: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  try {
    const lesson = await autoBuildLessonForStudent({ studentId, actorUserId: session.userId });
    return NextResponse.json({ ok: true, ...lesson });
  } catch {
    return NextResponse.json({ error: "Unable to auto-build lesson." }, { status: 500 });
  }
}
