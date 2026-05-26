import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import {
  parseQuickLevelFinderRetestEnabled,
  upsertQuickLevelFinderRetestEnabled,
} from "@/lib/quick-level-finder";
import {
  parseQuickLevelFinderSummary,
} from "@/lib/student-learning-state";

type Context = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  enabled: z.boolean(),
});

export async function GET(_request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const { id } = await context.params;
  const student = await prisma.childProfile.findUnique({
    where: { id },
    select: {
      id: true,
      archived: true,
      studentProfile: {
        select: {
          aiLearningProfileJson: true,
        },
      },
    },
  });

  if (!student || student.archived) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const profileJson = student.studentProfile?.aiLearningProfileJson ?? null;
  const summary = parseQuickLevelFinderSummary(profileJson);

  return NextResponse.json({
    ok: true,
    studentId: student.id,
    retestEnabled: parseQuickLevelFinderRetestEnabled(profileJson),
    completed: summary.completed,
    responseCount: summary.responseCount,
  });
}

export async function POST(request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid retest payload." }, { status: 400 });
  }

  const { id } = await context.params;
  const student = await prisma.childProfile.findUnique({
    where: { id },
    select: {
      id: true,
      archived: true,
      studentProfile: {
        select: {
          aiLearningProfileJson: true,
          subjectFocus: true,
          keyStageLevel: true,
        },
      },
    },
  });

  if (!student || student.archived) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const nextProfileJson = upsertQuickLevelFinderRetestEnabled(
    student.studentProfile?.aiLearningProfileJson ?? null,
    parsed.data.enabled,
  );

  await prisma.studentProfile.upsert({
    where: { childId: student.id },
    update: {
      aiLearningProfileJson: nextProfileJson,
    },
    create: {
      childId: student.id,
      aiLearningProfileJson: nextProfileJson,
      subjectFocus: student.studentProfile?.subjectFocus ?? null,
      keyStageLevel: student.studentProfile?.keyStageLevel ?? null,
    },
  });

  const summary = parseQuickLevelFinderSummary(nextProfileJson);

  return NextResponse.json({
    ok: true,
    studentId: student.id,
    retestEnabled: parsed.data.enabled,
    completed: summary.completed,
    responseCount: summary.responseCount,
  });
}
