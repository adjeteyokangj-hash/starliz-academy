/**
 * Human Tutor Queue & Sessions v1 — snapshot, notes, guidance, unresolved report.
 * Stored additively in HumanSupportSession.metadataJson (no schema migration).
 */

export const SUPPORT_SESSION_META_VERSION = 1;

export type SupportContextSnapshot = {
  acceptedAt: string;
  schoolId: string;
  classroomId: string | null;
  dayLessonId: string;
  lessonId: string | null;
  subject: string;
  lessonTitle: string | null;
  curriculumSkill: string | null;
  stage: string | null;
  stageOrder: number | null;
  contentId: string | null;
  assignmentId: string | null;
  questionKey: string | null;
  questionText: string | null;
  answerType: string | null;
  modelAnswerOrMarkingGuide: string | null;
  recentAttempts: Array<{
    createdAt: string;
    correct: boolean;
    questionText: string | null;
    answerGiven: string | null;
    hintsUsed: number;
  }>;
  wrongAttemptCount: number;
  latestStudentAttempt: {
    createdAt: string;
    correct: boolean;
    questionText: string | null;
    answerGiven: string | null;
  } | null;
  aiSupportState: string | null;
  aiHintsShown: number;
  aiTutorHistory: Array<{
    createdAt: string;
    intent: string | null;
    source: string;
    hintLevel: number;
    needsTeacher: boolean;
    message: string;
  }>;
  misconception: string | null;
  recoveryState: string | null;
  needsTeacherReason: string | null;
  periodEndsAt: string | null;
  minutesRemainingAtAccept: number;
  budgetMinutes: number;
  plannedEndsAt: string;
};

export type SessionNotesState = {
  privateNotes: string;
  misconception?: string;
  actionsTaken: string[];
  followUpNeeded: boolean;
};

export type TeacherGuidanceMessage = {
  id: string;
  text: string;
  createdAt: string;
  authorTeacherId: string;
};

export type HumanSupportSessionMeta = {
  metaVersion: number;
  supportContextSnapshot: SupportContextSnapshot | null;
  liveSinceAccept?: Record<string, unknown>;
  sessionNotes: SessionNotesState;
  guidanceMessages: TeacherGuidanceMessage[];
  returnAction: "resume_current";
  priorSessionId?: string | null;
  escalatedFromSessionId?: string | null;
};

export type UnresolvedReport = {
  summary: string;
  whatWasTried: string[];
  remainingDifficulty: string;
  recommendedFollowUp: string;
  urgency: "low" | "medium" | "high";
};

export type SnapshotBuildInput = {
  schoolId: string;
  classroomId: string | null;
  dayLessonId: string;
  lessonId: string | null;
  subject: string;
  lessonTitle: string | null;
  curriculumSkill: string | null;
  periodEndsAt: string | null;
  minutesRemainingAtAccept: number;
  budgetMinutes: number;
  plannedEndsAt: string;
  acceptedAt?: string;
  student: {
    activeContentId: string | null;
    activeAssignmentId: string | null;
    currentQuestionKey: string | null;
    aiSupportState: string | null;
    misconception: string | null;
    recoveryOutcome?: string | null;
    studentRecovered?: boolean;
    stages: Array<{ contentId: string; stage: string | null; stageIndex: number; completed: boolean }>;
    attempts: Array<{
      createdAt: string;
      correct: boolean;
      questionText: string | null;
      answerGiven: string | null;
      hintsUsed: number;
    }>;
    tutorHistory: Array<{
      createdAt: string;
      intent: string | null;
      source: string;
      hintLevel: number;
      needsTeacher: boolean;
      message: string;
    }>;
  };
};

export function emptySessionNotes(): SessionNotesState {
  return {
    privateNotes: "",
    actionsTaken: [],
    followUpNeeded: false,
  };
}

export function parseSessionMetadata(raw: string | null | undefined): HumanSupportSessionMeta {
  if (!raw) {
    return {
      metaVersion: SUPPORT_SESSION_META_VERSION,
      supportContextSnapshot: null,
      sessionNotes: emptySessionNotes(),
      guidanceMessages: [],
      returnAction: "resume_current",
    };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<HumanSupportSessionMeta>;
    return {
      metaVersion: typeof parsed.metaVersion === "number" ? parsed.metaVersion : SUPPORT_SESSION_META_VERSION,
      supportContextSnapshot: parsed.supportContextSnapshot ?? null,
      liveSinceAccept: parsed.liveSinceAccept,
      sessionNotes: {
        privateNotes: parsed.sessionNotes?.privateNotes ?? "",
        misconception: parsed.sessionNotes?.misconception,
        actionsTaken: Array.isArray(parsed.sessionNotes?.actionsTaken) ? parsed.sessionNotes.actionsTaken : [],
        followUpNeeded: Boolean(parsed.sessionNotes?.followUpNeeded),
      },
      guidanceMessages: Array.isArray(parsed.guidanceMessages) ? parsed.guidanceMessages : [],
      returnAction: "resume_current",
      priorSessionId: parsed.priorSessionId ?? null,
      escalatedFromSessionId: parsed.escalatedFromSessionId ?? null,
    };
  } catch {
    return {
      metaVersion: SUPPORT_SESSION_META_VERSION,
      supportContextSnapshot: null,
      sessionNotes: emptySessionNotes(),
      guidanceMessages: [],
      returnAction: "resume_current",
    };
  }
}

export function serializeSessionMetadata(meta: HumanSupportSessionMeta): string {
  return JSON.stringify({
    ...meta,
    metaVersion: SUPPORT_SESSION_META_VERSION,
    returnAction: "resume_current",
  });
}

