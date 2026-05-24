export type MasteryStatus =
  | "not_started"
  | "started"
  | "practising"
  | "needs_catch_up"
  | "nearly_secure"
  | "mastered"
  | "needs_revision";

export type CurriculumCoverageStatus =
  | "not_covered"
  | "partially_covered"
  | "covered"
  | "overdue_revision"
  | "gap_detected";

export type CatchUpStatus = "recommended" | "active" | "completed" | "skipped" | "waived" | "overdue";

export type AssessmentReadinessStatus = "not_ready" | "developing" | "nearly_ready" | "ready" | "needs_catch_up";

export type CatchUpTaskType =
  | "recap_lesson"
  | "targeted_practice"
  | "short_revision"
  | "homework_adjustment"
  | "quiz_retry"
  | "dictionary_review"
  | "coach_led_support"
  | "spelling_review"
  | "reading_support"
  | "maths_method_practice"
  | "language_pronunciation_retry"
  | "gcse_improve_my_answer"
  | "parent_admin_intervention"
  | "assignment_follow_up";

export type AssessmentType =
  | "prior_knowledge_check"
  | "lesson_check"
  | "daily_quiz"
  | "weekly_recap_quiz"
  | "topic_test"
  | "end_of_unit_assessment"
  | "homework_check"
  | "spelling_test"
  | "reading_comprehension"
  | "maths_method_check"
  | "language_speaking_listening"
  | "gcse_style_question"
  | "mock_exam"
  | "improve_my_answer";

export type CatchUpTriggerType =
  | "unfinished_lesson"
  | "unfinished_assignment"
  | "missed_activity"
  | "missed_homework"
  | "low_quiz_score"
  | "low_attempt_score"
  | "repeated_wrong_answers"
  | "active_weak_area"
  | "misconception_marker"
  | "difficult_dictionary_term"
  | "high_coach_usage"
  | "high_hint_usage"
  | "overdue_revision"
  | "gcse_coverage_gap"
  | "topic_not_practised_recently"
  | "assessment_below_readiness";

export type AcademicPriority = "high" | "medium" | "low";

export type TopicSignal = {
  subject: string;
  topic?: string | null;
  subtopic?: string | null;
  skill?: string | null;
  learningObjective?: string | null;
  keyStage?: string | null;
  yearGroup?: string | null;
  examBoard?: string | null;
  foundationTier?: boolean | null;
  higherTier?: boolean | null;
};

export type AssignmentRecord = TopicSignal & {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  contentId?: string | null;
};

export type AttemptRecord = TopicSignal & {
  id: string;
  correct: boolean;
  score?: number | null;
  hintsUsed?: number | null;
  responseTimeMs?: number | null;
  questionText?: string | null;
  correctAnswer?: string | null;
  answerGiven?: string | null;
  assessmentType?: AssessmentType | null;
  createdAt: string;
};

export type WeakAreaRecord = TopicSignal & {
  id: string;
  weaknessType?: string | null;
  accuracy?: number | null;
  attemptsCount?: number | null;
  status: string;
  misconception?: boolean;
  lastDetectedAt: string;
  metadata?: Record<string, unknown>;
};

export type StudentSkillRecord = {
  skill: string;
  accuracy: number;
  attempts: number;
  correct: number;
  status: string;
  updatedAt: string;
};

export type CoachUsageRecord = TopicSignal & {
  id: string;
  mode?: string | null;
  hintLevel?: number | null;
  createdAt: string;
};

export type DictionarySignalRecord = TopicSignal & {
  word: string;
  difficult?: boolean;
  lookupCount?: number;
  weak?: boolean;
  source?: string;
};

export type ProgressRecord = TopicSignal & {
  id: string;
  activityType: string;
  activityName?: string | null;
  completed: boolean;
  correct?: boolean | null;
  accuracy?: number | null;
  score?: number | null;
  createdAt: string;
};

export type AssessmentHistoryRecord = TopicSignal & {
  id: string;
  assessmentType: AssessmentType;
  score: number;
  commandWordWeakness?: string[];
  improveMyAnswerWeakness?: boolean;
  createdAt: string;
};

export type AcademicSourceData = {
  studentId: string;
  studentName?: string | null;
  keyStage?: string | null;
  yearGroup?: string | null;
  examBoard?: string | null;
  assignments: AssignmentRecord[];
  attempts: AttemptRecord[];
  weakAreas: WeakAreaRecord[];
  studentSkills: StudentSkillRecord[];
  coachUsage: CoachUsageRecord[];
  dictionarySignals: DictionarySignalRecord[];
  progressRecords: ProgressRecord[];
  assessmentHistory: AssessmentHistoryRecord[];
  generatedAt?: string;
};

