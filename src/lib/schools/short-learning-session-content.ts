import { prisma } from "@/lib/db";
import { assignContentToStudent } from "@/lib/assignments";
import { itemCountForMinutes } from "@/lib/schools/daytime-session-plan";
import { minMathQuestionsForMinutes } from "@/lib/schools/math-practice-fill";
import {
  generateDaytimeStageWithOpenAi,
  generateGuidedReadingSharedPassage,
} from "@/lib/schools/daytime-ai-stage-generator";
import { logDaytimeGenerationTelemetry } from "@/lib/schools/daytime-generation-telemetry";
import { classifyDaytimeSubjectMode } from "@/lib/schools/daytime-subject-mode";
import { shortLearningMinQuestionCount } from "@/lib/schools/short-learning-instructional-depth";
import {
  isPlayableSubjectContentTypeCompatible,
  isRecognisedPlayableContentType,
  resolvePlayableLessonType,
} from "@/lib/schools/playable-lesson-type";
import {
  buildShortLearningSessionPlan,
  isShortLearningPlanDuration,
  type ShortLearningBlockBlueprint,
  type ShortLearningDaytimeStage,
} from "@/lib/schools/short-learning-session-plan";
import {
  resolveStudentYearContext,
  toShortLearningYearGuidance,
  type ShortLearningYearGuidance,
} from "@/lib/schools/student-year-context";
import {
  canonicalShortLearningSubjectKey,
  defaultShortLearningSkillFocus,
  resolveShortLearningSkillFocus,
} from "@/lib/schools/short-learning-curriculum";
import { remixContentQuestionsForStudent } from "@/lib/schools/short-learning-question-rotation";
import {
  pickNextShortLearningBlock,
  shortLearningLessonHref,
  shortLearningSessionHasStartableBlock,
  shortLearningStageHref,
} from "@/lib/schools/short-learning-classroom";

export { defaultShortLearningSkillFocus };

export type EnsureShortLearningSessionOptions = {
  bookingId: string;
  /** Force regenerate even when a ready session already exists. */
  forceRegenerate?: boolean;
  /** Optional injectable generator for tests. */
  generateStage?: typeof generateDaytimeStageWithOpenAi;
};

/** Live booking sessions can start without Admin publication once a content block exists. */
export function canStudentStartShortLearningSession(status: string): boolean {
  return status === "generating" || status === "ready" || status === "awaiting_review";
}

type PlayabilityIssue = {
  blockId?: string;
  order?: number;
  code: string;
  message: string;
};

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

async function resolveYearGroup(schoolStudentId: string): Promise<ShortLearningYearGuidance> {
  const membership = await prisma.schoolStudent.findUnique({
    where: { id: schoolStudentId },
    select: {
      child: { select: { yearGroup: true } },
      classroom: { select: { yearGroup: true, name: true, academicYear: true } },
    },
  });
  const ctx = resolveStudentYearContext({
    officialYearGroup: membership?.child.yearGroup ?? null,
    classroomYearGroup: membership?.classroom?.yearGroup ?? null,
    classroomName: membership?.classroom?.name ?? null,
    classroomAcademicYear: membership?.classroom?.academicYear ?? null,
    surface: "short-learning",
  });
  return toShortLearningYearGuidance(ctx);
}

/**
 * Repair persisted content metadata so assignment safety accepts it.
 * Preserves AIContentCache rows; only patches subject/schoolSubject/playableContentType fields.
 */
