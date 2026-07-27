/**
 * Short Learning journey authoring — Admin generate → review → publish.
 * Uses the Daytime OpenAI stage engine (same as Day School). No second generator.
 */

import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { hasPassedBlackBoxGate } from "@/lib/ai/content-black-box-gate";
import {
  canApprovePlayableLesson,
  parsePlayableLessonContent,
} from "@/lib/schools/parse-playable-lesson-content";
import { analyzeContentSessionSlots } from "@/lib/session-slot-validation";
import { analyzeSessionSlotDuplicates } from "@/lib/session-slot-duplicates";
import { itemCountForMinutes } from "@/lib/schools/daytime-session-plan";
import { generateDaytimeStageWithOpenAi } from "@/lib/schools/daytime-ai-stage-generator";
import { classifyDaytimeSubjectMode } from "@/lib/schools/daytime-subject-mode";
import {
  isPlayableSubjectContentTypeCompatible,
  resolvePlayableLessonType,
} from "@/lib/schools/playable-lesson-type";
import {
  SHORT_LEARNING_ADMIN_DURATIONS,
  buildShortLearningSessionPlan,
  isShortLearningAdminDuration,
  type ShortLearningBlockBlueprint,
  type ShortLearningDaytimeStage,
} from "@/lib/schools/short-learning-session-plan";

export const SHORT_LEARNING_JOURNEY_STATUSES = [
  "draft",
  "generating",
  "awaiting_review",
  "changes_requested",
  "approved",
  "published",
  "failed",
  "archived",
  "legacy_generated",
] as const;

export type ShortLearningJourneyStatus = (typeof SHORT_LEARNING_JOURNEY_STATUSES)[number];

export const SHORT_LEARNING_BLOCK_REVIEW_STATUSES = [
  "pending",
  "awaiting_review",
  "approved",
  "changes_requested",
  "failed",
  "structural",
] as const;

function yearGroupToLevel(yearGroup: string): number {
  const m = /(\d{1,2})/.exec(yearGroup);
  if (!m) return 3;
  return Math.min(5, Math.max(1, Number(m[1])));
}

function keyStageForYearGroup(yearGroup: string): string {
  const m = /(\d{1,2})/.exec(yearGroup);
  const y = m ? Number(m[1]) : 4;
  if (y <= 2) return "KS1";
  if (y <= 6) return "KS2";
  if (y <= 9) return "KS3";
  return "KS4";
}

function parseMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function audit(
  action: string,
  actorUserId: string | undefined,
  entityId: string,
  metadata: Record<string, unknown>,
) {
  await writeAuditLog({
    actorUserId: actorUserId ?? "system",
    action,
    entityType: "short_learning_journey",
    entityId,
    metadata,
  });
}

