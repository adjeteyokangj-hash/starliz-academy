import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import {
  generateShortLearningJourney,
} from "@/lib/schools/short-learning-journey";
import {
  SHORT_LEARNING_ADMIN_DURATIONS,
  isShortLearningAdminDuration,
} from "@/lib/schools/short-learning-session-plan";

const generateSchema = z.object({
  schoolId: z.string().min(1),
  subject: z.string().trim().min(1).max(80),
  yearGroup: z.string().trim().min(1).max(40),
  difficulty: z.number().int().min(1).max(5).optional(),
  topic: z.string().trim().max(180).optional(),
  skillFocus: z.string().trim().max(120).optional(),
  durationMinutes: z.number().int(),
});

export async function GET(request: Request) {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!session) return response!;

  const url = new URL(request.url);
  const schoolId = url.searchParams.get("schoolId");
  const status = url.searchParams.get("status");

  const journeys = await prisma.shortLearningJourney.findMany({
    where: {
      ...(schoolId ? { schoolId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      school: { select: { id: true, name: true } },
      blocks: {
        select: { id: true, order: true, blockType: true, reviewStatus: true, contentId: true },
        orderBy: { order: "asc" },
      },
    },
  });

  return NextResponse.json({ ok: true, journeys });
}

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!session) return response!;

  let body: z.infer<typeof generateSchema>;
  try {
    body = generateSchema.parse(await request.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (!isShortLearningAdminDuration(body.durationMinutes)) {
    return NextResponse.json(
      {
        error: `Duration must be ${SHORT_LEARNING_ADMIN_DURATIONS.join(" or ")} minutes. 105 minutes is not available.`,
        code: "DURATION_NOT_ALLOWED",
      },
      { status: 422 },
    );
  }

  try {
    const journey = await generateShortLearningJourney({
      schoolId: body.schoolId,
      subject: body.subject,
      yearGroup: body.yearGroup,
      difficulty: body.difficulty,
      topic: body.topic,
      skillFocus: body.skillFocus,
      durationMinutes: body.durationMinutes,
      actorUserId: session.userId,
    });
    return NextResponse.json({ ok: true, journey }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed." },
      { status: 500 },
    );
  }
}