export async function repairShortLearningContentCompatibility(contentId: string): Promise<{
  repaired: boolean;
  contentType: string;
  metadataSubject: string;
  playableContentType: string;
}> {
  const content = await prisma.aIContentCache.findUnique({
    where: { id: contentId },
    select: { id: true, contentType: true, metadataJson: true, skillFocus: true },
  });
  if (!content) {
    throw new Error("Content not found for Short Learning compatibility repair.");
  }

  const meta = parseMetadata(content.metadataJson);
  const schoolSubject =
    (typeof meta.schoolSubject === "string" && meta.schoolSubject) ||
    (typeof meta.subject === "string" && meta.subject) ||
    content.contentType;
  const resolved = resolvePlayableLessonType({
    subject: schoolSubject,
    contentType: content.contentType,
    skillFocus: content.skillFocus,
    lessonKind: typeof meta.learningObjective === "string" ? meta.learningObjective : null,
  });

  const currentSubject = typeof meta.subject === "string" ? meta.subject : "";
  const alreadyOk =
    content.contentType === resolved.playableContentType &&
    isPlayableSubjectContentTypeCompatible(currentSubject || resolved.metadataSubject, content.contentType);

  if (alreadyOk && currentSubject === resolved.metadataSubject) {
    return {
      repaired: false,
      contentType: content.contentType,
      metadataSubject: currentSubject || resolved.metadataSubject,
      playableContentType: resolved.playableContentType,
    };
  }

  const nextMeta = {
    ...meta,
    subject: resolved.metadataSubject,
    schoolSubject: resolved.schoolSubject,
    curriculumSubject: resolved.curriculumSubject,
    playableContentType: resolved.playableContentType,
  };

  await prisma.aIContentCache.update({
    where: { id: content.id },
    data: {
      contentType: resolved.playableContentType,
      metadataJson: JSON.stringify(nextMeta),
    },
  });

  return {
    repaired: true,
    contentType: resolved.playableContentType,
    metadataSubject: resolved.metadataSubject,
    playableContentType: resolved.playableContentType,
  };
}

async function validateAndRepairSessionPlayability(input: {
  sessionId: string;
  bookingSubject: string;
  bookingYearGroup: string;
}): Promise<{ ok: boolean; issues: PlayabilityIssue[]; repairedContentIds: string[] }> {
  const blocks = await prisma.shortLearningBlock.findMany({
    where: { sessionId: input.sessionId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      order: true,
      blockType: true,
      contentId: true,
      status: true,
      daytimeStage: true,
    },
  });

  const issues: PlayabilityIssue[] = [];
  const repairedContentIds: string[] = [];

  for (const block of blocks) {
    // Generative blocks are those with a Daytime stage (welcome/lesson/recap/challenge/review).
    // break / tutor_support / progress_report have daytimeStage = null.
    const generative = Boolean(block.daytimeStage);

    if (!generative) {
      if (block.contentId) {
        issues.push({
          blockId: block.id,
          order: block.order,
          code: "non_generative_has_content",
          message: `Non-generative block ${block.blockType} unexpectedly has content.`,
        });
      }
      continue;
    }

    if (!block.contentId) {
      issues.push({
        blockId: block.id,
        order: block.order,
        code: "missing_content",
        message: `Generative block ${block.blockType} has no content reference.`,
      });
      continue;
    }

    const content = await prisma.aIContentCache.findUnique({
      where: { id: block.contentId },
      select: {
        id: true,
        contentType: true,
        metadataJson: true,
        yearGroup: true,
        status: true,
      },
    });

    if (!content) {
      issues.push({
        blockId: block.id,
        order: block.order,
        code: "content_missing",
        message: "Content reference is missing from the library.",
      });
      continue;
    }

    if (!isRecognisedPlayableContentType(content.contentType)) {
      issues.push({
        blockId: block.id,
        order: block.order,
        code: "unrecognised_content_type",
        message: `Unrecognised playable content type.`,
      });
      continue;
    }

    const meta = parseMetadata(content.metadataJson);
    const metaSubject = typeof meta.subject === "string" ? meta.subject : "";
    if (!isPlayableSubjectContentTypeCompatible(metaSubject || input.bookingSubject, content.contentType)) {
      try {
        const repair = await repairShortLearningContentCompatibility(content.id);
        if (repair.repaired) repairedContentIds.push(content.id);
        if (!isPlayableSubjectContentTypeCompatible(repair.metadataSubject, repair.contentType)) {
          issues.push({
            blockId: block.id,
            order: block.order,
            code: "subject_type_mismatch",
            message: "Content subject and playable type are incompatible.",
          });
        }
      } catch {
        issues.push({
          blockId: block.id,
          order: block.order,
          code: "subject_type_mismatch",
          message: "Content subject and playable type are incompatible.",
        });
      }
    }

    const contentYear = (content.yearGroup ?? "").trim().toLowerCase();
    const bookingYear = input.bookingYearGroup.trim().toLowerCase();
    if (contentYear && bookingYear && contentYear !== bookingYear) {
      // Soft warning only — year labels can vary in formatting; do not fail hard when both present but differ slightly.
      const contentYearNum = /(\d{1,2})/.exec(contentYear)?.[1];
      const bookingYearNum = /(\d{1,2})/.exec(bookingYear)?.[1];
      if (contentYearNum && bookingYearNum && contentYearNum !== bookingYearNum) {
        issues.push({
          blockId: block.id,
          order: block.order,
          code: "year_group_mismatch",
          message: "Content year group does not match the booking.",
        });
      }
    }

    // Booking subject must resolve to a recognised curriculum family compatible with content.
    if (
      !isPlayableSubjectContentTypeCompatible(input.bookingSubject, content.contentType) &&
      !isPlayableSubjectContentTypeCompatible(metaSubject, content.contentType)
    ) {
      issues.push({
        blockId: block.id,
        order: block.order,
        code: "booking_subject_mismatch",
        message: "Content does not match the booking subject.",
      });
    }
  }

  return { ok: issues.length === 0, issues, repairedContentIds };
}

