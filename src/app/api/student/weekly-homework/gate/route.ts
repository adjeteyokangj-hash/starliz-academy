import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { getStudentHomeworkGateSnapshot } from "@/lib/homework-phase1b/service";
import type { HomeworkSurface } from "@/lib/homework-phase1b/contracts";

function parseSurface(value: string | null): HomeworkSurface {
  if (
    value === "homework"
    || value === "coach_homework_help"
    || value === "previous_lesson_review"
    || value === "dictionary_glossary"
    || value === "reports"
    || value === "parent_admin_messages"
  ) {
    return value;
  }
  return "new_learning_session";
}

export async function GET(request: Request) {
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

  const params = new URL(request.url).searchParams;
  const surface = parseSurface(params.get("surface"));
  const snapshot = await getStudentHomeworkGateSnapshot(studentId, surface);
  return NextResponse.json({
    ok: snapshot.access.allowed,
    featureEnabled: snapshot.featureEnabled,
    code: snapshot.access.code,
    reason: snapshot.access.reason,
    gate: snapshot.access.gate,
    homework: snapshot.batch,
  }, { status: snapshot.access.statusCode });
}
