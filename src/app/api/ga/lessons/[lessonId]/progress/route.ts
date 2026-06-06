import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { recordGaLessonProgress } from "@/lib/ga-lessons";

const progressSchema = z.object({
  studentId: z.string().trim().optional().nullable(),
  correctAnswers: z.number().int().min(0),
  totalQuestions: z.number().int().min(0),
  completed: z.boolean().optional(),
});

type Context = { params: Promise<{ lessonId: string }> };

export async function POST(request: Request, context: Context) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const parentScope = await resolveParentScope(session);
  if (!parentScope) return NextResponse.json({ error: "Parent account not found." }, { status: 404 });

  const { lessonId } = await context.params;
  try {
    const body = progressSchema.parse(await request.json());
    const studentId = body.studentId ?? await resolveParentActiveChildId(parentScope.parentId);
    if (!studentId) return NextResponse.json({ error: "No active student selected." }, { status: 400 });
    const child = await prisma.childProfile.findFirst({ where: { id: studentId, parentId: parentScope.parentId, archived: false }, select: { id: true } });
    if (!child) return NextResponse.json({ error: "Student not found." }, { status: 404 });

    const progress = await recordGaLessonProgress({
      studentId,
      lessonId,
      correctAnswers: body.correctAnswers,
      totalQuestions: body.totalQuestions,
      completed: body.completed,
    });
    return NextResponse.json({
      item: {
        ...progress,
        createdAt: progress.createdAt.toISOString(),
        updatedAt: progress.updatedAt.toISOString(),
        completedAt: progress.completedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to record Ga lesson progress." }, { status: 400 });
  }
}
