import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { updateGaLesson } from "@/lib/ga-lessons";
import { listGaCategoryNamesForContext } from "@/lib/ga-categories";
import { prisma } from "@/lib/db";

const activitySchema = z.object({
  activityType: z.string().trim().min(1),
  title: z.string().trim().min(1),
  instructions: z.string().trim().optional().nullable(),
  sortOrder: z.number().int().optional().nullable(),
});

const quizSchema = z.object({
  questionType: z.string().trim().min(1),
  wordId: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  options: z.array(z.string().trim().min(1)).min(2),
  correctAnswer: z.string().trim().min(1),
  explanation: z.string().trim().optional().nullable(),
  sortOrder: z.number().int().optional().nullable(),
});

const lessonSchema = z.object({
  title: z.string().trim().min(1).optional(),
  slug: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  level: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  objective: z.string().trim().min(1).optional(),
  packKey: z.string().trim().optional().nullable(),
  lessonOrder: z.number().int().optional().nullable(),
  publishStatus: z.string().trim().optional().nullable(),
  wordIds: z.array(z.string()).optional(),
  activities: z.array(activitySchema).optional(),
  quizQuestions: z.array(quizSchema).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field to update." });

type Context = { params: Promise<{ lessonId: string }> };

const deleteSchema = z.object({
  mode: z.enum(["archive", "delete"]),
});

function serialize<T extends { createdAt: Date; updatedAt: Date }>(row: T): T & { createdAt: string; updatedAt: string } {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function PATCH(request: Request, context: Context) {
  const { session, response } = await requireAdmin();
  if (!session) return response;
  const { lessonId } = await context.params;
  try {
    const body = lessonSchema.parse(await request.json());
    const allowedCategories = await listGaCategoryNamesForContext("lessons", "active");
    const lesson = await updateGaLesson(lessonId, body, { allowedCategories });
    if (!lesson) return NextResponse.json({ error: "Ga lesson not found." }, { status: 404 });
    await writeAuditLog({
      actorUserId: session.userId,
      action: "ga_lesson.updated",
      entityType: "ga_lesson",
      entityId: lesson.id,
      metadata: { title: lesson.title, publishStatus: lesson.publishStatus, wordCount: lesson.words.length },
    });
    return NextResponse.json({ item: serialize(lesson) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update Ga lesson." }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: Context) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { lessonId } = await context.params;
  try {
    const body = deleteSchema.parse(await request.json().catch(() => ({ mode: "archive" })));
    const lesson = await prisma.gaLesson.findUnique({
      where: { id: lessonId },
      select: { id: true, title: true, slug: true, publishStatus: true },
    });

    if (!lesson) return NextResponse.json({ error: "Ga lesson not found." }, { status: 404 });

    if (body.mode === "archive") {
      if (lesson.publishStatus === "Archived") {
        return NextResponse.json({ ok: true, item: lesson, message: "Lesson already archived." });
      }
      const item = await prisma.gaLesson.update({
        where: { id: lessonId },
        data: { publishStatus: "Archived" },
      });
      await writeAuditLog({
        actorUserId: session.userId,
        action: "ga_lesson.archived",
        entityType: "ga_lesson",
        entityId: lessonId,
        metadata: { title: item.title, slug: item.slug },
      });
      return NextResponse.json({ ok: true, item: serialize(item), message: "Ga lesson archived." });
    }

    if (lesson.publishStatus !== "Archived") {
      return NextResponse.json({ error: "Archive this lesson first before deleting it permanently." }, { status: 400 });
    }

    const lessonSkillFocus = `ga_lesson:${lesson.id}`;
    const [assignmentCount, progressCount, recordingCount, audioCount, referenceCount] = await Promise.all([
      prisma.assignment.count({ where: { content: { skillFocus: lessonSkillFocus } } }),
      prisma.gaStudentLessonProgress.count({ where: { lessonId } }),
      prisma.gaStudentRecording.count({ where: { lessonId } }),
      prisma.gaAudioAsset.count({ where: { lessonId } }),
      prisma.gaPronunciationReference.count({ where: { linkedLessonId: lessonId } }),
    ]);

    const totalUsage = assignmentCount + progressCount + recordingCount + audioCount + referenceCount;
    if (totalUsage > 0) {
      return NextResponse.json({
        error: "Lesson cannot be deleted because it has student or assignment history.",
        usage: {
          assignmentCount,
          progressCount,
          recordingCount,
          audioCount,
          referenceCount,
        },
      }, { status: 409 });
    }

    await prisma.gaLesson.delete({ where: { id: lessonId } });
    await writeAuditLog({
      actorUserId: session.userId,
      action: "ga_lesson.deleted",
      entityType: "ga_lesson",
      entityId: lessonId,
      metadata: { title: lesson.title, slug: lesson.slug },
    });
    return NextResponse.json({ ok: true, message: "Ga lesson deleted permanently." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete Ga lesson." }, { status: 400 });
  }
}
