/**
 * Short Learning session planner — orchestration only.
 * Content for each generative block comes from the Daytime AI stage engine.
 *
 * New sessions are 45, 60, or 70 minutes. 90, 105, and 120 remain so an
 * existing booking can still be planned and shown with its original length.
 */

import {
  SHORT_LEARNING_ALLOWED_DURATIONS,
  SHORT_LEARNING_LEGACY_DURATIONS,
} from "@/lib/schools/short-learning-constants";

/** Durations Admin may author and parents may book. */
export const SHORT_LEARNING_ADMIN_DURATIONS = SHORT_LEARNING_ALLOWED_DURATIONS;
export type ShortLearningAdminDuration = (typeof SHORT_LEARNING_ADMIN_DURATIONS)[number];

/** Planner-supported durations, including legacy lengths for existing sessions. */
export const SHORT_LEARNING_PLAN_DURATIONS = [
  ...SHORT_LEARNING_ALLOWED_DURATIONS,
  ...SHORT_LEARNING_LEGACY_DURATIONS,
] as const;
export type ShortLearningPlanDuration = (typeof SHORT_LEARNING_PLAN_DURATIONS)[number];

export type ShortLearningBlockType =
  | "welcome"
  | "lesson"
  | "recap"
  | "break"
  | "tutor_support"
  | "challenge"
  | "review"
  | "progress_report";

/** Maps onto Daytime stage generator stages when content is required. */
export type ShortLearningDaytimeStage = "warmup" | "core" | "stretch";

export type ShortLearningBlockBlueprint = {
  order: number;
  blockType: ShortLearningBlockType;
  title: string;
  estimatedMinutes: number;
  /** When set, content is requested from the Daytime AI stage generator. */
  daytimeStage: ShortLearningDaytimeStage | null;
  /** LO progression hint for the generator (LO1 → LO2 → …). */
  learningObjectiveLabel: string | null;
  requiresContent: boolean;
};

export type ShortLearningSessionPlan = {
  durationMinutes: ShortLearningPlanDuration;
  blocks: ShortLearningBlockBlueprint[];
  totalEstimatedMinutes: number;
  generativeBlockCount: number;
};

export function isShortLearningPlanDuration(value: number): value is ShortLearningPlanDuration {
  return (SHORT_LEARNING_PLAN_DURATIONS as readonly number[]).includes(value);
}

export function isShortLearningAdminDuration(value: number): value is ShortLearningAdminDuration {
  return (SHORT_LEARNING_ADMIN_DURATIONS as readonly number[]).includes(value);
}

function blueprint(
  order: number,
  blockType: ShortLearningBlockType,
  title: string,
  estimatedMinutes: number,
  daytimeStage: ShortLearningDaytimeStage | null,
  learningObjectiveLabel: string | null,
): ShortLearningBlockBlueprint {
  const requiresContent = daytimeStage !== null;
  return {
    order,
    blockType,
    title,
    estimatedMinutes,
    daytimeStage,
    learningObjectiveLabel,
    requiresContent,
  };
}

