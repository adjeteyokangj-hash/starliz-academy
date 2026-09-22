import type { DaytimeStagePackExtras } from "@/lib/schools/daytime-lesson-ui";

export const STRUCTURAL_SHORT_LEARNING_BLOCK_TYPES = [
  "welcome",
  "break",
  "tutor_support",
  "progress_report",
] as const;

export type StructuralShortLearningBlockType = (typeof STRUCTURAL_SHORT_LEARNING_BLOCK_TYPES)[number];

export type ShortLearningSessionBlockLike = {
  id: string;
  order: number;
  contentId: string | null;
  status: string;
  blockType: string;
};

export type ShortLearningTeachingMoment = {
  learningObjective: string | null;
  priorLearning: string | null;
  explanation: string | null;
  workedExamples: Array<{ question: string; steps: string[]; answer: string }>;
  misconceptions: string[];
  reflectionCheck: string | null;
  hasTeaching: boolean;
};

export function isStructuralShortLearningBlockType(blockType: string): boolean {
  return (STRUCTURAL_SHORT_LEARNING_BLOCK_TYPES as readonly string[]).includes(blockType);
}

export function isPlayableShortLearningClassroomBlock(block: ShortLearningSessionBlockLike): boolean {
  if (block.status === "failed" || block.status === "completed" || block.status === "skipped") return false;
  return Boolean(block.contentId) || isStructuralShortLearningBlockType(block.blockType);
}

export function shortLearningSessionHasStartableBlock(blocks: ShortLearningSessionBlockLike[]): boolean {
  return blocks.some(isPlayableShortLearningClassroomBlock);
}

export function pickNextShortLearningBlock(input: {
  blocks: ShortLearningSessionBlockLike[];
  preferredOrder: number;
  completedContentId?: string | null;
  completedBlockId?: string | null;
}): ShortLearningSessionBlockLike | null {
  const completedIds = new Set(
    input.blocks
      .filter((block) => {
        if (block.status === "completed" || block.status === "skipped") return true;
        if (input.completedBlockId && block.id === input.completedBlockId) return true;
        if (input.completedContentId && block.contentId === input.completedContentId) return true;
        return false;
      })
      .map((block) => block.id),
  );

  const remaining = input.blocks.filter((block) => !completedIds.has(block.id) && block.status !== "failed");
  return remaining.find((block) => block.order >= input.preferredOrder) ?? remaining[0] ?? null;
}

export function shortLearningStageHref(bookingId: string, blockId: string): string {
  return `/student/short-learning/${encodeURIComponent(bookingId)}/stage/${encodeURIComponent(blockId)}`;
}

export function shortLearningLessonHref(input: {
  bookingId: string;
  sessionId: string;
  blockId: string;
  assignmentId: string;
  contentId: string;
}): string {
  return `/games/lesson?assignmentId=${encodeURIComponent(input.assignmentId)}&contentId=${encodeURIComponent(input.contentId)}&shortLearningBookingId=${encodeURIComponent(input.bookingId)}&shortLearningSessionId=${encodeURIComponent(input.sessionId)}&shortLearningBlockId=${encodeURIComponent(input.blockId)}`;
}

export function buildShortLearningTeachingMoment(
  extras: DaytimeStagePackExtras | null | undefined,
  fallback?: { skillFocus?: string | null; title?: string | null; subject?: string | null },
): ShortLearningTeachingMoment {
  const workedExamples = (extras?.workedExamples ?? []).filter((example) => example.question.trim());
  const explanation = extras?.explanation?.trim()
    || extras?.ruleExplanation?.trim()
    || extras?.scenarioOrObservation?.trim()
    || null;
  const learningObjective = extras?.learningObjective?.trim()
    || fallback?.skillFocus?.trim()
    || fallback?.title?.trim()
    || null;
  const priorLearning = extras?.priorLearningWarmup?.trim() || null;
  const misconceptions = extras?.misconceptions ?? [];
  const reflectionCheck = extras?.reflectionCheck?.trim() || null;
  const hasTeaching = Boolean(
    explanation
    || workedExamples.length
    || priorLearning
    || extras?.learningObjective?.trim()
    || extras?.ruleExplanation?.trim(),
  );

  return {
    learningObjective,
    priorLearning,
    explanation: explanation ?? (hasTeaching
      ? null
      : `We're going to practise ${fallback?.subject?.trim() || "this lesson"} together. Watch the method, then try the questions.`),
    workedExamples,
    misconceptions,
    reflectionCheck,
    hasTeaching,
  };
}
