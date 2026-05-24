import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import {
  DEFAULT_SCHOOL_WEEK_SETTINGS,
  mergeSchoolWeekSettingsIntoProfileJson,
  readSchoolWeekSettingsFromProfileJson,
  sanitizeSchoolWeekSettings,
  stripSchoolWeekSensitiveFields,
} from "@/lib/academic-intelligence/schoolWeekSettings";

const daySchema = z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);

const payloadSchema = z.object({
  enabled: z.boolean().optional(),
  activeDays: z.array(daySchema).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  lessonBlockMinutes: z.number().optional(),
  shortBreakMinutes: z.number().optional(),
  lunchMinutes: z.number().optional(),
  dailySubjectLimit: z.number().optional(),
  weeklySubjectSelection: z.array(z.string()).optional(),
  includeCatchUpTasks: z.boolean().optional(),
  includeRevisionBlocks: z.boolean().optional(),
  includeHomeworkBlock: z.boolean().optional(),
  includeQuizReviewBlock: z.boolean().optional(),
  includeWellbeingBlock: z.boolean().optional(),
  includeEndOfDaySummary: z.boolean().optional(),
  parentAdminNotes: z.string().max(300).nullable().optional(),
});

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireAdminPermission("reports:view");
  if (!session) return response!;

  const { id } = await context.params;

  const child = await prisma.childProfile.findUnique({
    where: { id },
    select: {
      id: true,
      studentProfile: {
        select: {
          aiLearningProfileJson: true,
        },
      },
    },
  });

  if (!child) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const settings = readSchoolWeekSettingsFromProfileJson(child.studentProfile?.aiLearningProfileJson ?? null);
  return NextResponse.json({
    settings,
    safeSettings: stripSchoolWeekSensitiveFields(settings),
    defaults: stripSchoolWeekSensitiveFields(DEFAULT_SCHOOL_WEEK_SETTINGS),
  });
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireAdminPermission("reports:view");
  if (!session) return response!;

  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload." }, { status: 400 });
  }

  const child = await prisma.childProfile.findUnique({
    where: { id },
    select: {
      id: true,
      studentProfile: {
        select: {
          aiLearningProfileJson: true,
        },
      },
    },
  });

  if (!child) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const existing = readSchoolWeekSettingsFromProfileJson(child.studentProfile?.aiLearningProfileJson ?? null);
  const normalized = sanitizeSchoolWeekSettings(parsed.data, existing);
  const mergedJson = mergeSchoolWeekSettingsIntoProfileJson({
    existingJson: child.studentProfile?.aiLearningProfileJson ?? null,
    settings: normalized,
  });

  await prisma.studentProfile.upsert({
    where: {
      childId: child.id,
    },
    update: {
      aiLearningProfileJson: mergedJson,
    },
    create: {
      childId: child.id,
      aiLearningProfileJson: mergedJson,
    },
  });

  return NextResponse.json({
    settings: normalized,
    safeSettings: stripSchoolWeekSensitiveFields(normalized),
  });
}