function blocksForDuration(durationMinutes: ShortLearningPlanDuration): ShortLearningBlockBlueprint[] {
  switch (durationMinutes) {
    case 45:
      // Shortest complete session: teach, guide, check, end. No extra topic and no idle break.
      return [
        blueprint(0, "welcome", "Welcome + orientation", 3, null, null),
        blueprint(1, "lesson", "Lesson · New concept", 14, "core", "LO1 · New concept"),
        blueprint(2, "lesson", "Lesson · Guided practice", 12, "core", "LO2 · Guided practice"),
        blueprint(3, "challenge", "Challenge · Independent check", 10, "stretch", "Check · Independent practice"),
        blueprint(4, "review", "Final review", 6, "stretch", "Review · Consolidate"),
        blueprint(5, "progress_report", "Progress report", 0, null, null),
      ];
    case 60:
      // Standard session: more teaching and practice than 45, still a natural close.
      return [
        blueprint(0, "welcome", "Welcome + orientation", 3, null, null),
        blueprint(1, "lesson", "Lesson · New concept", 16, "core", "LO1 · New concept"),
        blueprint(2, "recap", "Quick recap", 4, "warmup", "LO1 · Recap"),
        blueprint(3, "lesson", "Lesson · Guided practice", 16, "core", "LO2 · Guided practice"),
        blueprint(4, "challenge", "Challenge · Independent practice", 12, "stretch", "Check · Independent practice"),
        blueprint(5, "tutor_support", "AI Tutor support", 4, null, null),
        blueprint(6, "review", "Final review", 5, "stretch", "Review · Consolidate"),
        blueprint(7, "progress_report", "Progress report", 0, null, null),
      ];
    case 70:
      // The extra 10 minutes are another practice block, not a stretched pause.
      return [
        blueprint(0, "welcome", "Welcome + orientation", 3, null, null),
        blueprint(1, "lesson", "Lesson · New concept", 16, "core", "LO1 · New concept"),
        blueprint(2, "recap", "Quick recap", 4, "warmup", "LO1 · Recap"),
        blueprint(3, "lesson", "Lesson · Guided practice", 16, "core", "LO2 · Guided practice"),
        blueprint(4, "challenge", "Challenge · Independent practice", 12, "stretch", "Check · Independent practice"),
        blueprint(5, "challenge", "Challenge · Extra practice and correction", 10, "stretch", "LO3 · Extra practice"),
        blueprint(6, "tutor_support", "AI Tutor support", 4, null, null),
        blueprint(7, "review", "Final review", 5, "stretch", "Review · Consolidate"),
        blueprint(8, "progress_report", "Progress report", 0, null, null),
      ];
    case 90:
      return [
        blueprint(0, "welcome", "Welcome + orientation", 5, null, null),
        blueprint(1, "lesson", "Lesson block 1 · New concept", 18, "core", "LO1 · New concept"),
        blueprint(2, "recap", "Quick recap", 5, "warmup", "LO1 · Recap"),
        blueprint(3, "lesson", "Lesson block 2 · Guided practice", 18, "core", "LO2 · Guided practice"),
        blueprint(4, "break", "Break reminder", 5, null, null),
        blueprint(5, "lesson", "Lesson block 3 · Harder questions", 14, "core", "LO3 · Stretch practice"),
        blueprint(6, "tutor_support", "AI Tutor support", 10, null, null),
        blueprint(7, "challenge", "Challenge tasks", 10, "stretch", "Mastery · Challenge"),
        blueprint(8, "review", "Final review", 5, "stretch", "Review · Consolidate"),
        blueprint(9, "progress_report", "Progress report", 0, null, null),
      ];
    case 105:
      // Legacy planner support only — Admin authoring and new bookings reject 105.
      return [
        blueprint(0, "welcome", "Welcome + orientation", 5, null, null),
        blueprint(1, "lesson", "Lesson block 1 · New concept", 20, "core", "LO1 · New concept"),
        blueprint(2, "recap", "Quick recap", 5, "warmup", "LO1 · Recap"),
        blueprint(3, "lesson", "Lesson block 2 · Guided practice", 20, "core", "LO2 · Guided practice"),
        blueprint(4, "break", "Break reminder", 5, null, null),
        blueprint(5, "lesson", "Lesson block 3 · Harder questions", 18, "core", "LO3 · Stretch practice"),
        blueprint(6, "tutor_support", "AI Tutor support", 12, null, null),
        blueprint(7, "challenge", "Challenge tasks", 12, "stretch", "Mastery · Challenge"),
        blueprint(8, "review", "Final review", 8, "stretch", "Review · Consolidate"),
        blueprint(9, "progress_report", "Progress report", 0, null, null),
      ];
    case 120:
      return [
        blueprint(0, "welcome", "Welcome + orientation", 5, null, null),
        blueprint(1, "lesson", "Lesson block 1 · New concept", 20, "core", "LO1 · New concept"),
        blueprint(2, "recap", "Quick recap", 5, "warmup", "LO1 · Recap"),
        blueprint(3, "lesson", "Lesson block 2 · Guided practice", 20, "core", "LO2 · Guided practice"),
        blueprint(4, "break", "Break reminder", 5, null, null),
        blueprint(5, "lesson", "Lesson block 3 · Harder questions", 20, "core", "LO3 · Stretch practice"),
        blueprint(6, "tutor_support", "AI Tutor support", 15, null, null),
        blueprint(7, "challenge", "Challenge tasks", 20, "stretch", "Mastery · Challenge"),
        blueprint(8, "review", "Final review", 10, "stretch", "Review · Consolidate"),
        blueprint(9, "progress_report", "Progress report", 0, null, null),
      ];
    default: {
      const unreachable: never = durationMinutes;
      throw new Error(`Unsupported Short Learning duration: ${String(unreachable)}.`);
    }
  }
}