/** Freeze accept-time context. Never mutate after write. */
export function buildSupportContextSnapshot(input: SnapshotBuildInput): SupportContextSnapshot {
  const attempts = input.student.attempts.slice(0, 12);
  const wrongAttemptCount = attempts.filter((row) => !row.correct).length;
  const latest = attempts[0] ?? null;
  const activeStage = input.student.stages.find((s) => s.contentId === input.student.activeContentId)
    ?? input.student.stages.find((s) => !s.completed)
    ?? input.student.stages[0]
    ?? null;
  const hintsShown = attempts.reduce((sum, row) => sum + (row.hintsUsed || 0), 0)
    + input.student.tutorHistory.reduce((sum, row) => sum + (row.hintLevel > 0 ? 1 : 0), 0);
  const needsTeacherTurn = [...input.student.tutorHistory].reverse().find((row) => row.needsTeacher);

  return {
    acceptedAt: input.acceptedAt ?? new Date().toISOString(),
    schoolId: input.schoolId,
    classroomId: input.classroomId,
    dayLessonId: input.dayLessonId,
    lessonId: input.lessonId,
    subject: input.subject,
    lessonTitle: input.lessonTitle,
    curriculumSkill: input.curriculumSkill,
    stage: activeStage?.stage ?? null,
    stageOrder: activeStage?.stageIndex ?? null,
    contentId: input.student.activeContentId,
    assignmentId: input.student.activeAssignmentId,
    questionKey: input.student.currentQuestionKey,
    questionText: latest?.questionText ?? null,
    answerType: null,
    modelAnswerOrMarkingGuide: null,
    recentAttempts: attempts.map((row) => ({
      createdAt: row.createdAt,
      correct: row.correct,
      questionText: row.questionText,
      answerGiven: row.answerGiven,
      hintsUsed: row.hintsUsed,
    })),
    wrongAttemptCount,
    latestStudentAttempt: latest
      ? {
          createdAt: latest.createdAt,
          correct: latest.correct,
          questionText: latest.questionText,
          answerGiven: latest.answerGiven,
        }
      : null,
    aiSupportState: input.student.aiSupportState,
    aiHintsShown: hintsShown,
    aiTutorHistory: input.student.tutorHistory.slice(-20).map((row) => ({
      createdAt: row.createdAt,
      intent: row.intent,
      source: row.source,
      hintLevel: row.hintLevel,
      needsTeacher: row.needsTeacher,
      message: row.message.slice(0, 500),
    })),
    misconception: input.student.misconception,
    recoveryState: input.student.studentRecovered
      ? "recovered"
      : (input.student.recoveryOutcome ?? null),
    needsTeacherReason: needsTeacherTurn ? "AI marked needsTeacher" : null,
    periodEndsAt: input.periodEndsAt,
    minutesRemainingAtAccept: input.minutesRemainingAtAccept,
    budgetMinutes: input.budgetMinutes,
    plannedEndsAt: input.plannedEndsAt,
  };
}

export function validateUnresolvedReport(raw: unknown):
  | { ok: true; report: UnresolvedReport }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Unresolved report must be an object." };
  }
  const row = raw as Record<string, unknown>;
  const summary = typeof row.summary === "string" ? row.summary.trim() : "";
  const remainingDifficulty = typeof row.remainingDifficulty === "string" ? row.remainingDifficulty.trim() : "";
  const recommendedFollowUp = typeof row.recommendedFollowUp === "string" ? row.recommendedFollowUp.trim() : "";
  const urgency = row.urgency;
  const whatWasTried = Array.isArray(row.whatWasTried)
    ? row.whatWasTried.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];

  if (summary.length < 12) {
    return { ok: false, error: "Unresolved report summary must be at least 12 characters." };
  }
  if (!whatWasTried.length) {
    return { ok: false, error: "Unresolved report must list whatWasTried (at least one item)." };
  }
  if (remainingDifficulty.length < 8) {
    return { ok: false, error: "Unresolved report remainingDifficulty is required." };
  }
  if (recommendedFollowUp.length < 8) {
    return { ok: false, error: "Unresolved report recommendedFollowUp is required." };
  }
  if (urgency !== "low" && urgency !== "medium" && urgency !== "high") {
    return { ok: false, error: "Unresolved report urgency must be low, medium, or high." };
  }

  return {
    ok: true,
    report: {
      summary,
      whatWasTried,
      remainingDifficulty,
      recommendedFollowUp,
      urgency,
    },
  };
}

/** UI label for partially_resolved */
export function outcomeUiLabel(outcome: string): string {
  if (outcome === "partially_resolved") return "Needs monitoring";
  if (outcome === "resolved") return "Resolved";
  if (outcome === "unresolved") return "Unresolved";
  if (outcome === "escalated") return "Escalated";
  if (outcome === "period_ended") return "Period ended";
  if (outcome === "student_recovered") return "Student recovered";
  if (outcome === "disconnected") return "Disconnected";
  return outcome;
}

export function mergeSessionNotes(
  current: SessionNotesState,
  patch: Partial<SessionNotesState>,
): SessionNotesState {
  return {
    privateNotes: typeof patch.privateNotes === "string" ? patch.privateNotes.slice(0, 4000) : current.privateNotes,
    misconception: typeof patch.misconception === "string"
      ? patch.misconception.slice(0, 1000)
      : current.misconception,
    actionsTaken: Array.isArray(patch.actionsTaken)
      ? patch.actionsTaken.map((item) => String(item).slice(0, 200)).slice(0, 20)
      : current.actionsTaken,
    followUpNeeded: typeof patch.followUpNeeded === "boolean" ? patch.followUpNeeded : current.followUpNeeded,
  };
}
