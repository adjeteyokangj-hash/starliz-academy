/**
 * StarLiz Study Plan
 *
 * Defines the canonical nine-stage study plan used for every assigned lesson.
 * Each lesson progresses through these stages in order. The current stage is
 * derived from the assignment status and question progress.
 */

export type StudyPlanStageKey =
  | "warmup"
  | "teach"
  | "guided_practice"
  | "independent"
  | "retry_support"
  | "explanation"
  | "review"
  | "mastery_check"
  | "next_step";

export type StudyPlanStage = {
  key: StudyPlanStageKey;
  label: string;
  shortLabel: string;
  description: string;
  /** Ordinal position in the plan (1-based). */
  position: number;
};

export const STUDY_PLAN_STAGES: StudyPlanStage[] = [
  {
    key: "warmup",
    label: "Warm-up",
    shortLabel: "Warm-up",
    description: "A quick orientation question or review prompt to activate prior knowledge.",
    position: 1,
  },
  {
    key: "teach",
    label: "Teach",
    shortLabel: "Teach",
    description: "The learning objective and key information are introduced to the student.",
    position: 2,
  },
  {
    key: "guided_practice",
    label: "Guided Practice",
    shortLabel: "Practice",
    description: "First attempt with full scaffold visible — learning focus, key info, and hint shown.",
    position: 3,
  },
  {
    key: "independent",
    label: "Independent Question",
    shortLabel: "Independent",
    description: "Student works independently without hints visible initially.",
    position: 4,
  },
  {
    key: "retry_support",
    label: "Retry Support",
    shortLabel: "Retry",
    description: "Hints revealed progressively after wrong answers (up to 3 attempts).",
    position: 5,
  },
  {
    key: "explanation",
    label: "Explanation",
    shortLabel: "Explain",
    description: "Worked explanation shown after each question is resolved, correct or not.",
    position: 6,
  },
  {
    key: "review",
    label: "Review",
    shortLabel: "Review",
    description: "Weak questions cycled back for a second pass.",
    position: 7,
  },
  {
    key: "mastery_check",
    label: "Mastery Check",
    shortLabel: "Mastery",
    description: "Final set of questions completed without hints — proves independent understanding.",
    position: 8,
  },
  {
    key: "next_step",
    label: "Next Step",
    shortLabel: "Next",
    description: "Diagnostic pointer to the next skill or topic to practise.",
    position: 9,
  },
];

/** Total number of stages in the study plan. */
export const STUDY_PLAN_TOTAL_STAGES = STUDY_PLAN_STAGES.length;

export type StudyPlanProgress = {
  /** Current stage key. */
  currentStage: StudyPlanStageKey;
  /** Human-readable label for the current stage. */
  currentStageLabel: string;
  /** Ordinal position of the current stage (1-based). */
  currentPosition: number;
  /** Total stages in the plan. */
  totalStages: number;
  /** Progress percentage (0–100). */
  progressPercent: number;
  /** True when the lesson is fully complete. */
  complete: boolean;
};

type AssignmentStatusInput = {
  status: string;
  /** 0–100 progress value from session snapshot, if available. */
  sessionProgress?: number;
  /** True if the lesson is currently in the review round. */
  inReviewRound?: boolean;
  /** True if the lesson mastery check is complete. */
  masteryComplete?: boolean;
  /** Number of questions answered so far. */
  questionsAnswered?: number;
  /** Total number of questions in the lesson. */
  totalQuestions?: number;
};

/**
 * Derive the current study plan stage from assignment state.
 * This is a lightweight inference function — it does not require the full lesson snapshot.
 */
export function deriveStudyPlanProgress(input: AssignmentStatusInput): StudyPlanProgress {
  const {
    status,
    sessionProgress = 0,
    inReviewRound = false,
    masteryComplete = false,
    questionsAnswered = 0,
    totalQuestions = 0,
  } = input;

  let stageKey: StudyPlanStageKey;

  if (status === "completed" || masteryComplete) {
    stageKey = "next_step";
  } else if (inReviewRound) {
    stageKey = "review";
  } else if (status === "assigned" && questionsAnswered === 0) {
    stageKey = "warmup";
  } else if (status === "in_progress") {
    const ratio = totalQuestions > 0 ? questionsAnswered / totalQuestions : sessionProgress / 100;
    if (ratio < 0.15) {
      stageKey = "teach";
    } else if (ratio < 0.35) {
      stageKey = "guided_practice";
    } else if (ratio < 0.6) {
      stageKey = "independent";
    } else if (ratio < 0.75) {
      stageKey = "retry_support";
    } else if (ratio < 0.9) {
      stageKey = "explanation";
    } else {
      stageKey = "mastery_check";
    }
  } else {
    stageKey = "warmup";
  }

  const stage = STUDY_PLAN_STAGES.find((s) => s.key === stageKey) ?? STUDY_PLAN_STAGES[0];
  const complete = stageKey === "next_step";
  const progressPercent = complete
    ? 100
    : Math.round(((stage.position - 1) / STUDY_PLAN_TOTAL_STAGES) * 100);

  return {
    currentStage: stage.key,
    currentStageLabel: stage.label,
    currentPosition: stage.position,
    totalStages: STUDY_PLAN_TOTAL_STAGES,
    progressPercent,
    complete,
  };
}

/**
 * Build the full ordered study plan for display in admin or student views.
 * Returns all stages with an `active` flag marking the current one.
 */
export function buildStudyPlanDisplay(
  input: AssignmentStatusInput,
): Array<StudyPlanStage & { active: boolean; completed: boolean }> {
  const { currentPosition } = deriveStudyPlanProgress(input);

  return STUDY_PLAN_STAGES.map((stage) => ({
    ...stage,
    active: stage.position === currentPosition,
    completed: stage.position < currentPosition,
  }));
}

/**
 * Return the human-readable label for a given stage key.
 */
export function studyPlanStageLabel(key: StudyPlanStageKey): string {
  return STUDY_PLAN_STAGES.find((s) => s.key === key)?.label ?? key;
}
