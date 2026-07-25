export type DaytimeActivityKind =
  | "read-passage"
  | "teacher-explanation"
  | "worked-example"
  | "multiple-choice"
  | "short-answer"
  | "reasoning"
  | "word-sort"
  | "dictation"
  | "proofreading"
  | "vocabulary"
  | "reflection"
  | "practical"
  | "challenge"
  | "fluency"
  | "prediction"
  | "scaffold"
  | "independent";

export type DaytimeActivityEstimate = {
  kind: DaytimeActivityKind;
  estimatedMinutes: number;
  title?: string;
};

export type QuestionBreakdown = {
  simplerQuestion: string;
  steps: string[];
  keyWords: Array<{ word: string; meaning: string }>;
  startingPoint: string;
};

export type DaytimeQuestionHelp = {
  explanation: string;
  hints: string[];
  breakdown?: QuestionBreakdown;
};

/** Richer daytime estimate: sum activity minutes; fall back to item×1.5 when activities missing. */
export function estimateMinutesFromActivities(
  activities: DaytimeActivityEstimate[] | null | undefined,
  itemCount: number,
): number {
  if (activities?.length) {
    const sum = activities.reduce((total, row) => total + Math.max(0, Number(row.estimatedMinutes) || 0), 0);
    if (sum > 0) return Math.max(2, Math.round(sum));
  }
  return Math.max(2, Math.ceil(Math.max(0, itemCount) * 1.5));
}

export function activitiesSupportTargetMinutes(
  activities: DaytimeActivityEstimate[] | null | undefined,
  targetMinutes: number,
  toleranceRatio = 0.35,
): boolean {
  if (!Number.isFinite(targetMinutes) || targetMinutes <= 0) return true;
  const estimated = estimateMinutesFromActivities(activities, 0);
  if (!activities?.length) return false;
  const min = targetMinutes * (1 - toleranceRatio);
  const max = targetMinutes * (1 + toleranceRatio);
  return estimated >= min && estimated <= max;
}

export function distinctActivityKinds(activities: DaytimeActivityEstimate[] | null | undefined): number {
  if (!activities?.length) return 0;
  return new Set(activities.map((row) => row.kind)).size;
}
