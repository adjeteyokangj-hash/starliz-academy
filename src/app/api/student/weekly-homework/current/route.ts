import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { getCurrentHomeworkBatchView, toHomeworkPhase1BResponseError } from "@/lib/homework-phase1b/service";

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

  const ownedChild = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId, archived: false },
    select: { id: true },
  });
  if (!ownedChild) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  try {
    const homework = await getCurrentHomeworkBatchView(studentId);
    return NextResponse.json({ ok: true, homework });
  } catch (error) {
    const normalized = toHomeworkPhase1BResponseError(error);
    return NextResponse.json({ error: normalized.message }, { status: normalized.statusCode });
  }
}