async function createBlockContent(input: {
  journeyId: string;
  schoolId: string;
  subject: string;
  skillFocus: string;
  yearGroup: string;
  difficulty: number;
  topic: string;
  block: ShortLearningBlockBlueprint;
  actorUserId?: string;
  generateStage?: typeof generateDaytimeStageWithOpenAi;
}): Promise<{ contentId: string; openAiSucceeded: boolean; model: string | null } | null> {
  if (!input.block.requiresContent || !input.block.daytimeStage) return null;

  const generateStage = input.generateStage ?? generateDaytimeStageWithOpenAi;
  const mode = classifyDaytimeSubjectMode(input.subject, input.skillFocus);
  const playable = resolvePlayableLessonType({
    subject: input.subject,
    skillFocus: input.skillFocus,
    lessonKind: input.block.learningObjectiveLabel,
  });
  const stage = input.block.daytimeStage as ShortLearningDaytimeStage;
  const targetMinutes = Math.max(5, input.block.estimatedMinutes);
  const targetItems = itemCountForMinutes(targetMinutes);
  const lessonTitle = `${input.subject}: ${input.block.title}${input.topic ? ` · ${input.topic}` : ""}`;

  const generated = await generateStage({
    mode,
    stage,
    stageLabel: input.block.title,
    lessonTitle,
    subject: input.subject,
    skillFocus: input.skillFocus,
    yearGroup: input.yearGroup,
    keyStage: keyStageForYearGroup(input.yearGroup),
    difficulty: input.difficulty,
    targetMinutes,
    targetItems,
    regenerateReason: null,
    instructionalDepthProfile: "short-learning",
  });

  const content = await prisma.aIContentCache.create({
    data: {
      contentType: playable.playableContentType,
      level: input.difficulty,
      topic: lessonTitle.slice(0, 180),
      contentJson: generated.contentJson,
      // Generated ≠ approved ≠ published
      status: "generated",
      createdBy: input.actorUserId ?? "short-learning-journey",
      model: generated.model,
      keyStage: keyStageForYearGroup(input.yearGroup),
      yearGroup: input.yearGroup,
      skillFocus: input.skillFocus.slice(0, 120),
      metadataJson: JSON.stringify({
        source: "short_learning_journey",
        role: "short_learning_block",
        journeyId: input.journeyId,
        schoolId: input.schoolId,
        blockType: input.block.blockType,
        blockOrder: input.block.order,
        daytimeStage: stage,
        learningObjective: input.block.learningObjectiveLabel,
        openAiSucceeded: generated.openAiSucceeded,
        provider: "openai",
        generationSource: "daytime_stage_engine",
        keyStage: keyStageForYearGroup(input.yearGroup),
        yearGroup: input.yearGroup,
        difficulty: input.difficulty,
        subject: playable.metadataSubject,
        schoolSubject: playable.schoolSubject,
        curriculumSubject: playable.curriculumSubject,
        playableContentType: playable.playableContentType,
        daytimeSession: {
          stage,
          stageIndex: input.block.order,
          estimatedMinutes: targetMinutes,
          role: "short_learning_block",
          label: input.block.title,
        },
      }),
    },
    select: { id: true },
  });

  return {
    contentId: content.id,
    openAiSucceeded: generated.openAiSucceeded,
    model: generated.model ?? null,
  };
}

export type GenerateShortLearningJourneyInput = {
  schoolId: string;
  subject: string;
  yearGroup: string;
  difficulty?: number;
  topic?: string;
  skillFocus?: string;
  durationMinutes: number;
  actorUserId: string;
  generateStage?: typeof generateDaytimeStageWithOpenAi;
};

