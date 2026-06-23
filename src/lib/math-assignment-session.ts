export type AssignmentSessionDecision = {
  assignmentLocked: boolean;
  assignmentExhausted: boolean;
  allowStaticFallback: boolean;
};

export type MathSessionSummaryMetrics = {
  totalQuestions: number;
  correctQuestions: number;
  accuracyPct: number;
};

export type AssignmentQueueEntry = {
  id: string;
  status: string;
  href?: string | null;
  subject?: string | null;
  contentId?: string | null;
};

type AssignedQuestionLike = {
  id?: string | null;
};

export function resolveAssignmentSessionDecision(input: {
  assignmentLocked: boolean;
  assignedQuestionAvailable: boolean;
}): AssignmentSessionDecision {
  if (!input.assignmentLocked) {
    return {
      assignmentLocked: false,
      assignmentExhausted: false,
      allowStaticFallback: true,
    };
  }

  if (input.assignedQuestionAvailable) {
    return {
      assignmentLocked: true,
      assignmentExhausted: false,
      allowStaticFallback: false,
    };
  }

  return {
    assignmentLocked: true,
    assignmentExhausted: true,
    allowStaticFallback: false,
  };
}

export function getAssignedQuestionAtStep<T>(assignedQuestions: T[], sessionStep: number): T | null {
  const safeStep = Math.max(0, Math.floor(sessionStep));
  return assignedQuestions[safeStep] ?? null;
}

export function buildMathRequiredItemIds(input: {
  assignmentLocked: boolean;
  assignedQuestions: AssignedQuestionLike[];
  sessionQuestionTarget: number;
}): string[] {
  if (input.assignmentLocked && input.assignedQuestions.length) {
    const assignedIds = input.assignedQuestions
      .map((question) => String(question.id ?? "").trim())
      .filter(Boolean);
    if (assignedIds.length === input.assignedQuestions.length) {
      return assignedIds;
    }
  }

  return Array.from({ length: input.sessionQuestionTarget }, (_, index) => `step-${index}`);
}

export async function resolveNextAssignedMathQuestion<T>(input: {
  assignmentLocked: boolean;
  assignedQuestions: T[];
  sessionStep: number;
  fetchCursorQuestion?: () => Promise<T | null>;
}): Promise<T | null> {
  if (input.assignmentLocked) {
    return getAssignedQuestionAtStep(input.assignedQuestions, input.sessionStep);
  }
  if (!input.fetchCursorQuestion) {
    return null;
  }
  return input.fetchCursorQuestion();
}

export function shouldCompleteOnAssignedExhaustion(canonicalCanComplete: boolean): boolean {
  return canonicalCanComplete;
}

export function buildMathSessionSummaryMetrics(input: {
  canonical: {
    totalRequired: number;
    correctCount: number;
  };
  sessionQuestionTarget: number;
  sessionCorrect: number;
  sessionAttempts: number;
}): MathSessionSummaryMetrics {
  const fallbackTotal = Math.max(1, input.sessionQuestionTarget, input.sessionAttempts, input.sessionCorrect);
  const totalQuestions = input.canonical.totalRequired > 0 ? input.canonical.totalRequired : fallbackTotal;
  const canonicalCorrect = input.canonical.correctCount;
  const correctQuestions = Math.max(
    0,
    Math.min(
      totalQuestions,
      canonicalCorrect > 0 ? canonicalCorrect : input.sessionCorrect,
    ),
  );
  const accuracyPct = totalQuestions > 0 ? Math.round((correctQuestions / totalQuestions) * 100) : 0;
  return {
    totalQuestions,
    correctQuestions,
    accuracyPct,
  };
}

export function selectNextPendingAssignment(input: {
  assignments: AssignmentQueueEntry[];
  currentAssignmentId?: string;
}): AssignmentQueueEntry | null {
  const pendingStatuses = new Set(["assigned", "in_progress", "overdue"]);
  for (const assignment of input.assignments) {
    if (!assignment?.id) continue;
    if (input.currentAssignmentId && assignment.id === input.currentAssignmentId) continue;
    if (!pendingStatuses.has(String(assignment.status ?? "").toLowerCase())) continue;
    return assignment;
  }
  return null;
}

export function taskPathForAssignedSubject(subject: string | null | undefined): "spelling" | "math" | "reading" {
  const normalized = String(subject ?? "").toLowerCase();
  if (normalized === "reading") return "reading";
  if (normalized === "math") return "math";
  return "spelling";
}