async function createContentForBlock(input: {
  bookingId: string;
  subject: string;
  skillFocus: string;
  yearGroup: string;
  block: ShortLearningBlockBlueprint;
  generateStage: typeof generateDaytimeStageWithOpenAi;
  sharedPassage?: {
    title: string;
    text: string;
    paragraphs: string[];
    wordCount: number;
  } | null;
  sharedVocabulary?: Array<{ word: string; childFriendlyMeaning: string; example?: string }> | null;
}): Promise<{ contentId: string; openAiSucceeded: boolean; playableContentType: string } | null> {
  if (!input.block.requiresContent || !input.block.daytimeStage) return null;

  const mode = classifyDaytimeSubjectMode(input.subject, input.skillFocus);
  const playable = resolvePlayableLessonType({
    subject: input.subject,
    skillFocus: input.skillFocus,
    lessonKind: input.block.learningObjectiveLabel,
  });
  const stage = input.block.daytimeStage as ShortLearningDaytimeStage;
  const targetMinutes = Math.max(5, input.block.estimatedMinutes);
  const mathsSubject = canonicalShortLearningSubjectKey(input.subject) === "maths";
  const targetItems = mathsSubject
    ? minMathQuestionsForMinutes(targetMinutes, input.block.title)
    : Math.max(
        itemCountForMinutes(targetMinutes),
        shortLearningMinQuestionCount(input.block.title, targetMinutes),
      );
  const lessonTitle = `${input.subject}: ${input.block.title}`;

  const generated = await input.generateStage({
    mode,
    stage,
    stageLabel: input.block.title,
    lessonTitle,
    subject: input.subject,
    skillFocus: input.skillFocus,
    yearGroup: input.yearGroup,
    keyStage: keyStageForYearGroup(input.yearGroup),
    difficulty: yearGroupToLevel(input.yearGroup),
    targetMinutes,
    targetItems,
    sharedPassage: input.sharedPassage,
    sharedVocabulary: input.sharedVocabulary,
    regenerateReason: null,
    instructionalDepthProfile: "short-learning",
  });

  const content = await prisma.aIContentCache.create({
    data: {
      contentType: playable.playableContentType,
      level: yearGroupToLevel(input.yearGroup),
      topic: lessonTitle.slice(0, 180),
      contentJson: generated.contentJson,
      // Live booking content is student-playable immediately. Admin publication remains
      // for reusable journeys, not for entering this booked class.
      status: "generated",
      createdBy: "short-learning-session-planner",
      model: generated.model,
      keyStage: keyStageForYearGroup(input.yearGroup),
      yearGroup: input.yearGroup,
      skillFocus: input.skillFocus.slice(0, 120),
      metadataJson: JSON.stringify({
        source: "short_learning_session",
        role: "short_learning_block",
        bookingId: input.bookingId,
        blockType: input.block.blockType,
        blockOrder: input.block.order,
        daytimeStage: stage,
        learningObjective: input.block.learningObjectiveLabel,
        openAiSucceeded: generated.openAiSucceeded,
        validationIssues: generated.validationIssues,
        lifecycle: "awaiting_review",
        // Playable subject aligns with contentType for assignment safety.
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
    playableContentType: playable.playableContentType,
  };
}

/**
 * Build (or reuse) a Short Learning session plan and Daytime-engine content packs
 * for a booking. Idempotent unless forceRegenerate is set.
 */
export async function ensureShortLearningSessionContent(
  options: EnsureShortLearningSessionOptions,
) {
  const totalStarted = Date.now();
  const generateStage = options.generateStage ?? generateDaytimeStageWithOpenAi;
  const booking = await prisma.studentLearningBooking.findUnique({
    where: { id: options.bookingId },
    select: {
      id: true,
      schoolId: true,
      subject: true,
      learningFocus: true,
      durationMinutes: true,
      schoolStudentId: true,
      schoolStudent: { select: { childId: true } },
      status: true,
      journeyId: true,
      shortLearningSession: {
        include: { blocks: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!booking) {
    throw new Error("Short Learning booking not found.");
  }
  if (["cancelled", "late_cancelled", "expired", "no_show"].includes(booking.status)) {
    throw new Error("Cannot generate content for a closed Short Learning booking.");
  }
  if (!isShortLearningPlanDuration(booking.durationMinutes)) {
    throw new Error(`Booking duration ${booking.durationMinutes} is not a supported session plan length.`);
  }

  let existing = booking.shortLearningSession;
  const yearGuidance = await resolveYearGroup(booking.schoolStudentId);
  const yearGroup = yearGuidance.yearGroup;
  const summerYearMeta = {
    officialYearGroup: yearGuidance.officialYearGroup,
    incomingYearGroup: yearGuidance.incomingYearGroup,
    isSummerTransition: yearGuidance.isSummerTransition,
    yearMode: yearGuidance.mode,
    teachingIntent: yearGuidance.teachingIntent,
  };

  // Prefer an Admin-published journey (school + subject + year + duration).
  if (!options.forceRegenerate) {
    const { findPublishedShortLearningJourney } = await import("@/lib/schools/short-learning-journey");
    const published =
      booking.journeyId
        ? await prisma.shortLearningJourney.findFirst({
            where: { id: booking.journeyId, schoolId: booking.schoolId, status: "published" },
            include: { blocks: { orderBy: { order: "asc" } } },
          })
        : await findPublishedShortLearningJourney({
            schoolId: booking.schoolId,
            subject: booking.subject,
            yearGroup,
            durationMinutes: booking.durationMinutes,
          });

    if (published) {
      if (!booking.journeyId || booking.journeyId !== published.id) {
        await prisma.studentLearningBooking.update({
          where: { id: booking.id },
          data: { journeyId: published.id },
        });
      }

      const session =
        existing
          ? await prisma.shortLearningSession.update({
              where: { id: existing.id },
              data: {
                subject: booking.subject,
                yearGroup,
                durationMinutes: booking.durationMinutes,
                status: "ready",
                generatedAt: existing.generatedAt ?? new Date(),
                metadataJson: JSON.stringify({
                  source: "published_journey",
                  journeyId: published.id,
                  studentPlayable: true,
                  ...summerYearMeta,
                }),
              },
            })
          : await prisma.shortLearningSession.create({
              data: {
                bookingId: booking.id,
                subject: booking.subject,
                yearGroup,
                durationMinutes: booking.durationMinutes,
                status: "ready",
                generatedAt: new Date(),
                metadataJson: JSON.stringify({
                  source: "published_journey",
                  journeyId: published.id,
                  studentPlayable: true,
                  ...summerYearMeta,
                }),
              },
            });

      if (existing) {
        await prisma.shortLearningBlock.deleteMany({ where: { sessionId: session.id } });
      }

      for (const block of published.blocks) {
        let contentId = block.contentId;
        if (contentId && booking.schoolStudent.childId) {
          const remixed = await remixContentQuestionsForStudent({
            contentId,
            studentId: booking.schoolStudent.childId,
            schoolId: booking.schoolId,
            subject: booking.subject,
            yearGroup,
            bookingId: booking.id,
            skillFocus: booking.learningFocus,
            estimatedMinutes: block.estimatedMinutes,
          });
          contentId = remixed.contentId;
        }
        await prisma.shortLearningBlock.create({
          data: {
            sessionId: session.id,
            order: block.order,
            title: block.title,
            blockType: block.blockType,
            estimatedMinutes: block.estimatedMinutes,
            daytimeStage: block.daytimeStage,
            contentId,
            learningObjective: block.learningObjective,
            status: contentId ? "ready" : "skipped",
          },
        });
      }

      const withBlocks = await prisma.shortLearningSession.findUnique({
        where: { id: session.id },
        include: { blocks: { orderBy: { order: "asc" } } },
      });

      logDaytimeGenerationTelemetry({
        event: "short_learning_session_content",
        durationMinutes: booking.durationMinutes,
        subject: booking.subject,
        yearGroup,
        reused: true,
        regenerated: false,
        success: true,
        plannerDurationMs: 0,
        generationDurationMs: 0,
        totalDurationMs: Date.now() - totalStarted,
        generativeBlockCount: published.blocks.filter((b) => Boolean(b.contentId)).length,
      });

      return {
        reused: true as const,
        regenerated: false as const,
        session: withBlocks ?? session,
        fromPublishedJourney: true as const,
      };
    }
  }

  // Booking pre-build (and concurrent ensure calls) may already be generating.
  // Wait for that in-flight pass so forceRegenerate cannot race on (sessionId, order).
  if (existing?.status === "generating") {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const fresh = await prisma.shortLearningSession.findUnique({
        where: { id: existing.id },
        include: { blocks: { orderBy: { order: "asc" } } },
      });
      if (!fresh || fresh.status !== "generating") {
        existing = fresh;
        break;
      }
    }
    if (existing?.status === "generating" && !options.forceRegenerate) {
      return {
        reused: true as const,
        regenerated: false as const,
        session: existing,
      };
    }
    if (existing?.status === "generating" && options.forceRegenerate) {
      // Still stuck generating — refuse concurrent force rather than duplicate orders.
      return {
        reused: true as const,
        regenerated: false as const,
        session: existing,
      };
    }
  }

  if (
    existing
    && !options.forceRegenerate
    && (existing.status === "awaiting_review" || existing.status === "ready")
  ) {
    const playability = await validateAndRepairSessionPlayability({
      sessionId: existing.id,
      bookingSubject: booking.subject,
      bookingYearGroup: yearGroup,
    });
    if (playability.ok) {
      const session = await prisma.shortLearningSession.findUnique({
        where: { id: existing.id },
        include: { blocks: { orderBy: { order: "asc" } } },
      });
      logDaytimeGenerationTelemetry({
        event: "short_learning_session_content",
        durationMinutes: booking.durationMinutes,
        subject: booking.subject,
        yearGroup,
        reused: true,
        regenerated: false,
        success: true,
        plannerDurationMs: 0,
        generationDurationMs: 0,
        totalDurationMs: Date.now() - totalStarted,
        generativeBlockCount: existing.blocks.filter((b) => Boolean(b.contentId)).length,
      });
      return {
        reused: true as const,
        regenerated: false as const,
        session: session ?? existing,
        repairedContentIds: playability.repairedContentIds,
        fromPublishedJourney: parseMetadata(existing.metadataJson).source === "published_journey",
      };
    }
    if (existing.status === "ready") {
      // Ready but not playable after repair attempts — mark failed, do not show false ready.
      const failed = await prisma.shortLearningSession.update({
        where: { id: existing.id },
        data: {
          status: "failed",
          metadataJson: JSON.stringify({
            playabilityFailed: true,
            issues: playability.issues.map((i) => ({ code: i.code, order: i.order })),
            safeReason: "Session content is not ready to play. Please regenerate.",
          }),
        },
        include: { blocks: { orderBy: { order: "asc" } } },
      });
      return {
        reused: true as const,
        regenerated: false as const,
        session: failed,
        repairedContentIds: playability.repairedContentIds,
        fromPublishedJourney: false as const,
      };
    }
    return {
      reused: true as const,
      regenerated: false as const,
      session: existing,
      repairedContentIds: playability.repairedContentIds,
      fromPublishedJourney: false as const,
    };
  }

  const skillFocus = resolveShortLearningSkillFocus({
    learningFocus: booking.learningFocus,
    subject: booking.subject,
    yearGroup,
  });
  const plannerStarted = Date.now();
  const plan = buildShortLearningSessionPlan(booking.durationMinutes);
  const plannerDurationMs = Date.now() - plannerStarted;
  const generationStarted = Date.now();
  const readingMode = classifyDaytimeSubjectMode(booking.subject, skillFocus) === "guided-reading";
  let sharedPassage: {
    title: string;
    text: string;
    paragraphs: string[];
    wordCount: number;
  } | null = null;
  let sharedVocabulary: Array<{ word: string; childFriendlyMeaning: string; example?: string }> | null = null;
  if (readingMode) {
    const shared = await generateGuidedReadingSharedPassage({
      lessonTitle: `${booking.subject}: Short Learning`,
      skillFocus,
      yearGroup,
      keyStage: keyStageForYearGroup(yearGroup),
    });
    if (shared.openAiSucceeded && shared.passage.wordCount >= 40) {
      sharedPassage = shared.passage;
      sharedVocabulary = shared.vocabulary;
    }
  }

  const session =
    existing
      ? await prisma.shortLearningSession.update({
          where: { id: existing.id },
          data: {
            subject: booking.subject,
            yearGroup,
            durationMinutes: booking.durationMinutes,
            status: "generating",
            regeneratedAt: options.forceRegenerate ? new Date() : existing.regeneratedAt,
            metadataJson: JSON.stringify({
              planDuration: plan.durationMinutes,
              generativeBlockCount: plan.generativeBlockCount,
              forceRegenerate: Boolean(options.forceRegenerate),
              ...summerYearMeta,
            }),
          },
        })
      : await prisma.shortLearningSession.create({
          data: {
            bookingId: booking.id,
            subject: booking.subject,
            yearGroup,
            durationMinutes: booking.durationMinutes,
            status: "generating",
            metadataJson: JSON.stringify({
              planDuration: plan.durationMinutes,
              generativeBlockCount: plan.generativeBlockCount,
              ...summerYearMeta,
            }),
          },
        });

  if (existing) {
    await prisma.shortLearningBlock.deleteMany({ where: { sessionId: session.id } });
  }

  const createdBlocks = [];
  let anyOpenAiFailure = false;
  const playableTypes: string[] = [];

  for (const block of plan.blocks) {
    let contentId: string | null = null;
    let blockStatus = "ready";

    if (block.requiresContent) {
      try {
        const generated = await createContentForBlock({
          bookingId: booking.id,
          subject: booking.subject,
          skillFocus,
          yearGroup,
          block,
          generateStage,
          sharedPassage,
          sharedVocabulary,
        });
        if (generated?.openAiSucceeded && generated.contentId) {
          contentId = generated.contentId;
          if (booking.schoolStudent.childId) {
            const remixed = await remixContentQuestionsForStudent({
              contentId,
              studentId: booking.schoolStudent.childId,
              schoolId: booking.schoolId,
              subject: booking.subject,
              yearGroup,
              bookingId: booking.id,
              skillFocus,
              estimatedMinutes: block.estimatedMinutes,
            });
            contentId = remixed.contentId;
          }
          if (generated.playableContentType) playableTypes.push(generated.playableContentType);
        } else {
          blockStatus = "failed";
          anyOpenAiFailure = true;
        }
        if (!contentId) {
          blockStatus = "failed";
          anyOpenAiFailure = true;
        }
      } catch {
        blockStatus = "failed";
        anyOpenAiFailure = true;
      }
    }

    const row = await prisma.shortLearningBlock.upsert({
      where: {
        sessionId_order: { sessionId: session.id, order: block.order },
      },
      create: {
        sessionId: session.id,
        order: block.order,
        title: block.title,
        blockType: block.blockType,
        estimatedMinutes: block.estimatedMinutes,
        daytimeStage: block.daytimeStage,
        contentId,
        learningObjective: block.learningObjectiveLabel,
        status: blockStatus,
      },
      update: {
        title: block.title,
        blockType: block.blockType,
        estimatedMinutes: block.estimatedMinutes,
        daytimeStage: block.daytimeStage,
        contentId,
        learningObjective: block.learningObjectiveLabel,
        status: blockStatus,
      },
    });
    createdBlocks.push(row);
  }

  const playability = await validateAndRepairSessionPlayability({
    sessionId: session.id,
    bookingSubject: booking.subject,
    bookingYearGroup: yearGroup,
  });

  const generativeReady =
    createdBlocks.filter((b) => {
      const blueprint = plan.blocks.find((p) => p.order === b.order);
      if (!blueprint?.requiresContent) return true;
      return Boolean(b.contentId) && b.status === "ready";
    }).length === createdBlocks.length;

  const generatedOk = generativeReady && playability.ok && !anyOpenAiFailure;
  const sessionStatus = generatedOk ? "ready" : "failed";

  const generationDurationMs = Date.now() - generationStarted;
  const updated = await prisma.shortLearningSession.update({
    where: { id: session.id },
    data: {
      status: sessionStatus,
      generatedAt: new Date(),
      currentBlockOrder: 0,
      metadataJson: JSON.stringify({
        planDuration: plan.durationMinutes,
        generativeBlockCount: plan.generativeBlockCount,
        forceRegenerate: Boolean(options.forceRegenerate),
        anyOpenAiFailure,
        playableTypes,
        playabilityOk: playability.ok,
        playabilityIssues: playability.issues.map((i) => ({ code: i.code, order: i.order })),
        plannerDurationMs,
        generationDurationMs,
        totalDurationMs: Date.now() - totalStarted,
        lifecycle: sessionStatus,
        studentPlayable: generatedOk,
        safeReason: generatedOk
          ? "Session content is ready. Students can enter the class without waiting for Admin publication."
          : "Session content could not be prepared for learning. Please try again or ask a parent to regenerate.",
        ...summerYearMeta,
      }),
    },
    include: { blocks: { orderBy: { order: "asc" } } },
  });

  logDaytimeGenerationTelemetry({
    event: "short_learning_session_content",
    durationMinutes: booking.durationMinutes,
    subject: booking.subject,
    yearGroup,
    reused: false,
    regenerated: Boolean(options.forceRegenerate && existing),
    success: generatedOk,
    plannerDurationMs,
    generationDurationMs,
    totalDurationMs: Date.now() - totalStarted,
    generativeBlockCount: plan.generativeBlockCount,
  });

  return {
    reused: false as const,
    regenerated: Boolean(options.forceRegenerate && existing),
    session: updated,
    repairedContentIds: playability.repairedContentIds,
    fromPublishedJourney: false as const,
  };
}

/**
 * Assign the next playable content block for a student and return navigation targets.
 */
export async function startShortLearningContentBlock(input: {
  bookingId: string;
  childId: string;
  actorUserId?: string;
  blockOrder?: number;
  completedContentId?: string | null;
  completedBlockId?: string | null;
}) {
  const existing = await prisma.shortLearningSession.findUnique({
    where: { bookingId: input.bookingId },
    include: { blocks: { orderBy: { order: "asc" as const } } },
  });
  const session = existing && shortLearningSessionHasStartableBlock(existing.blocks)
    ? existing
    : (await ensureShortLearningSessionContent({ bookingId: input.bookingId })).session;
  if (!shortLearningSessionHasStartableBlock(session.blocks)) {
    throw new Error("This Short Learning session is not ready yet. Please try again shortly.");
  }

  if (input.completedContentId) {
    await prisma.shortLearningBlock.updateMany({
      where: { sessionId: session.id, contentId: input.completedContentId },
      data: { status: "completed" },
    });
  }
  if (input.completedBlockId) {
    await prisma.shortLearningBlock.updateMany({
      where: { sessionId: session.id, id: input.completedBlockId },
      data: { status: "completed" },
    });
  }

  const blocks = await prisma.shortLearningBlock.findMany({
    where: { sessionId: session.id },
    orderBy: { order: "asc" },
  });

  let playable = typeof input.blockOrder === "number" && !input.completedBlockId && !input.completedContentId
    ? blocks.find((block) =>
      block.order === input.blockOrder
      && block.status !== "failed"
      && block.status !== "completed"
      && block.status !== "skipped",
    ) ?? null
    : null;

  if (!playable) {
    const completedAnchor = blocks.find((block) =>
      block.id === input.completedBlockId || block.contentId === input.completedContentId,
    );
    const preferredOrder = typeof input.blockOrder === "number"
      ? input.blockOrder
      : completedAnchor
        ? completedAnchor.order + 1
        : session.currentBlockOrder ?? 0;
    playable = pickNextShortLearningBlock({
      blocks,
      preferredOrder,
      completedContentId: input.completedContentId,
      completedBlockId: input.completedBlockId,
    });
  }

  if (!playable) {
    return {
      sessionId: session.id,
      done: true as const,
      kind: "done" as const,
      href: `/student/short-learning/${encodeURIComponent(input.bookingId)}`,
      assignmentId: null as string | null,
      contentId: null as string | null,
      lessonHref: `/student/short-learning/${encodeURIComponent(input.bookingId)}`,
    };
  }

  await prisma.shortLearningSession.update({
    where: { id: session.id },
    data: { currentBlockOrder: playable.order },
  });

  if (!playable.contentId) {
    const stageHref = shortLearningStageHref(input.bookingId, playable.id);
    return {
      sessionId: session.id,
      done: false as const,
      kind: "stage" as const,
      href: stageHref,
      block: playable,
      assignmentId: null as string | null,
      contentId: null as string | null,
      lessonHref: stageHref,
    };
  }

  await repairShortLearningContentCompatibility(playable.contentId).catch(() => undefined);

  const assignment = await assignContentToStudent({
    studentId: input.childId,
    contentId: playable.contentId,
    actorUserId: input.actorUserId,
    reason: "short_learning_session_block",
    forceResend: true,
    adminOverride: true,
    overrideReason: "Short Learning live session block",
  });

  const resolved = resolvePlayableLessonType({
    subject: session.subject,
    contentType: undefined,
  });
  const lessonHref = shortLearningLessonHref({
    bookingId: input.bookingId,
    sessionId: session.id,
    blockId: playable.id,
    assignmentId: assignment.id,
    contentId: playable.contentId,
  });

  return {
    sessionId: session.id,
    done: false as const,
    kind: "lesson" as const,
    href: lessonHref,
    block: playable,
    assignmentId: assignment.id,
    contentId: playable.contentId,
    playableContentType: resolved.playableContentType,
    lessonHref,
  };
}

export async function getShortLearningSessionSummary(bookingId: string) {
  return prisma.shortLearningSession.findUnique({
    where: { bookingId },
    include: {
      blocks: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          title: true,
          blockType: true,
          estimatedMinutes: true,
          contentId: true,
          learningObjective: true,
          status: true,
        },
      },
    },
  });
}