export async function generateShortLearningJourney(input: GenerateShortLearningJourneyInput) {
  if (!isShortLearningAdminDuration(input.durationMinutes)) {
    throw new Error(`Duration must be one of ${SHORT_LEARNING_ADMIN_DURATIONS.join(" or ")} minutes. 105 is not available.`);
  }
  const difficulty = input.difficulty ?? yearGroupToLevel(input.yearGroup);
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
    throw new Error("Difficulty must be between 1 and 5.");
  }

  const school = await prisma.school.findUnique({
    where: { id: input.schoolId },
    select: { id: true },
  });
  if (!school) throw new Error("School not found.");

  const skillFocus = (input.skillFocus?.trim() || input.topic?.trim() || input.subject).slice(0, 120);
  const topic = (input.topic?.trim() || skillFocus).slice(0, 180);
  const plan = buildShortLearningSessionPlan(input.durationMinutes);

  const journey = await prisma.shortLearningJourney.create({
    data: {
      schoolId: input.schoolId,
      subject: input.subject.trim(),
      yearGroup: input.yearGroup.trim(),
      durationMinutes: input.durationMinutes,
      topic,
      skillFocus,
      status: "generating",
      createdBy: input.actorUserId,
      metadataJson: JSON.stringify({
        generativeBlockCount: plan.generativeBlockCount,
        planDuration: plan.durationMinutes,
        difficulty,
      }),
    },
  });

  await audit("short_learning_content_generation_started", input.actorUserId, journey.id, {
    schoolId: input.schoolId,
    subject: input.subject,
    yearGroup: input.yearGroup,
    difficulty,
    durationMinutes: input.durationMinutes,
  });

  let anyFailure = false;
  const models: string[] = [];

  try {
    for (const block of plan.blocks) {
      const structural = !block.requiresContent;
      let contentId: string | null = null;
      let reviewStatus = structural ? "structural" : "awaiting_review";
      let openAiSucceeded = true;

      if (block.requiresContent) {
        try {
          const generated = await createBlockContent({
            journeyId: journey.id,
            schoolId: input.schoolId,
            subject: input.subject,
            skillFocus,
            yearGroup: input.yearGroup,
            difficulty,
            topic,
            block,
            actorUserId: input.actorUserId,
            generateStage: input.generateStage,
          });
          contentId = generated?.contentId ?? null;
          openAiSucceeded = Boolean(generated?.openAiSucceeded);
          if (generated?.model) models.push(generated.model);
          if (!contentId || !openAiSucceeded) {
            anyFailure = true;
            reviewStatus = "failed";
          }
        } catch {
          anyFailure = true;
          reviewStatus = "failed";
        }
      }

      await prisma.shortLearningJourneyBlock.create({
        data: {
          journeyId: journey.id,
          order: block.order,
          title: block.title,
          blockType: block.blockType,
          estimatedMinutes: block.estimatedMinutes,
          daytimeStage: block.daytimeStage,
          contentId,
          learningObjective: block.learningObjectiveLabel,
          reviewStatus,
          metadataJson: JSON.stringify({
            openAiSucceeded,
            requiresContent: block.requiresContent,
          }),
        },
      });
    }

    const status: ShortLearningJourneyStatus = anyFailure ? "failed" : "awaiting_review";
    const updated = await prisma.shortLearningJourney.update({
      where: { id: journey.id },
      data: {
        status,
        metadataJson: JSON.stringify({
          generativeBlockCount: plan.generativeBlockCount,
          planDuration: plan.durationMinutes,
          provider: "openai",
          models: [...new Set(models)],
          difficulty,
          generationSource: "daytime_stage_engine",
          anyFailure,
        }),
      },
      include: { blocks: { orderBy: { order: "asc" } } },
    });

    await audit(
      anyFailure ? "short_learning_content_generation_failed" : "short_learning_content_generated",
      input.actorUserId,
      journey.id,
      {
        schoolId: input.schoolId,
        subject: input.subject,
        yearGroup: input.yearGroup,
        durationMinutes: input.durationMinutes,
        status,
      },
    );

    return updated;
  } catch (err) {
    await prisma.shortLearningJourney.update({
      where: { id: journey.id },
      data: { status: "failed" },
    });
    await audit("short_learning_content_generation_failed", input.actorUserId, journey.id, {
      schoolId: input.schoolId,
      reason: err instanceof Error ? err.message : "unknown",
    });
    throw err;
  }
}

export async function findPublishedShortLearningJourney(input: {
  schoolId: string;
  subject: string;
  yearGroup: string;
  durationMinutes: number;
}) {
  return prisma.shortLearningJourney.findFirst({
    where: {
      schoolId: input.schoolId,
      subject: input.subject,
      yearGroup: input.yearGroup,
      durationMinutes: input.durationMinutes,
      status: "published",
    },
    include: { blocks: { orderBy: { order: "asc" } } },
    orderBy: [{ publishedAt: "desc" }, { version: "desc" }],
  });
}

