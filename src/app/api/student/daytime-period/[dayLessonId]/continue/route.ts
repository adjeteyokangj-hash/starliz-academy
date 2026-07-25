import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { ensureLearningAccessForDaytimePeriod } from "@/lib/subscriptions/learning-access";
import { continueDaytimePeriod } from "@/lib/schools/start-daytime-period";

type RouteContext = {
  params: Promise<{ dayLessonId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const { dayLessonId: rawId } = await context.params;
  const dayLessonId = rawId?.trim();
  if (!dayLessonId) {
    return NextResponse.json({ error: "Missing period id." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({})) as {
    studentId?: string;
    completedContentId?: string;
  };
  const requestedStudentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
  const completedContentId = typeof body.completedContentId === "string"
    ? body.completedContentId.trim()
    : "";

  const isAdminPreview = session.role === "admin" && Boolean(requestedStudentId);
  let childId: string | null = null;

  if (isAdminPreview) {
    childId = requestedStudentId;
  } else {
    const parentScope = await resolveParentScope(session);
    if (!parentScope) {
      return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
    }

    childId = requestedStudentId || await resolveParentActiveChildId(parentScope.parentId);
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

    const access = await ensureLearningAccessForDaytimePeriod({
      parentId: parentScope.parentId,
      childId,
      dayLessonId,
    });
    if (access.response) return access.response;
  }

  if (!childId) {
    return NextResponse.json({ error: "No active learner selected." }, { status: 400 });
  }

  const result = await continueDaytimePeriod({
    childId,
    dayLessonId,
    completedContentId: completedContentId || null,
    actorUserId: session.userId,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code ?? null },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    href: result.href,
    assignmentId: result.assignmentId,
    mode: result.mode,
    contentId: result.contentId,
    periodTitle: result.periodTitle,
    sessionPlan: result.sessionPlan,
  });
}
