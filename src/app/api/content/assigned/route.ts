import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function parseMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const contentId = params.get("contentId");
  const assignmentId = params.get("assignmentId");
  if (!contentId && !assignmentId) {
    return NextResponse.json({ error: "contentId or assignmentId is required." }, { status: 400 });
  }

  const resolvedContentId = contentId ?? "";
  const assignment = assignmentId
    ? await prisma.assignment.findFirst({
        where: {
          id: assignmentId,
          ...(contentId ? { contentId } : {}),
          student: { parentId: parentScope.parentId },
        },
        include: {
          student: { select: { id: true } },
          content: true,
        },
      })
    : await prisma.assignment.findFirst({
        where: {
          contentId: resolvedContentId,
          student: { parentId: parentScope.parentId },
        },
        orderBy: { createdAt: "desc" },
        include: {
          student: { select: { id: true } },
          content: true,
        },
      });

  if (!assignment) {
    return NextResponse.json({ error: "Assigned content not found." }, { status: 404 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(assignment.content.contentJson);
  } catch {
    return NextResponse.json({ error: "Assigned content payload is invalid." }, { status: 500 });
  }

  const items = toArray(parsed);
  const metadata = parseMetadata(assignment.content.metadataJson);
  return NextResponse.json({
    assignment: {
      id: assignment.id,
      status: assignment.status,
      studentId: assignment.student.id,
      contentId: assignment.contentId,
      subject: assignment.content.contentType,
      difficulty: assignment.content.level,
      topic: assignment.content.topic,
      createdAt: assignment.createdAt.toISOString(),
    },
    content: {
      id: assignment.content.id,
      contentType: assignment.content.contentType,
      level: assignment.content.level,
      topic: assignment.content.topic,
      skillFocus: assignment.content.skillFocus,
      yearGroup: assignment.content.yearGroup,
      keyStage: assignment.content.keyStage,
      metadata,
      items,
    },
  });
}