export async function publishShortLearningJourney(input: {
  journeyId: string;
  schoolId: string;
  actorUserId: string;
}) {
  const journey = await prisma.shortLearningJourney.findFirst({
    where: { id: input.journeyId, schoolId: input.schoolId },
    include: { blocks: { orderBy: { order: "asc" } } },
  });
  if (!journey) throw new Error("Journey not found.");
  if (!isShortLearningAdminDuration(journey.durationMinutes)) {
    throw new Error("Journey duration is not publishable (90 or 120 only).");
  }

  const academic = journey.blocks.filter((b) => b.daytimeStage);
  const failures: string[] = [];

  if (academic.length === 0) failures.push("No academic blocks.");
  for (const block of academic) {
    if (!block.contentId) failures.push(`Block ${block.order} missing content.`);
    if (block.reviewStatus !== "approved") failures.push(`Block ${block.order} not approved (${block.reviewStatus}).`);
    if (block.contentId) {
      const content = await prisma.aIContentCache.findUnique({
        where: { id: block.contentId },
        select: {
          id: true,
          status: true,
          contentType: true,
          contentJson: true,
          metadataJson: true,
          yearGroup: true,
        },
      });
      if (!content) {
        failures.push(`Block ${block.order} content missing.`);
        continue;
      }
      if (!["approved", "published"].includes(content.status)) {
        failures.push(`Block ${block.order} content is not Admin-approved (${content.status}).`);
      }
      const lessonParse = parsePlayableLessonContent(content.contentJson, {
        contentType: content.contentType,
        subject: journey.subject,
        topic: journey.topic,
      });
      if (!canApprovePlayableLesson(lessonParse)) {
        failures.push(
          `Block ${block.order} lesson body is not reviewable (${
            !lessonParse.ok
              ? lessonParse.error
              : lessonParse.approvalDenialReasons[0] ?? "incomplete"
          }).`,
        );
      }
      if (!hasPassedBlackBoxGate(content.metadataJson)) {
        failures.push(`Block ${block.order} has not passed Black Box and Admin verification.`);
      }
      const slotValidation = analyzeContentSessionSlots({
        contentJson: content.contentJson,
        contentType: content.contentType,
        metadataJson: content.metadataJson,
      });
      if (!slotValidation.isSessionComplete) {
        failures.push(`Block ${block.order} has incomplete required content.`);
      }
      const duplicates = analyzeSessionSlotDuplicates({
        contentJson: content.contentJson,
        contentType: content.contentType,
        metadataJson: content.metadataJson,
      });
      if (duplicates.hasExactDuplicates) {
        failures.push(`Block ${block.order} contains exact duplicate questions.`);
      }
      const meta = parseMetadata(content.metadataJson);
      const subject =
        (typeof meta.subject === "string" && meta.subject) ||
        (typeof meta.schoolSubject === "string" && meta.schoolSubject) ||
        journey.subject;
      if (!isPlayableSubjectContentTypeCompatible(subject, content.contentType)) {
        failures.push(`Block ${block.order} subject/type incompatible.`);
      }
      if (content.yearGroup && content.yearGroup !== journey.yearGroup) {
        failures.push(`Block ${block.order} year group mismatch.`);
      }
    }
  }

  const plannedMinutes = journey.blocks.reduce((sum, b) => sum + b.estimatedMinutes, 0);
  if (Math.abs(plannedMinutes - journey.durationMinutes) > 5) {
    failures.push(`Duration sum ${plannedMinutes} does not fit ${journey.durationMinutes}.`);
  }

  if (failures.length > 0) {
    await audit("short_learning_content_publish_rejected", input.actorUserId, journey.id, {
      schoolId: input.schoolId,
      failures: failures.slice(0, 20),
    });
    return { ok: false as const, failures, journey };
  }

  const contentIds = academic.map((b) => b.contentId!).filter(Boolean);
  await prisma.aIContentCache.updateMany({
    where: { id: { in: contentIds } },
    data: {
      status: "published",
      publishedAt: new Date(),
      approvedAt: new Date(),
      reviewedAt: new Date(),
    },
  });

  const published = await prisma.shortLearningJourney.update({
    where: { id: journey.id },
    data: {
      status: "published",
      publishedBy: input.actorUserId,
      publishedAt: new Date(),
      version: { increment: 1 },
    },
    include: { blocks: { orderBy: { order: "asc" } } },
  });

  await audit("short_learning_content_published", input.actorUserId, journey.id, {
    schoolId: input.schoolId,
    subject: journey.subject,
    yearGroup: journey.yearGroup,
    durationMinutes: journey.durationMinutes,
    version: published.version,
    publishedBy: input.actorUserId,
  });

  return { ok: true as const, failures: [], journey: published };
}

