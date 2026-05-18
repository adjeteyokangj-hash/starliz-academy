import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { getAssignmentSafetyAndRecommendation, taskHrefForContentType } from "@/lib/assignments";
import { mergeWeakAreas, parseWeakAreaMetadata } from "@/lib/weakAreas";
import { normalizeExamBoard } from "@/lib/curriculum";
import { resolveParentActiveChildId } from "@/lib/activeChild";

function parseItems(contentJson: string): unknown[] {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    return Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? [parsed] : [];
  } catch {
    return [];
  }
}

function parseContentMetadata(raw: string | null): {
  examBoard: string | null;
  yearGroup: string | null;
  keyStage: string | null;
  ageGroup: string | null;
  subject: string | null;
} {
  if (!raw) {
    return {
      examBoard: null,
      yearGroup: null,
      keyStage: null,
      ageGroup: null,
      subject: null,
    };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      examBoard: normalizeExamBoard(typeof parsed.examBoard === "string" ? parsed.examBoard : null),
      yearGroup: typeof parsed.yearGroup === "string" ? parsed.yearGroup : null,
      keyStage: typeof parsed.keyStage === "string" ? parsed.keyStage : null,
      ageGroup: typeof parsed.ageGroup === "string" ? parsed.ageGroup : null,
      subject: typeof parsed.subject === "string" ? parsed.subject : null,
    };
  } catch {
    return {
      examBoard: null,
      yearGroup: null,
      keyStage: null,
      ageGroup: null,
      subject: null,
    };
  }
}

export async function GET(request: Request) {
  try {
    const { session, response } = await requireSession();
    if (!session) return response;

    const parentScope = await resolveParentScope(session);
    if (!parentScope) {
      return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
    }

    const params = new URL(request.url).searchParams;
    const assignmentId = params.get("id");
    const requestedStudentId = params.get("studentId");
    let studentId = requestedStudentId ?? await resolveParentActiveChildId(parentScope.parentId);
    if (!studentId) {
      return NextResponse.json({ error: "No active student selected." }, { status: 400 });
    }

    if (assignmentId) {
      const assignment = await prisma.assignment.findFirst({
        where: {
          id: assignmentId,
          ...(requestedStudentId ? { studentId: requestedStudentId } : {}),
          student: { parentId: parentScope.parentId },
        },
        include: { content: true },
      });

      if (!assignment) {
        return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
      }

      if (!requestedStudentId && assignment.studentId !== studentId) {
        studentId = assignment.studentId;
        await prisma.user.update({
          where: { id: parentScope.parentId },
          data: { activeChildId: studentId },
        });
      }

      const safety = await getAssignmentSafetyAndRecommendation({
        studentId,
        contentId: assignment.contentId,
      });
      if (!safety.safe) {
        return NextResponse.json(
          {
            error: "Assignment context mismatch.",
            reason: safety.reason,
            meta: safety.meta,
          },
          { status: 409 },
        );
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
          yearGroup: assignment.content.yearGroup,
          keyStage: assignment.content.keyStage,
          ageGroup: contentMeta.ageGroup,
          metadata: {
            examBoard: contentMeta.examBoard,
            yearGroup: contentMeta.yearGroup,
            keyStage: contentMeta.keyStage,
            ageGroup: contentMeta.ageGroup,
            subject: contentMeta.subject,
          },
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
        content: {
          NOT: {
            createdBy: "auto_lesson_engine",
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        status: true,
        contentId: true,
        createdAt: true,
        updatedAt: true,
        content: {
          select: {
            id: true,
            contentType: true,
            topic: true,
            skillFocus: true,
            level: true,
            yearGroup: true,
            keyStage: true,
            metadataJson: true,
          },
        },
      },
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
        yearGroup: assignment.content.yearGroup,
        keyStage: assignment.content.keyStage,
        ageGroup: contentMeta.ageGroup,
        metadata: {
          examBoard: contentMeta.examBoard,
          yearGroup: contentMeta.yearGroup,
          keyStage: contentMeta.keyStage,
          ageGroup: contentMeta.ageGroup,
          subject: contentMeta.subject,
        },
        href: taskHrefForContentType(assignment.content.contentType, assignment.id),
        createdAt: assignment.createdAt.toISOString(),
        updatedAt: assignment.updatedAt.toISOString(),
      });
      }),
    });
  } catch (err) {
    console.error("[student/assignments]", err);
    return NextResponse.json({ error: "Unable to load assignments." }, { status: 500 });
  }
}
