export type AssignmentSessionDecision = {
  assignmentLocked: boolean;
  assignmentExhausted: boolean;
  allowStaticFallback: boolean;
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
