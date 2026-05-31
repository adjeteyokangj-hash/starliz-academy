import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { saveStudentHomeworkDraft, toHomeworkPhase1BResponseError } from "@/lib/homework-phase1b/service";

export async function POST(request: Request) {
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

  const body = await request.json().catch(() => null) as {
    batchId?: string;
    questionId?: string;
    answer?: unknown;
  } | null;

  const batchId = body?.batchId?.trim();
  const questionId = body?.questionId?.trim();
  if (!batchId || !questionId) {
    return NextResponse.json({ error: "batchId and questionId are required." }, { status: 400 });
  }

  try {
    const homework = await saveStudentHomeworkDraft({
      studentId,
      batchId,
      questionId,
      answer: body?.answer ?? null,
      actorUserId: session.userId,
    });
    return NextResponse.json({ ok: true, homework });
  } catch (error) {
    const normalized = toHomeworkPhase1BResponseError(error);
    return NextResponse.json({ error: normalized.message }, { status: normalized.statusCode });
  }
}
