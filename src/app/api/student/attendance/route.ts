import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { getStudentAttendanceHistory } from "@/lib/schools/attendance-register";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const params = new URL(request.url).searchParams;
  const requestedStudentId = params.get("studentId")?.trim() || null;
  const requestedSchoolStudentId = params.get("schoolStudentId")?.trim() || null;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const childId = requestedStudentId
    ?? await resolveParentActiveChildId(parentScope.parentId);
  if (!childId) {
    return NextResponse.json({ error: "No active learner selected." }, { status: 400 });
  }

  const owned = await prisma.childProfile.findFirst({
    where: { id: childId, parentId: parentScope.parentId, archived: false },
    select: { id: true },
  });
  if (!owned) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  // ParentSchoolLink is optional enrichment — ChildProfile ownership already verifies the relationship.
  const result = await getStudentAttendanceHistory({
    childId,
    expectedSchoolStudentId: requestedSchoolStudentId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    schoolStudentId: result.schoolStudentId,
    items: result.items,
  });
}
