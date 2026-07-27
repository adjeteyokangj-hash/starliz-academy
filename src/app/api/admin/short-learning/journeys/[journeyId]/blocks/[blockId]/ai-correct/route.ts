import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { generateDaytimeStageWithOpenAi } from "@/lib/schools/daytime-ai-stage-generator";
import { classifyDaytimeSubjectMode } from "@/lib/schools/daytime-subject-mode";
import { itemCountForMinutes } from "@/lib/schools/daytime-session-plan";
import { resolvePlayableLessonType } from "@/lib/schools/playable-lesson-type";
import type { ShortLearningDaytimeStage } from "@/lib/schools/short-learning-session-plan";

type Context = { params: Promise<{ journeyId: string; blockId: string }> };

const ACTIONS = [
  "correct_factual",
  "improve_age_suitability",
  "british_english",
  "improve_clarity",
  "vary_questions",
  "improve_worked_example",
  "improve_recap",
] as const;

const bodySchema = z.object({
  schoolId: z.string().min(1),
  action: z.enum(ACTIONS),
  confirmOverwriteManualEdits: z.boolean().optional(),
});

function keyStageForYearGroup(yearGroup: string): string {
  const m = /(\d{1,2})/.exec(yearGroup);
  const y = m ? Number(m[1]) : 4;
  if (y <= 2) return "KS1";
  if (y <= 6) return "KS2";
  if (y <= 9) return "KS3";
  return "KS4";
}

function reasonForAction(action: (typeof ACTIONS)[number]): string {
  switch (action) {
    case "correct_factual":
      return "Correct factual issues while preserving objective and age.";
    case "improve_age_suitability":
      return "Improve age suitability for the year group.";
    case "british_english":
      return "Enforce British English spelling and wording.";
    case "improve_clarity":
      return "Improve clarity of explanations and questions.";
    case "vary_questions":
      return "Vary repetitive questions without changing the learning objective.";
    case "improve_worked_example":
      return "Improve the worked example for this block.";
    case "improve_recap":
      return "Improve the recap for this block.";
    default:
      return "Improve this Short Learning block.";
  }
}

export async function POST(request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!session) return response!;
  const { journeyId, blockId } = await context.params;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const journey = await prisma.shortLearningJourney.findFirst({
    where: { id: journeyId, schoolId: body.schoolId },
  });
  if (!journey) return NextResponse.json({ error: "Journey not found." }, { status: 404 });
  if (journey.status === "published") {
    return NextResponse.json({ error: "Unpublish before AI-correcting published content." }, { status: 409 });
  }

  const block = await prisma.shortLearningJourneyBlock.findFirst({
    where: { id: blockId, journeyId },
  });
  if (!block?.daytimeStage || !block.contentId) {
    return NextResponse.json({ error: "Block is not AI-correctable." }, { status: 400 });
  }

  const existing = await prisma.aIContentCache.findUnique({ where: { id: block.contentId } });
  if (!existing) return NextResponse.json({ error: "Content not found." }, { status: 404 });

  const meta = (() => {
    try {
      return existing.metadataJson ? JSON.parse(existing.metadataJson) as Record<string, unknown> : {};
    } catch {
      return {};
    }
  })();
  if (meta.manualAdminEdit && !body.confirmOverwriteManualEdits) {
    return NextResponse.json(
      {
        error: "Block has manual Admin edits. Confirm overwrite to apply AI correction.",
        code: "CONFIRM_OVERWRITE_MANUAL_EDITS",
      },
      { status: 409 },
    );
  }

  const skillFocus = journey.skillFocus || journey.topic || journey.subject;
  const mode = classifyDaytimeSubjectMode(journey.subject, skillFocus);
  const playable = resolvePlayableLessonType({
    subject: journey.subject,
    skillFocus,
    lessonKind: block.learningObjective,
  });
  const stage = block.daytimeStage as ShortLearningDaytimeStage;
  const targetMinutes = Math.max(5, block.estimatedMinutes);

  const generated = await generateDaytimeStageWithOpenAi({
    mode,
    stage,
    stageLabel: block.title,
    lessonTitle: `${journey.subject}: ${block.title}`,
    subject: journey.subject,
    skillFocus,
    yearGroup: journey.yearGroup,
    keyStage: keyStageForYearGroup(journey.yearGroup),
    targetMinutes,
    targetItems: itemCountForMinutes(targetMinutes),
    regenerateReason: reasonForAction(body.action),
    instructionalDepthProfile: "short-learning",
  });

  await prisma.aIContentCache.update({
    where: { id: existing.id },
    data: {
      contentJson: generated.contentJson,
      contentType: playable.playableContentType,
      status: "generated",
      model: generated.model,
      reviewedAt: null,
      approvedAt: null,
      publishedAt: null,
      metadataJson: JSON.stringify({
        ...meta,
        openAiSucceeded: generated.openAiSucceeded,
        lastAiCorrection: body.action,
        lastAiCorrectionAt: new Date().toISOString(),
        manualAdminEdit: false,
        subject: playable.metadataSubject,
        schoolSubject: playable.schoolSubject,
        curriculumSubject: playable.curriculumSubject,
        playableContentType: playable.playableContentType,
      }),
    },
  });

  await prisma.shortLearningJourneyBlock.update({
    where: { id: block.id },
    data: { reviewStatus: "awaiting_review" },
  });
  await prisma.shortLearningJourney.update({
    where: { id: journey.id },
    data: { status: "awaiting_review" },
  });

  await writeAuditLog({
    actorUserId: session.userId,
    action: "short_learning_content_ai_corrected",
    entityType: "short_learning_journey",
    entityId: journeyId,
    metadata: {
      schoolId: body.schoolId,
      blockId,
      action: body.action,
      openAiSucceeded: generated.openAiSucceeded,
      model: generated.model,
    },
  });

  return NextResponse.json({
    ok: true,
    blockId,
    contentId: existing.id,
    openAiSucceeded: generated.openAiSucceeded,
  });
}
