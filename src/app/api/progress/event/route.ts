import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { readSessionFromCookie } from "@/lib/auth";
import { canUseFeature } from "@/lib/subscriptions/enforcement";

const eventSchema = z.object({
  childId: z.string().min(1),
  activityType: z.string().min(1),
  activityName: z.string().min(1),
  starsEarned: z.number().int().default(0),
  xpEarned: z.number().int().default(0),
  coinsEarned: z.number().int().default(0),
  score: z.number().min(0).max(1).default(0),
  correct: z.boolean().default(false),
  difficulty: z.number().int().min(1).max(10).default(1),
  notes: z.string().optional(),
  accuracy: z.number().int().min(0).max(100).optional(),
  completed: z.boolean().default(true),
  questionId: z.string().min(1).optional(),
  answeredCorrectly: z.boolean().optional(),
  attempts: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const access = await canUseFeature(session.userId, "learning");
    if (!access.allowed) {
      return NextResponse.json({ error: "Subscription upgrade required.", access }, { status: 402 });
    }

    const body = eventSchema.parse(await request.json());
    const child = await prisma.childProfile.findFirst({ where: { id: body.childId, parentId: session.userId } });
    if (!child) {
      return NextResponse.json({ error: "Child not found." }, { status: 404 });
    }

    await prisma.progressRecord.create({
      data: {
        childId: body.childId,
        activityType: body.activityType,
        activityName: body.activityName,
        starsEarned: body.starsEarned,
        xpEarned: body.xpEarned,
        coinsEarned: body.coinsEarned,
        score: body.score,
        correct: body.correct,
        difficulty: body.difficulty,
        notes: body.notes,
        accuracy: body.accuracy,
        completed: body.completed,
      },
    });

    if (body.questionId) {
      await prisma.questionHistory.upsert({
        where: {
          childId_questionId: {
            childId: body.childId,
            questionId: body.questionId,
          },
        },
        create: {
          childId: body.childId,
          activityType: body.activityType,
          questionId: body.questionId,
          answeredCorrectly: body.answeredCorrectly ?? false,
          attempts: body.attempts ?? 1,
        },
        update: {
          answeredCorrectly: body.answeredCorrectly ?? false,
          attempts: { increment: 1 },
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid event payload." }, { status: 400 });
  }
}
