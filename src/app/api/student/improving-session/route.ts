import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId, resolveStudentOwnedChildProfile } from "@/lib/activeChild";
import { ensureLearningAccess } from "@/lib/subscriptions/learning-access";
import {
  IMPROVING_SESSION_MINUTES,
  improvingSessionHref,
  resolveImprovingBoostSession,
} from "@/lib/improving-session";
import { DEFAULT_MASTERED_REVIEW_POLICY } from "@/lib/student-dashboard-sections";

async function resolveStudentId(
  session: { userId: string; email: string; role: string },
  requestedStudentId: string | null,
) {
  const parentScope = await resolveParentScope(session);
  if (!parentScope) return { error: NextResponse.json({ error: "Parent account not found." }, { status: 404 }) };

  const access = await ensureLearningAccess(parentScope.parentId);
  if (access.response) return { error: access.response };

  if (session.role === "student") {
    const owned = await resolveStudentOwnedChildProfile(session.userId);
    if (!owned || owned.parentId !== parentScope.parentId) {
      return { error: NextResponse.json({ error: "Student profile not linked." }, { status: 404 }) };
    }
    if (requestedStudentId && requestedStudentId !== owned.childId) {
      return { error: NextResponse.json({ error: "Student can only start their own improving session." }, { status: 403 }) };
    }
    return { parentScope, studentId: owned.childId };
  }

  const studentId = requestedStudentId ?? await resolveParentActiveChildId(parentScope.parentId);
  if (!studentId) {
    return { error: NextResponse.json({ error: "No active student selected." }, { status: 400 }) };
  }
  const child = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId, archived: false },
    select: { id: true },
  });
  if (!child) {
    return { error: NextResponse.json({ error: "Student not found." }, { status: 404 }) };
  }
  return { parentScope, studentId: child.id };
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const body = await request.json().catch(() => null) as { studentId?: string } | null;
  const requestedStudentId = body?.studentId?.trim() || new URL(request.url).searchParams.get("studentId");
  const resolved = await resolveStudentId(session, requestedStudentId);
  if ("error" in resolved && resolved.error) return resolved.error;
  const studentId = resolved.studentId!;

  const [skills, assignmentRows] = await Promise.all([
    prisma.studentSkill.findMany({
      where: { studentId },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: { skill: true, status: true, accuracy: true, updatedAt: true },
    }),
    prisma.assignment.findMany({
      where: {
        studentId,
        status: { not: "archived" },
        content: { NOT: { createdBy: "auto_lesson_engine" } },
      },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: {
        id: true,
        status: true,
        updatedAt: true,
        content: {
          select: {
            contentType: true,
            topic: true,
            skillFocus: true,
          },
        },
      },
    }),
  ]);

  const sessionPlan = resolveImprovingBoostSession({
    skills: skills.map((row) => ({
      skill: row.skill,
      status: row.status,
      accuracy: row.accuracy,
      updatedAt: row.updatedAt.toISOString(),
    })),
    assignments: assignmentRows.map((row) => ({
      id: row.id,
      status: row.status,
      title: row.content.topic || row.content.skillFocus || row.content.contentType,
      subject: row.content.contentType,
      skillFocus: row.content.skillFocus,
      href: improvingSessionHref(row.content.contentType, row.id),
      updatedAt: row.updatedAt.toISOString(),
    })),
  });

  if (!sessionPlan) {
    const hasImproving = skills.some((row) => row.status === "improving");
    return NextResponse.json(
      {
        error: hasImproving
          ? "Improving skills are waiting, but no matching practice content is assigned yet."
          : "No improving skills are available yet. Complete lessons first.",
        code: hasImproving ? "NO_MATCHING_CONTENT" : "NO_IMPROVING_SKILLS",
        estimatedMinutes: IMPROVING_SESSION_MINUTES,
        policy: DEFAULT_MASTERED_REVIEW_POLICY,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    estimatedMinutes: sessionPlan.estimatedMinutes,
    questionCap: sessionPlan.questionCap,
    skill: sessionPlan.skill.skill,
    skillLabel: sessionPlan.label,
    subject: sessionPlan.assignment.subject,
    title: `20-min boost · ${sessionPlan.label}`,
    assignmentId: sessionPlan.assignment.id,
    href: sessionPlan.href,
  });
}