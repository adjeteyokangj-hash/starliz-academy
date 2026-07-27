/**
 * Short Learning session planner — orchestration only.
 * Content for each generative block comes from the Daytime AI stage engine.
 */

/** Durations Admin may author and parents may book. 105 is legacy-only / rejected for new Admin flows. */
export const SHORT_LEARNING_ADMIN_DURATIONS = [90, 120] as const;
export type ShortLearningAdminDuration = (typeof SHORT_LEARNING_ADMIN_DURATIONS)[number];

/** All planner-supported durations including legacy 105 for existing sessions. */
export const SHORT_LEARNING_PLAN_DURATIONS = [90, 105, 120] as const;
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

/**
 * Convert a booking duration into an ordered multi-block journey.
 * Does not call AI — pure orchestration.
 *
 * Non-generative (structure only): welcome, break, tutor_support, progress_report.
 * Academic blocks call the Daytime OpenAI engine.
 */
export function buildShortLearningSessionPlan(durationMinutes: number): ShortLearningSessionPlan {
  if (!isShortLearningPlanDuration(durationMinutes)) {
    throw new Error(`Unsupported Short Learning duration: ${durationMinutes}. Expected 90, 105, or 120.`);
  }

  let blocks: ShortLearningBlockBlueprint[];

  if (durationMinutes === 90) {
    blocks = [
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
  } else if (durationMinutes === 105) {
    // Legacy planner support only — Admin authoring and new bookings reject 105.
    blocks = [
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
  } else {
    // 120 — premium guided journey
    blocks = [
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
  }

  const totalEstimatedMinutes = blocks.reduce((sum, block) => sum + block.estimatedMinutes, 0);
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
