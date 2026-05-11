import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { recalculateWeakAreaFromAttempts } from "@/lib/ai/weak-area-detector";

const seedSchema = z.object({
  mode: z.enum(["low", "high"]),
  skillFocus: z.string().default("Silent e"),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const { id } = await params;
  const attempts = await prisma.attempt.findMany({
    where: { studentId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    attempts: attempts.map((attempt) => ({
      ...attempt,
      createdAt: attempt.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Dev seed is disabled in production." }, { status: 403 });
  }

  const { id } = await params;
  try {
    const body = seedSchema.parse(await request.json());
    const student = await prisma.childProfile.findUnique({ where: { id }, select: { id: true, yearGroup: true } });
    if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

    const correctPattern = body.mode === "high" ? [true, true, true, true, false] : [false, false, false, true, false];
    await prisma.attempt.createMany({
      data: correctPattern.map((correct, index) => ({
        studentId: id,
        subject: "spelling",
        keyStage: "KS1",
        yearGroup: student.yearGroup ?? "Year 2",
        skillFocus: body.skillFocus,
        questionText: `Seed ${body.skillFocus} ${index + 1}`,
        answerGiven: correct ? "make" : "mak",
        correctAnswer: "make",
        correct,
        responseTimeMs: body.mode === "high" ? 3500 : 16000,
        hintsUsed: body.mode === "high" ? 0 : 2,
        difficulty: body.mode === "high" ? 2 : 1,
      })),
    });

    const weakArea = await recalculateWeakAreaFromAttempts({
      studentId: id,
      subject: "spelling",
      skillFocus: body.skillFocus,
      actorUserId: session.userId,
    });

    return NextResponse.json({ ok: true, message: `${body.mode} ${body.skillFocus} attempts seeded.`, weakArea });
  } catch {
    return NextResponse.json({ error: "Invalid seed request." }, { status: 400 });
  }
}
