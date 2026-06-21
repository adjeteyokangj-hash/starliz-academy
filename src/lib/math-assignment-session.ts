export type AssignmentSessionDecision = {
  assignmentLocked: boolean;
  assignmentExhausted: boolean;
  allowStaticFallback: boolean;
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