export type MasteryMapEntry = TopicSignal & {
  topicKey: string;
  assignmentCompletionPct: number;
  lessonCompletionPct: number;
  averageScore: number | null;
  attemptsCount: number;
  repeatedMistakes: number;
  hintUsageRate: number;
  coachUsageCount: number;
  dictionaryWeaknessCount: number;
  weakAreaActive: boolean;
  lastPractisedAt: string | null;
  revisionOverdue: boolean;
  masteryStatus: MasteryStatus;
  confidenceScore: number;
};

export type CoverageEntry = TopicSignal & {
  topicKey: string;
  coverageStatus: CurriculumCoverageStatus;
  masteryStatus: MasteryStatus;
  lastActivityAt: string | null;
  recommendedNextStep: string;
};

export type MasterySummary = {
  totalTopics: number;
  byStatus: Record<MasteryStatus, number>;
  needsCatchUpCount: number;
  needsRevisionCount: number;
  coveredCount: number;
  averageScore: number;
};

export type CatchUpTrigger = TopicSignal & {
  triggerType: CatchUpTriggerType;
  source: string;
  evidenceSummary: string;
  priority: AcademicPriority;
  detectedAt: string;
};

export type CatchUpRecommendation = TopicSignal & {
  id: string;
  title: string;
  reason: string;
  studentFriendlyReason: string;
  taskType: CatchUpTaskType;
  estimatedMinutes: number;
  priority: AcademicPriority;
  status: CatchUpStatus;
  dueDate?: string | null;
  sourceTrigger: CatchUpTriggerType;
  recommendedAction: string;
  routeTarget?: string | null;
};

export type AssessmentRecommendation = TopicSignal & {
  assessmentType: AssessmentType;
  reason: string;
  estimatedMinutes: number;
  difficulty: "easy" | "medium" | "challenging";
  readinessStatus: AssessmentReadinessStatus;
  recommendedQuestionCount: number;
  commandWords: string[];
  gcseMode?: {
    examBoard?: string | null;
    tier?: "foundation" | "higher" | "mixed";
    markSchemePractice: boolean;
    modelAnswerPractice: boolean;
    improveMyAnswer: boolean;
  };
  routeTarget?: string | null;
};

export type GcseReadiness = {
  applicable: boolean;
  readinessStatus: AssessmentReadinessStatus;
  examBoard?: string | null;
  tier?: "foundation" | "higher" | "mixed";
  coverageGapCount: number;
  commandWordFocus: string[];
  markSchemeReadiness: "low" | "developing" | "secure";
  modelAnswerReadiness: "low" | "developing" | "secure";
  improveMyAnswerRecommended: boolean;
};

export type ParentAdminReviewAction = {
  action:
    | "approve_catch_up"
    | "reschedule_catch_up"
    | "convert_to_homework"
    | "waive_catch_up"
    | "assign_assessment"
    | "mark_reviewed"
    | "add_note";
  label: string;
  persistenceSupported: boolean;
  message: string;
};

export type AcademicReportNote = {
  category:
    | "mastery_status"
    | "curriculum_coverage"
    | "catch_up_required"
    | "catch_up_completed"
    | "unresolved_catch_up"
    | "assessment_recommended"
    | "weak_topic"
    | "overdue_revision"
    | "gcse_readiness"
    | "parent_admin_action";
  value: string;
};

export type AcademicAuditHistoryDraft = {
  recommendationId: string;
  studentId: string;
  triggerReason: string;
  sourceData: string;
  recommendationDate: string;
  actionTaken?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  outcome?: string | null;
  notes?: string | null;
};

export type AcademicIntelligenceOutput = {
  studentId: string;
  summary: MasterySummary;
  masteryMap: MasteryMapEntry[];
  curriculumCoverage: CoverageEntry[];
  catchUpTriggers: CatchUpTrigger[];
  catchUpRecommendations: CatchUpRecommendation[];
  assessmentRecommendations: AssessmentRecommendation[];
  assessmentReadiness: AssessmentReadinessStatus;
  gcseReadiness: GcseReadiness | null;
  reviewActions: ParentAdminReviewAction[];
  reportNotes: AcademicReportNote[];
  unresolvedAcademicGaps: string[];
  nextRecommendedActions: string[];
  auditHistoryDraft: AcademicAuditHistoryDraft[];
  generatedAt: string;
};