export async function approveShortLearningJourneyBlock(input: {
  journeyId: string;
  blockId: string;
  schoolId: string;
  actorUserId: string;
}) {
  const journey = await prisma.shortLearningJourney.findFirst({
    where: { id: input.journeyId, schoolId: input.schoolId },
    select: { id: true, status: true },
  });
  if (!journey) throw new Error("Journey not found.");
  if (journey.status === "published") {
    throw new Error("Published journeys cannot be approved in place. Unpublish or create a new version.");
  }

  const block = await prisma.shortLearningJourneyBlock.findFirst({
    where: { id: input.blockId, journeyId: input.journeyId },
  });
  if (!block) throw new Error("Block not found.");
  if (block.reviewStatus === "structural") {
    return block;
  }
  if (!block.contentId) throw new Error("Block has no content to approve.");

  const content = await prisma.aIContentCache.findUnique({
    where: { id: block.contentId },
    select: { status: true, metadataJson: true, contentJson: true, contentType: true, topic: true, skillFocus: true },
  });
  if (!content) throw new Error("Block content not found.");

  const journeySubject = await prisma.shortLearningJourney.findUnique({
    where: { id: input.journeyId },
    select: { subject: true, topic: true },
  });
  const parsed = parsePlayableLessonContent(content.contentJson, {
    contentType: content.contentType,
    subject: journeySubject?.subject,
    skillFocus: content.skillFocus ?? journeySubject?.topic,
    topic: content.topic,
  });
  if (!canApprovePlayableLesson(parsed)) {
    const reason = !parsed.ok
      ? parsed.error
      : parsed.approvalDenialReasons[0] ?? "Lesson body is incomplete for approval.";
    throw new Error(reason);
  }

  if (content.status !== "approved" && content.status !== "published") {
    throw new Error("Approve and verify this content in the Content Library first.");
  }
  if (!hasPassedBlackBoxGate(content.metadataJson)) {
    throw new Error("Black Box and Admin verification must pass before block approval.");
  }

  const updated = await prisma.shortLearningJourneyBlock.update({
    where: { id: block.id },
    data: { reviewStatus: "approved" },
  });

  const remaining = await prisma.shortLearningJourneyBlock.count({
    where: {
      journeyId: input.journeyId,
      daytimeStage: { not: null },
      reviewStatus: { not: "approved" },
    },
  });
  if (remaining === 0) {
    await prisma.shortLearningJourney.update({
      where: { id: input.journeyId },
      data: { status: "approved" },
    });
    await audit("short_learning_content_approved", input.actorUserId, input.journeyId, {
      schoolId: input.schoolId,
      blockId: block.id,
    });
  }

  return updated;
}

export async function regenerateShortLearningJourneyBlock(input: {
  journeyId: string;
  blockId: string;
  schoolId: string;
  actorUserId: string;
  generateStage?: typeof generateDaytimeStageWithOpenAi;
}) {
  const journey = await prisma.shortLearningJourney.findFirst({
    where: { id: input.journeyId, schoolId: input.schoolId },
  });
  if (!journey) throw new Error("Journey not found.");
  if (journey.status === "published") {
    throw new Error("Unpublish before regenerating a published journey block.");
  }

  const block = await prisma.shortLearningJourneyBlock.findFirst({
    where: { id: input.blockId, journeyId: input.journeyId },
  });
  if (!block) throw new Error("Block not found.");
  if (!block.daytimeStage) throw new Error("Structural blocks cannot be regenerated.");

  const blueprint: ShortLearningBlockBlueprint = {
    order: block.order,
    blockType: block.blockType as ShortLearningBlockBlueprint["blockType"],
    title: block.title,
    estimatedMinutes: block.estimatedMinutes,
    daytimeStage: block.daytimeStage as ShortLearningDaytimeStage,
    learningObjectiveLabel: block.learningObjective,
    requiresContent: true,
  };
  const journeyMetadata = parseMetadata(journey.metadataJson);
  const storedDifficulty = Number(journeyMetadata.difficulty);
  const difficulty = Number.isInteger(storedDifficulty) && storedDifficulty >= 1 && storedDifficulty <= 5
    ? storedDifficulty
    : yearGroupToLevel(journey.yearGroup);

  const generated = await createBlockContent({
    journeyId: journey.id,
    schoolId: journey.schoolId,
    subject: journey.subject,
    skillFocus: journey.skillFocus || journey.topic || journey.subject,
    yearGroup: journey.yearGroup,
    difficulty,
    topic: journey.topic,
    block: blueprint,
    actorUserId: input.actorUserId,
    generateStage: input.generateStage,
  });

  if (!generated?.contentId) {
    await prisma.shortLearningJourneyBlock.update({
      where: { id: block.id },
      data: { reviewStatus: "failed" },
    });
    throw new Error("Block regeneration failed.");
  }

  const updated = await prisma.shortLearningJourneyBlock.update({
    where: { id: block.id },
    data: {
      contentId: generated.contentId,
      reviewStatus: "awaiting_review",
    },
  });

  await prisma.shortLearningJourney.update({
    where: { id: journey.id },
    data: { status: "awaiting_review" },
  });

  await audit("short_learning_content_block_regenerated", input.actorUserId, journey.id, {
    schoolId: input.schoolId,
    blockId: block.id,
    order: block.order,
  });

  return updated;
}

