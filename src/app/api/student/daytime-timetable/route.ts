import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { getStudentDaytimeBoardScoped } from "@/lib/schools/daytime-timetable-queries";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const params = new URL(request.url).searchParams;
  const requestedStudentId = params.get("studentId")?.trim() || null;
  const requestedClassroomId = params.get("classroomId");
  const requestedSchoolId = params.get("schoolId");
  const dayRaw = params.get("dayOfWeek");
  const dayOfWeek = dayRaw ? Number(dayRaw) : undefined;

  const isAdminPreview = session.role === "admin" && Boolean(requestedStudentId);
  let childId: string | null = null;

  if (isAdminPreview) {
    childId = requestedStudentId;
  } else {
    const parentScope = await resolveParentScope(session);
    if (!parentScope) {
      return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
    }
    childId = requestedStudentId
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
  }

  if (!childId) {
    return NextResponse.json({ error: "No active learner selected." }, { status: 400 });
  }

  const result = await getStudentDaytimeBoardScoped({
    childId,
    requestedClassroomId,
    requestedSchoolId,
    dayOfWeek: Number.isFinite(dayOfWeek) ? dayOfWeek : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, board: result.board });
}
