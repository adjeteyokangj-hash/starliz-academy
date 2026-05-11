import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { assignContentToStudent, SchoolLicenceAccessError, taskHrefForContentType } from "@/lib/assignments";
import { resolveParentScope } from "@/lib/parent_scope";
import { z } from "zod";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) return NextResponse.json({ error: "Child not found." }, { status: 404 });

  const childId = new URL(request.url).searchParams.get("childId");
  if (!childId) return NextResponse.json({ error: "childId required." }, { status: 400 });

  const child = await prisma.childProfile.findFirst({ where: { id: childId, parentId: parentScope.parentId }, select: { id: true } });
  if (!child) return NextResponse.json({ error: "Child not found." }, { status: 404 });

  const assignments = await prisma.assignment.findMany({
    where: { studentId: childId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { content: true },
  });

  return NextResponse.json({
    assignments: assignments.map((assignment) => ({
      id: assignment.id,
      status: assignment.status,
      createdAt: assignment.createdAt.toISOString(),
      contentId: assignment.contentId,
      title: assignment.content.skillFocus || assignment.content.topic || `${assignment.content.contentType} practice`,
      subject: assignment.content.contentType,
      difficulty: assignment.content.level,
      href: taskHrefForContentType(assignment.content.contentType, assignment.id),
    })),
  });
}

const postSchema = z.object({
  childId: z.string().min(1),
  contentId: z.string().min(1),
});

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const body: unknown = await request.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });

  const { childId, contentId } = parsed.data;

  // Ensure the child belongs to this parent.
  const child = await prisma.childProfile.findFirst({
    where: { id: childId, parentId: parentScope.parentId },
    select: { id: true },
  });
  if (!child) return NextResponse.json({ error: "Child not found." }, { status: 404 });

  // Ensure the content exists and is published/approved.
  const content = await prisma.aIContentCache.findFirst({
    where: { id: contentId, status: { in: ["approved", "published"] } },
    select: { id: true, contentType: true },
  });
  if (!content) return NextResponse.json({ error: "Content not found or not yet approved." }, { status: 404 });

  try {
    const assignment = await assignContentToStudent({
      studentId: childId,
      contentId,
      actorUserId: parentScope.parentId,
      reason: "Assigned by parent via parent dashboard.",
    });

    return NextResponse.json({ ok: true, assignmentId: assignment.id });
  } catch (error) {
    if (error instanceof SchoolLicenceAccessError) {
      return NextResponse.json(
        {
          error: "School licence blocked this assignment.",
          licence: {
            reason: error.reason,
            schoolId: error.schoolId,
            schoolName: error.schoolName,
          },
        },
        { status: 402 },
      );
    }
    throw error;
  }
}