/**
 * Idempotent classification of existing booking-tied sessions.
 * Does not delete or auto-publish.
 */
export async function classifyLegacyShortLearningSessions(actorUserId?: string) {
  const sessions = await prisma.shortLearningSession.findMany({
    select: {
      id: true,
      status: true,
      subject: true,
      yearGroup: true,
      durationMinutes: true,
      metadataJson: true,
      booking: {
        select: {
          id: true,
          schoolId: true,
          journeyId: true,
          learningFocus: true,
        },
      },
      blocks: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          title: true,
          blockType: true,
          estimatedMinutes: true,
          daytimeStage: true,
          contentId: true,
          learningObjective: true,
          metadataJson: true,
        },
      },
    },
    take: 500,
  });

  let classified = 0;
  let journeysCreated = 0;
  let bookingsLinked = 0;
  for (const session of sessions) {
    const meta = parseMetadata(session.metadataJson);
    const classification: "legacy_generated" | "awaiting_review" | "failed" =
      session.status === "failed"
        ? "failed"
        : session.status === "awaiting_review"
          ? "awaiting_review"
          : "legacy_generated";

    if (!meta.legacyClassification) {
      await prisma.shortLearningSession.update({
        where: { id: session.id },
        data: {
          metadataJson: JSON.stringify({
            ...meta,
            legacyClassification: classification,
            legacyClassifiedAt: new Date().toISOString(),
          }),
        },
      });
      classified += 1;
    }

    // Published-journey sessions already have their canonical Admin review path.
    if (session.booking.journeyId) continue;

    const journeyId = `legacy_${session.id}`;
    const existingJourney = await prisma.shortLearningJourney.findUnique({
      where: { id: journeyId },
      select: { id: true },
    });

    if (!existingJourney) {
      await prisma.shortLearningJourney.create({
        data: {
          id: journeyId,
          schoolId: session.booking.schoolId,
          subject: session.subject,
          yearGroup: session.yearGroup,
          durationMinutes: session.durationMinutes,
          topic: session.booking.learningFocus ?? "",
          status: classification === "failed" ? "failed" : "legacy_generated",
          metadataJson: JSON.stringify({
            source: "legacy_short_learning_session",
            sourceSessionId: session.id,
            legacyClassification: classification,
            studentPlayable: false,
          }),
          blocks: {
            create: session.blocks.map((block) => ({
              id: `legacy_${block.id}`,
              order: block.order,
              title: block.title,
              blockType: block.blockType,
              estimatedMinutes: block.estimatedMinutes,
              daytimeStage: block.daytimeStage,
              contentId: block.contentId,
              learningObjective: block.learningObjective,
              reviewStatus: block.daytimeStage
                ? block.contentId
                  ? "awaiting_review"
                  : "failed"
                : "structural",
              metadataJson: JSON.stringify({
                ...parseMetadata(block.metadataJson),
                sourceSessionId: session.id,
                sourceBlockId: block.id,
              }),
            })),
          },
        },
      });
      journeysCreated += 1;
    }

    await prisma.studentLearningBooking.update({
      where: { id: session.booking.id },
      data: { journeyId },
    });
    bookingsLinked += 1;
  }

  if (actorUserId) {
    await writeAuditLog({
      actorUserId,
      action: "short_learning_legacy_classified",
      entityType: "short_learning_session",
      metadata: { classified, journeysCreated, bookingsLinked },
    });
  }

  return { scanned: sessions.length, classified, journeysCreated, bookingsLinked };
}
