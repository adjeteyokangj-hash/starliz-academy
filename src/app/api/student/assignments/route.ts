import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { taskHrefForContentType } from "@/lib/assignments";
import { mergeWeakAreas, parseWeakAreaMetadata } from "@/lib/weakAreas";
import { normalizeExamBoard } from "@/lib/curriculum";

function parseItems(contentJson: string): unknown[] {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    return Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? [parsed] : [];
  } catch {
    return [];
  }
}

function parseContentMetadata(raw: string | null): { examBoard: string | null } {
  if (!raw) return { examBoard: null };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      examBoard: normalizeExamBoard(typeof parsed.examBoard === "string" ? parsed.examBoard : null),
    };
  } catch {
    return { examBoard: null };
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
  const assignmentId = params.get("id");
  const activeUser = await prisma.user.findUnique({ where: { id: parentScope.parentId }, select: { activeChildId: true } });
  const studentId = params.get("studentId") ?? activeUser?.activeChildId;
  if (!studentId) {
    return NextResponse.json({ error: "No active student selected." }, { status: 400 });
  }

  if (assignmentId) {
    const assignment = await prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        studentId,
        student: { parentId: parentScope.parentId },
      },
      include: { content: true },
    });

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const items = parseItems(assignment.content.contentJson);
    const contentMeta = parseContentMetadata(assignment.content.metadataJson);
    return NextResponse.json({
      id: assignment.id,
      status: assignment.status,
      subject: assignment.content.contentType,
      studentId,
      contentId: assignment.contentId,
      title: assignment.content.topic || assignment.content.skillFocus || assignment.content.contentType,
      skillFocus: assignment.content.skillFocus,
      difficulty: assignment.content.level,
      examBoard: contentMeta.examBoard,
      items,
      href: taskHrefForContentType(assignment.content.contentType, assignment.id),
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
      assignment: {
        id: assignment.id,
        status: assignment.status,
        studentId,
        contentId: assignment.contentId,
        subject: assignment.content.contentType,
        difficulty: assignment.content.level,
        examBoard: contentMeta.examBoard,
        topic: assignment.content.topic,
        createdAt: assignment.createdAt.toISOString(),
      },
      content: {
        id: assignment.content.id,
        contentType: assignment.content.contentType,
        level: assignment.content.level,
        topic: assignment.content.topic,
        skillFocus: assignment.content.skillFocus,
        examBoard: contentMeta.examBoard,
        items,
      },
    });
  }

  const weakAreas = await prisma.weakArea.findMany({
    where: { studentId, status: "active" },
    select: { subject: true, skillFocus: true, metadataJson: true },
  });
  const weakWords = weakAreas.reduce<string[]>((all, area) => mergeWeakAreas(all, parseWeakAreaMetadata(area.metadataJson).weakWords), []);
  const weakSkills = mergeWeakAreas([], weakAreas.map((area) => area.skillFocus));

  const assignments = await prisma.assignment.findMany({
    where: {
      studentId,
      student: { parentId: parentScope.parentId },
    },
    orderBy: { updatedAt: "desc" },
    include: { content: true },
  });

  return NextResponse.json({
    weakWords,
    weakSkills,
    assignments: assignments.map((assignment) => {
      const contentMeta = parseContentMetadata(assignment.content.metadataJson);
      return ({
      id: assignment.id,
      status: assignment.status,
      subject: assignment.content.contentType,
      contentId: assignment.contentId,
      title: assignment.content.topic || assignment.content.skillFocus || assignment.content.contentType,
      skillFocus: assignment.content.skillFocus,
      difficulty: assignment.content.level,
      examBoard: contentMeta.examBoard,
      items: parseItems(assignment.content.contentJson),
      href: taskHrefForContentType(assignment.content.contentType, assignment.id),
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
    });
    }),
  });
}
