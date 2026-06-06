export type SessionWordLike = {
  id: string;
  word: string;
};

export function shouldReloadSessionPlan(sessionStepIndex: number): boolean {
  return sessionStepIndex <= 0;
}

export function isLastPlannedStep(sessionStepIndex: number, totalSteps: number): boolean {
  if (!Number.isFinite(totalSteps) || totalSteps <= 0) return false;
  return sessionStepIndex >= totalSteps - 1;
}

export function shouldCompleteSessionAtStep(input: {
  reviewMode: boolean;
  sessionStepIndex: number;
  totalSteps: number;
}): boolean {
  if (input.reviewMode) return false;
  return isLastPlannedStep(input.sessionStepIndex, input.totalSteps);
}

export function nextPlannedStepIndex(sessionStepIndex: number, totalSteps: number): number {
  if (!Number.isFinite(totalSteps) || totalSteps <= 0) return 0;
  return Math.min(sessionStepIndex + 1, totalSteps - 1);
}

export function filterSessionCandidatesWithoutRepeats<T extends SessionWordLike>(input: {
  allWords: T[];
  sessionWords: string[];
  recentIds: string[];
  usedIds: Set<string>;
}): T[] {
  const allowedWords = new Set(input.sessionWords.map((word) => word.toLowerCase()));
  const recent = new Set(input.recentIds);

  return input.allWords.filter((word) => (
    allowedWords.has(word.word.toLowerCase())
    && !recent.has(word.id)
    && !input.usedIds.has(word.id)
  ));
}