/**
 * Convert a booking duration into an ordered multi-block journey.
 * Does not call AI — pure orchestration.
 *
 * Non-generative (structure only): welcome, break, tutor_support, progress_report.
 * Academic blocks call the Daytime OpenAI engine.
 */
export function buildShortLearningSessionPlan(durationMinutes: number): ShortLearningSessionPlan {
  if (!isShortLearningPlanDuration(durationMinutes)) {
    throw new Error(
      `Unsupported Short Learning duration: ${durationMinutes}. Expected ${SHORT_LEARNING_PLAN_DURATIONS.join(", ")}.`,
    );
  }

  const blocks = blocksForDuration(durationMinutes);
  const totalEstimatedMinutes = blocks.reduce((sum, block) => sum + block.estimatedMinutes, 0);
  if (totalEstimatedMinutes !== durationMinutes) {
    throw new Error(
      `Short Learning ${durationMinutes}-minute plan totals ${totalEstimatedMinutes} minutes.`,
    );
  }
  let cursor = 0;
  for (const block of blocks) {
    cursor += block.estimatedMinutes;
    if (cursor > durationMinutes) {
      throw new Error(`Short Learning block "${block.title}" runs past the ${durationMinutes}-minute session.`);
    }
  }

  return {
    durationMinutes,
    blocks,
    totalEstimatedMinutes,
    generativeBlockCount: blocks.filter((b) => b.requiresContent).length,
  };
}

export function shortLearningBlockSequence(plan: ShortLearningSessionPlan): string[] {
  return plan.blocks.map((b) => `${b.order}:${b.blockType}:${b.estimatedMinutes}`);
}

/** True when every block ends at or before the booked duration and the plan fills it. */
export function shortLearningPlanStaysInsideDuration(plan: ShortLearningSessionPlan): boolean {
  let cursor = 0;
  for (const block of plan.blocks) {
    if (block.estimatedMinutes < 0) return false;
    cursor += block.estimatedMinutes;
    if (cursor > plan.durationMinutes) return false;
  }
  return cursor === plan.durationMinutes;
}

const SUBSTANTIAL_BLOCK_TYPES = new Set(["lesson", "recap", "challenge"]);

/**
 * A substantial activity starts only when the remaining session can finish it.
 * The progress report can still close the session.
 */
export function shortLearningBlockCanStart(input: {
  blockType: string;
  estimatedMinutes: number;
  remainingMinutes: number;
}): boolean {
  const remaining = input.remainingMinutes;
  if (!Number.isFinite(remaining)) return false;
  if (input.blockType === "progress_report") return true;
  const needed = Math.max(0, input.estimatedMinutes);
  if (needed === 0) return remaining >= 0;
  if (SUBSTANTIAL_BLOCK_TYPES.has(input.blockType)) return remaining >= needed;
  if (input.blockType === "review") return remaining >= Math.min(needed, 4);
  return remaining >= needed;
}
