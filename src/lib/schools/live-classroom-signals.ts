/**
 * Teacher Live Classroom v1 — pure signal derivation.
 * No persistence. Human Support Availability / Queue is out of scope.
 */

export type LearningState = "not-started" | "learning" | "practice" | "completed";

export type AiSupportState =
  | "not-needed"
  | "stored-help"
  | "progressing"
  | "live-ai"
  | "struggling"
  | "exhausted";

export type TeacherState = "observe" | "watch" | "intervene" | "supporting" | "resolved";

export type GlanceSignal = "NORMAL" | "AI_ASSISTING" | "AI_STRUGGLING" | "TEACHER_REQUIRED";

export type RecoveryOutcome =
  | "Not applicable"
  | "Recovered"
  | "Still attempting"
  | "Teacher required"
  | "Period ended";

export type TutorHelpEvent = {
  createdAt: Date;
  source: "stored-help" | "openai" | "fallback" | string;
  needsTeacher: boolean;
  hintLevel: number;
  assignmentId: string | null;
  questionKey: string | null;
  intent?: string | null;
  message?: string | null;
};

export type AttemptSignal = {
  createdAt: Date;
  correct: boolean;
  assignmentId: string | null;
  contentId: string | null;
  questionText: string | null;
};

export type AssignmentSignal = {
  id: string;
  contentId: string;
  status: string;
  completedAt: Date | null;
  stage?: string | null;
  stageIndex?: number | null;
};

export type DeriveStudentSignalsInput = {
  stageContentIds: string[];
  assignments: AssignmentSignal[];
  attempts: AttemptSignal[];
  helpEvents: TutorHelpEvent[];
  periodStillActive: boolean;
  /** Teacher has explicitly opened intervene mode for this student (client/audit soft state). */
  teacherSupporting?: boolean;
};

export type StudentSignals = {
  learningState: LearningState;
  aiSupportState: AiSupportState;
  teacherState: TeacherState;
  glanceSignal: GlanceSignal;
  humanTutorEligible: boolean;
  studentRecovered: boolean;
  assignmentStillActive: boolean;
  periodStillActive: boolean;
  recoveryOutcome: RecoveryOutcome;
  canOpenDrawer: true;
  canJoinAsHumanTutor: boolean;
  exhaustedAt: Date | null;
};

function isCompletedStatus(status: string): boolean {
  return status.trim().toLowerCase() === "completed";
}

export function deriveLearningState(input: {
  stageContentIds: string[];
  assignments: AssignmentSignal[];
  periodStillActive: boolean;
}): LearningState {
  const stageIds = input.stageContentIds;
  if (stageIds.length === 0) {
    if (input.assignments.some((row) => !isCompletedStatus(row.status))) return "learning";
    if (input.assignments.some((row) => isCompletedStatus(row.status))) {
      return input.periodStillActive ? "practice" : "completed";
    }
    return "not-started";
  }

  const byContent = new Map(input.assignments.map((row) => [row.contentId, row]));
  const started = stageIds.some((id) => byContent.has(id));
  if (!started) return "not-started";

  const allStagesDone = stageIds.every((id) => {
    const row = byContent.get(id);
    return row ? isCompletedStatus(row.status) : false;
  });

  if (allStagesDone) {
    return input.periodStillActive ? "practice" : "completed";
  }

  return "learning";
}

export function deriveAiSupportState(helpEvents: TutorHelpEvent[]): {
  aiSupportState: AiSupportState;
  exhaustedAt: Date | null;
} {
  if (helpEvents.length === 0) {
    return { aiSupportState: "not-needed", exhaustedAt: null };
  }

  const ordered = [...helpEvents].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const exhaustedEvent = [...ordered].reverse().find(
    (event) => event.needsTeacher || event.source === "fallback",
  );
  if (exhaustedEvent) {
    return { aiSupportState: "exhausted", exhaustedAt: exhaustedEvent.createdAt };
  }

  const latest = ordered[ordered.length - 1]!;
  const hasOpenAi = ordered.some((event) => event.source === "openai");
  const hasStored = ordered.some((event) => event.source === "stored-help");
  const highHints = ordered.filter((event) => event.hintLevel >= 3).length >= 2;

  if (highHints && hasOpenAi) {
    return { aiSupportState: "struggling", exhaustedAt: null };
  }
  if (latest.source === "openai") {
    return { aiSupportState: "live-ai", exhaustedAt: null };
  }
  if (hasOpenAi) {
    return { aiSupportState: "progressing", exhaustedAt: null };
  }
  if (hasStored) {
    return { aiSupportState: "stored-help", exhaustedAt: null };
  }
  return { aiSupportState: "progressing", exhaustedAt: null };
}

