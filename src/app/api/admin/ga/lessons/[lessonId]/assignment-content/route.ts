import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { prisma } from "@/lib/db";

type Context = { params: Promise<{ lessonId: string }> };

function buildLessonAssignmentMetadata(input: { lessonId: string; lessonSlug: string; lessonTitle: string }) {
  return JSON.stringify({
    subject: "ga",
    curriculumPathway: "languages",
    topic: input.lessonTitle,
    skillFocus: "ga_lesson",
    gaLessonId: input.lessonId,
    gaLessonSlug: input.lessonSlug,
    gaLessonTitle: input.lessonTitle,
    assignmentSource: "admin_ga_lesson",
  });
}

function buildLessonAssignmentContentJson(input: { lessonId: string; lessonSlug: string; lessonTitle: string }) {
  return JSON.stringify([
    {
      type: "ga_lesson",
      lessonId: input.lessonId,
      lessonSlug: input.lessonSlug,
      title: input.lessonTitle,
      href: `/ga-learning-hub/${encodeURIComponent(input.lessonSlug)}`,
    },
  ]);
}

export async function POST(_request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const { lessonId } = await context.params;
  const lesson = await prisma.gaLesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      title: true,
      slug: true,
      publishStatus: true,
    },
  });

  if (!lesson) {
    return NextResponse.json({ error: "Ga lesson not found." }, { status: 404 });
  }

  if (lesson.publishStatus !== "Published") {
    return NextResponse.json(
      { error: "Only Published Ga lessons can be assigned." },
      { status: 400 },
    );
  }

  const skillFocusKey = `ga_lesson:${lesson.id}`;
  const contentJson = buildLessonAssignmentContentJson({
    lessonId: lesson.id,
    lessonSlug: lesson.slug,
    lessonTitle: lesson.title,
  });
  const metadataJson = buildLessonAssignmentMetadata({
    lessonId: lesson.id,
    lessonSlug: lesson.slug,
    lessonTitle: lesson.title,
  });

  const existing = await prisma.aIContentCache.findFirst({
    where: {
      contentType: "ga",
      skillFocus: skillFocusKey,
    },
    select: { id: true },
  });

  const item = existing
    ? await prisma.aIContentCache.update({
      where: { id: existing.id },
      data: {
        level: 1,
        topic: lesson.title,
        contentJson,
        status: "reviewed",
        reviewedAt: new Date(),
        skillFocus: skillFocusKey,
        metadataJson,
      },
      select: { id: true },
    })
    : await prisma.aIContentCache.create({
      data: {
        contentType: "ga",
        level: 1,
        topic: lesson.title,
        contentJson,
        status: "reviewed",
        reviewedAt: new Date(),
        createdBy: `ga_lesson:${session.userId}`,
        skillFocus: skillFocusKey,
        metadataJson,
      },
      select: { id: true },
    });

  return NextResponse.json({
    contentId: item.id,
    previewHref: `/ga-learning-hub/${encodeURIComponent(lesson.slug)}`,
  });
}
