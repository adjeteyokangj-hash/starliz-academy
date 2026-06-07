export type CanonicalItemState = "answered" | "skipped" | "needs_review" | "mastered";

export type CanonicalItemOutcome = {
  state: CanonicalItemState;
  correct?: boolean;
};

export type CanonicalCompletionReason = "all_required_resolved" | "unresolved_required_items" | "no_required_items";

export type CanonicalSessionMetrics = {
  totalRequired: number;
  answeredCount: number;
  skippedCount: number;
  approvedSkippedCount: number;
  unresolvedCount: number;
  correctCount: number;
  canComplete: boolean;
  completionReason: CanonicalCompletionReason;
};

export type CanonicalProgressCompletionInput = {
  requiredQuestionCount?: number | null;
  answeredCount?: number | null;
  approvedSkippedCount?: number | null;
  attempts: number;
  correct: number;
  incorrect: number;
  skippedCount: number;
};

export type CanonicalProgressCompletionResult = {
  totalRequired: number;
  answeredCount: number;
  approvedSkippedCount: number;
  resolvedCount: number;
  canComplete: boolean;
  downgraded: boolean;
};

export function computeCanonicalSessionMetrics(input: {
  requiredItemIds: string[];
  outcomes: Record<string, CanonicalItemOutcome | undefined>;
  approvedSkippedIds?: string[];
}): CanonicalSessionMetrics {
  const required = Array.from(new Set(input.requiredItemIds.filter(Boolean)));
  const approvedSkipped = new Set(input.approvedSkippedIds ?? []);

  let answeredCount = 0;
  let skippedCount = 0;
  let approvedSkippedCount = 0;
  let unresolvedCount = 0;
  let correctCount = 0;

  for (const id of required) {
    const outcome = input.outcomes[id];
    if (!outcome) {
      unresolvedCount += 1;
      continue;
    }

    if (outcome.state === "answered" || outcome.state === "mastered") {
      answeredCount += 1;
      if (outcome.correct) {
        correctCount += 1;
      }
      continue;
    }

    if (outcome.state === "skipped") {
      skippedCount += 1;
      if (approvedSkipped.has(id)) {
        approvedSkippedCount += 1;
      } else {
        unresolvedCount += 1;
      }
      continue;
    }

    unresolvedCount += 1;
  }

  const totalRequired = required.length;
  if (totalRequired === 0) {
    return {
      totalRequired: 0,
      answeredCount: 0,
      skippedCount: 0,
      approvedSkippedCount: 0,
      unresolvedCount: 0,
      correctCount: 0,
      canComplete: false,
      completionReason: "no_required_items",
    };
  }

  const canComplete = unresolvedCount === 0;
  return {
    totalRequired,
    answeredCount,
    skippedCount,
    approvedSkippedCount,
    unresolvedCount,
    correctCount,
    canComplete,
    completionReason: canComplete ? "all_required_resolved" : "unresolved_required_items",
  };
}

export function evaluateCanonicalProgressCompletion(input: CanonicalProgressCompletionInput): CanonicalProgressCompletionResult {
  const totalRequired = input.requiredQuestionCount ?? Math.max(input.attempts, input.correct + input.incorrect + input.skippedCount);
  const answeredCount = input.answeredCount ?? (input.correct + input.incorrect);
  const approvedSkippedCount = input.approvedSkippedCount ?? input.skippedCount;
  const resolvedCount = answeredCount + approvedSkippedCount;
  const canComplete = totalRequired > 0 && resolvedCount >= totalRequired;

  return {
    totalRequired,
    answeredCount,
    approvedSkippedCount,
    resolvedCount,
    canComplete,
    downgraded: !canComplete,
  };
}
