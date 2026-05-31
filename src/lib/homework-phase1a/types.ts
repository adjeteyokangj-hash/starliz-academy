export type HomeworkLifecycleStatus =
  | "NOT_ELIGIBLE"
  | "ELIGIBLE"
  | "GENERATED"
  | "STARTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "MARKED"
  | "REVIEW_NEEDED"
  | "COMPLETED"
  | "EXCUSED"
  | "OVERRIDDEN"
  | "OVERDUE"
  | "CANCELLED";

export type HomeworkAuditAction =
  | "generation"
  | "generation_skipped"
  | "start"
  | "draft_save"
  | "submit"
  | "mark"
  | "excuse"
  | "override"
  | "unlock"
  | "extend"
  | "reduce"
  | "regenerate"
  | "cancel";

export type HomeworkAuditEvent = {
  action: HomeworkAuditAction;
  reason?: string;
  atIso: string;
  metadata?: Record<string, unknown>;
};

export type WeeklyWeaknessCandidate = {
  id: string;
  subject: string;
  topic?: string | null;
  skill?: string | null;
  estimatedMinutes: number;
  repeatedMistakes: number;
  averageScore: number | null;
  coreTopicWeakness: boolean;
  masteryGap: boolean;
  coachUsageCount: number;
  completionIssueCount: number;
  previousHomeworkWeakness: boolean;
};

export type HomeworkQuestionPlan = {
  id: string;
  subject: string;
  topic?: string | null;
  skill?: string | null;
  estimatedMinutes: number;
  required: boolean;
};

export type GeneratedHomeworkBatch = {
  studentId: string;
  timezone: string;
  weekStartIso: string;
  weekEndIso: string;
  status: "GENERATED";
  dueBeforeNextSession: true;
  sourceCompletedSessionCount: number;
  sourceStartedSessionCount: number;
  plannedMinutes: number;
  workloadCapMinutes: number;
  questions: HomeworkQuestionPlan[];
};

export type HomeworkBatchState = {
  status: HomeworkLifecycleStatus;
  requiredQuestionIds: string[];
  answeredQuestionIds: string[];
  frozenAtIso: string | null;
  submittedAtIso: string | null;
  markedAtIso: string | null;
  scorePercent: number | null;
  reviewNeeded: boolean;
  recapOnly: boolean;
};

export type SessionGateResult = {
  blockNewLearningSession: boolean;
  allowRecapCatchUpOnly: boolean;
  allowedSurfaces: Array<
    | "homework"
    | "coach_homework_help"
    | "previous_lesson_review"
    | "dictionary_glossary"
    | "reports"
    | "parent_admin_messages"
  >;
  reason: string;
};