/**
 * Recovered = correct answer, advanced question, or advanced/completed stage
 * after the AI-exhausted help event.
 */
export function deriveStudentRecovered(input: {
  exhaustedAt: Date | null;
  helpEvents: TutorHelpEvent[];
  attempts: AttemptSignal[];
  assignments: AssignmentSignal[];
}): boolean {
  if (!input.exhaustedAt) return false;
  const since = input.exhaustedAt.getTime();

  const exhaustedHelp = [...input.helpEvents]
    .filter((event) => event.createdAt.getTime() <= since)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  const focusAssignmentId = exhaustedHelp?.assignmentId ?? null;
  const focusQuestionKey = exhaustedHelp?.questionKey ?? null;

  for (const attempt of input.attempts) {
    if (attempt.createdAt.getTime() <= since) continue;
    if (!attempt.correct) continue;
    if (focusAssignmentId && attempt.assignmentId && attempt.assignmentId !== focusAssignmentId) {
      // Still counts as recovery if they moved on and got something right.
    }
    if (
      focusQuestionKey
      && attempt.questionText
      && !attempt.questionText.toLowerCase().includes(focusQuestionKey.toLowerCase())
    ) {
      // Question text may not include the key; correct after exhaustion still counts.
    }
    return true;
  }

  for (const assignment of input.assignments) {
    if (!isCompletedStatus(assignment.status)) continue;
    if (assignment.completedAt && assignment.completedAt.getTime() > since) return true;
    if (focusAssignmentId && assignment.id === focusAssignmentId && isCompletedStatus(assignment.status)) {
      // Completed without precise completedAt after exhaustion — treat as recovered if status completed.
      if (!assignment.completedAt || assignment.completedAt.getTime() >= since) return true;
    }
  }

  // Advanced to a later stage content after exhaustion.
  if (focusAssignmentId) {
    const focus = input.assignments.find((row) => row.id === focusAssignmentId);
    const focusIndex = focus?.stageIndex ?? null;
    if (focusIndex != null) {
      const advanced = input.assignments.some(
        (row) =>
          (row.stageIndex ?? -1) > focusIndex
          && (
            !row.completedAt
            || row.completedAt.getTime() > since
            || isCompletedStatus(row.status)
            || row.status === "assigned"
          ),
      );
      if (advanced) {
        const newerThanExhaustion = input.assignments.some(
          (row) =>
            (row.stageIndex ?? -1) > focusIndex
            && (
              (row.completedAt && row.completedAt.getTime() > since)
              || (row.status === "assigned" && (!focus || isCompletedStatus(focus.status)))
            ),
        );
        if (newerThanExhaustion) return true;
      }
    }
  }

  return false;
}

export function deriveAssignmentStillActive(assignments: AssignmentSignal[]): boolean {
  return assignments.some((row) => !isCompletedStatus(row.status));
}

export function deriveHumanTutorEligible(input: {
  aiSupportState: AiSupportState;
  studentRecovered: boolean;
  assignmentStillActive: boolean;
  periodStillActive: boolean;
}): boolean {
  return (
    input.aiSupportState === "exhausted"
    && input.studentRecovered === false
    && input.assignmentStillActive === true
    && input.periodStillActive === true
  );
}

export function deriveTeacherState(input: {
  humanTutorEligible: boolean;
  studentRecovered: boolean;
  aiSupportState: AiSupportState;
  learningState: LearningState;
  teacherSupporting?: boolean;
}): TeacherState {
  if (input.teacherSupporting && input.humanTutorEligible) return "supporting";
  if (input.humanTutorEligible) return "intervene";
  if (input.studentRecovered && input.aiSupportState === "exhausted") return "resolved";
  if (input.learningState === "completed" && input.aiSupportState === "not-needed") return "resolved";
  if (
    input.aiSupportState === "stored-help"
    || input.aiSupportState === "progressing"
    || input.aiSupportState === "live-ai"
    || input.aiSupportState === "struggling"
    || input.aiSupportState === "exhausted"
  ) {
    return "watch";
  }
  return "observe";
}

