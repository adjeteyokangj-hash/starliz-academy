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
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type MathSessionLifecycle =
  | "idle"
  | "loading"
  | "active"
  | "completing"
  | "completed"
  | "launching-next";

export const MATH_NEXT_SESSION_DASHBOARD_HREF = "/student/dashboard?refresh=1";

export type MathCompletionSnapshot = {
  assignmentId?: string;
  contentId?: string | null;
  answeredCount: number;
  totalCount: number;
  correctCount: number;
  skippedCount: number;
  accuracyPct: number;
  completedAt: string;
};

type AssignedQuestionLike = {
  id?: string | null;
};

const PENDING_ASSIGNMENT_STATUSES = new Set(["assigned", "in_progress", "overdue"]);
const BLOCKED_ASSIGNMENT_STATUSES = new Set([
  "completed",
  "archived",
  "cancelled",
  "canceled",
  "expired",
  "withdrawn",
]);

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

/**
 * Single authoritative denominator for an assigned maths session.
 * Once questions are loaded, prefer the frozen total so UI never flips
 * between library slot counts and validated assigned counts.
 */
export function resolveAuthoritativeSessionTotal(input: {
  assignmentLocked: boolean;
  assignedQuestionCount: number;
  frozenAssignedTotal: number | null;
  retryPackMode: boolean;
  retryInitialCount: number;
  standardTarget: number;
}): number {
  if (input.retryPackMode) {
    return Math.max(1, input.retryInitialCount);
  }
  if (input.assignmentLocked) {
    if (typeof input.frozenAssignedTotal === "number" && input.frozenAssignedTotal > 0) {
      return input.frozenAssignedTotal;
    }
    if (input.assignedQuestionCount > 0) {
      return input.assignedQuestionCount;
    }
    return 0;
  }
  return Math.max(1, input.standardTarget);
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

export function buildMathCompletionSnapshot(input: {
  assignmentId?: string;
  contentId?: string | null;
  answeredCount: number;
  totalCount: number;
  correctCount: number;
  skippedCount: number;
  completedAt?: string;
}): MathCompletionSnapshot {
  const totalCount = Math.max(0, input.totalCount);
  const correctCount = Math.max(0, Math.min(totalCount, input.correctCount));
  const answeredCount = Math.max(0, Math.min(totalCount, input.answeredCount));
  const skippedCount = Math.max(0, Math.min(totalCount, input.skippedCount));
  const accuracyPct = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  return {
    assignmentId: input.assignmentId,
    contentId: input.contentId ?? null,
    answeredCount,
    totalCount,
    correctCount,
    skippedCount,
    accuracyPct,
    completedAt: input.completedAt ?? new Date().toISOString(),
  };
}

export function canAutoSelectMathQuestion(lifecycle: MathSessionLifecycle): boolean {
  return lifecycle === "idle" || lifecycle === "loading" || lifecycle === "active";
}

export function isTerminalMathLifecycle(lifecycle: MathSessionLifecycle): boolean {
  return lifecycle === "completing" || lifecycle === "completed" || lifecycle === "launching-next";
}

export function isStaleAssignmentResponse(input: {
  requestToken: number;
  activeToken: number;
  requestAssignmentId?: string | null;
  activeAssignmentId?: string | null;
  requestContentId?: string | null;
  activeContentId?: string | null;
}): boolean {
  if (input.requestToken !== input.activeToken) return true;
  if ((input.requestAssignmentId ?? null) !== (input.activeAssignmentId ?? null)) return true;
  if ((input.requestContentId ?? null) !== (input.activeContentId ?? null)) return true;
  return false;
}

/**
 * Deterministic next-assignment picker.
 * Preserves the API/dashboard array order. Skips the completed assignment by unique ID.
 */
export function selectNextPendingAssignment(input: {
  assignments: AssignmentQueueEntry[];
  currentAssignmentId?: string;
}): AssignmentQueueEntry | null {
  for (const assignment of input.assignments) {
    if (!assignment?.id) continue;
    if (input.currentAssignmentId && assignment.id === input.currentAssignmentId) continue;
    const status = String(assignment.status ?? "").toLowerCase();
    if (BLOCKED_ASSIGNMENT_STATUSES.has(status)) continue;
    if (!PENDING_ASSIGNMENT_STATUSES.has(status)) continue;
    return assignment;
  }
  return null;
}

export function taskPathForAssignedSubject(subject: string | null | undefined): "spelling" | "math" | "reading" {
  const normalized = String(subject ?? "").toLowerCase();
  if (normalized === "reading") return "reading";
  if (normalized === "math" || normalized === "maths") return "math";
  return "spelling";
}