export function deriveGlanceSignal(input: {
  humanTutorEligible: boolean;
  aiSupportState: AiSupportState;
}): GlanceSignal {
  if (input.humanTutorEligible) return "TEACHER_REQUIRED";
  if (input.aiSupportState === "exhausted" || input.aiSupportState === "struggling") {
    return "AI_STRUGGLING";
  }
  if (
    input.aiSupportState === "stored-help"
    || input.aiSupportState === "progressing"
    || input.aiSupportState === "live-ai"
  ) {
    return "AI_ASSISTING";
  }
  return "NORMAL";
}

export function deriveRecoveryOutcome(input: {
  periodStillActive: boolean;
  humanTutorEligible: boolean;
  studentRecovered: boolean;
  exhaustedAt: Date | null;
  attemptsAfterExhaustion: number;
}): RecoveryOutcome {
  if (!input.exhaustedAt) return "Not applicable";
  if (!input.periodStillActive && !input.studentRecovered) {
    return "Period ended";
  }
  if (input.humanTutorEligible) return "Teacher required";
  if (input.studentRecovered) return "Recovered";
  if (input.attemptsAfterExhaustion > 0) return "Still attempting";
  return "Still attempting";
}

export function deriveStudentSignals(input: DeriveStudentSignalsInput): StudentSignals {
  const learningState = deriveLearningState({
    stageContentIds: input.stageContentIds,
    assignments: input.assignments,
    periodStillActive: input.periodStillActive,
  });

  const { aiSupportState, exhaustedAt } = deriveAiSupportState(input.helpEvents);
  const assignmentStillActive = deriveAssignmentStillActive(input.assignments);
  const studentRecovered = deriveStudentRecovered({
    exhaustedAt,
    helpEvents: input.helpEvents,
    attempts: input.attempts,
    assignments: input.assignments,
  });

  const humanTutorEligible = deriveHumanTutorEligible({
    aiSupportState,
    studentRecovered,
    assignmentStillActive,
    periodStillActive: input.periodStillActive,
  });

  const teacherState = deriveTeacherState({
    humanTutorEligible,
    studentRecovered,
    aiSupportState,
    learningState,
    teacherSupporting: input.teacherSupporting,
  });

  const glanceSignal = deriveGlanceSignal({ humanTutorEligible, aiSupportState });

  const attemptsAfterExhaustion = exhaustedAt
    ? input.attempts.filter((row) => row.createdAt.getTime() > exhaustedAt.getTime()).length
    : 0;

  const recoveryOutcome = deriveRecoveryOutcome({
    periodStillActive: input.periodStillActive,
    humanTutorEligible,
    studentRecovered,
    exhaustedAt,
    attemptsAfterExhaustion,
  });

  return {
    learningState,
    aiSupportState,
    teacherState,
    glanceSignal,
    humanTutorEligible,
    studentRecovered,
    assignmentStillActive,
    periodStillActive: input.periodStillActive,
    recoveryOutcome,
    canOpenDrawer: true,
    canJoinAsHumanTutor: humanTutorEligible,
    exhaustedAt,
  };
}

export function parseDaytimeTutorSkillFocus(skillFocus: string | null | undefined): {
  periodId: string;
  assignmentId: string;
  questionKey: string;
  conversationId: string;
} | null {
  if (!skillFocus) return null;
  const parts = skillFocus.split(":");
  // dts:{periodId}:{assignmentId}:{questionKey}:{conversationId}
  if (parts.length < 5 || parts[0] !== "dts") return null;
  const [, periodId, assignmentId, questionKey, ...rest] = parts;
  if (!periodId || !assignmentId || !questionKey) return null;
  return {
    periodId,
    assignmentId,
    questionKey,
    conversationId: rest.join(":") || "",
  };
}
