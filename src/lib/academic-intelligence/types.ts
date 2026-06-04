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

export type CatchUpStatus = "recommended" | "scheduled" | "active" | "in_progress" | "completed" | "skipped" | "waived" | "overdue";

export type CatchUpTaskAction =
  | "approve_catch_up"
  | "reschedule_catch_up"
  | "convert_to_homework"
  | "waive_catch_up"
  | "mark_reviewed"
  | "add_note"
  | "start_task"
  | "complete_task"
  | "skip_task";

export type HomeworkStatus = "assigned" | "in_progress" | "completed" | "waived" | "overdue";

export type HomeworkTaskAction = "start_homework" | "complete_homework" | "waive_homework" | "reschedule_homework" | "add_note";

export type HomeworkTaskRecord = {
  taskId: string;
  studentId: string;
  blockId: string;
  title: string;
  subject?: string | null;
  topic?: string | null;
  status: HomeworkStatus;
  estimatedMinutes: number;
  dueDate?: string | null;
  scheduledDay?: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | null;
  routeTarget?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CatchUpTaskRecord = {
  taskId: string;
  studentId: string;
  recommendationId: string;
  title: string;
  subject: string;
  topic?: string | null;
  skill?: string | null;
  status: CatchUpStatus;
  priority: AcademicPriority;
  estimatedMinutes: number;
  dueDate?: string | null;
  scheduledDay?: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | null;
  routeTarget?: string | null;
  sourceTrigger: CatchUpTriggerType;
  note?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AssessmentReadinessStatus = "not_ready" | "developing" | "nearly_ready" | "ready" | "needs_catch_up";

export type ExamReadinessBand = "not_ready" | "nearly_ready" | "ready";

export type ExplanationStyleSignalType =
  | "visual_examples"
  | "diagrams"
  | "step_by_step_explanation"
  | "real_life_examples"
  | "story_based_explanation"
  | "voice_explanation"
  | "worked_examples"
  | "simpler_wording"
  | "practice_first_learning"
  | "repetition_recap"
  | "challenge_game_style_explanation"
  | "coach_guided_hints";

export type ExplanationStyleSignal = {
  style: ExplanationStyleSignalType;
  score: number;
  evidence: string;
};

export type ExplanationDNAProfile = {
  bestExplanationStyle: ExplanationStyleSignalType;
  coachSupportSignal: "emerging" | "helpful" | "active";
  learningPacePattern: "guided_building" | "practice_first" | "balanced";
  todayApproach: string;
  confidenceBand: "growing" | "steady" | "strong";
  topSignals: ExplanationStyleSignal[];
};

export type LearningTwinRecommendation = {
  key: "best_help" | "coach_support" | "learning_pace" | "todays_approach";
  label: string;
  text: string;
};

export type LearningTwinProfile = {
  title: string;
  subtitle: string;
  hasEnoughData: boolean;
  explanationDNA: ExplanationDNAProfile;
  insights: LearningTwinRecommendation[];
  defaultsApplied: boolean;
};

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
  spellingMode?: string | null;
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

export type QuickLevelFinderLevel = {
  accuracy: number;
  level: "below" | "secure" | "advanced";
};

export type QuickLevelFinderBaselineDiagnostic = {
  completedAt: string;
  yearGroup: string | null;
  keyStage: string | null;
  confidenceLabel: "baseline_placement_signal";
  parentSubjectScores: Array<{
    subject: string;
    accuracy: number;
    level: QuickLevelFinderLevel["level"];
  }>;
  englishStrandScores: Array<{
    strand: string;
    accuracy: number;
    level: QuickLevelFinderLevel["level"];
  }>;
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
  quickLevelFinderBaseline?: QuickLevelFinderBaselineDiagnostic | null;
  schoolWeekSettings?: SchoolWeekSettings;
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

export type ExamReadinessProfile = {
  score: number;
  band: ExamReadinessBand;
  headline: string;
  blockers: string[];
  recommendedActions: string[];
  signals: {
    masteryScore: number;
    consistencyScore: number;
    examEvidenceScore: number;
    weakAreaPenalty: number;
  };
};

export type HeartbeatPrimaryAction =
  | "advance_student"
  | "maintain_level"
  | "assign_catch_up"
  | "generate_revision"
  | "schedule_homework"
  | "trigger_parent_alert"
  | "trigger_tutor_intervention"
  | "generate_assessment"
  | "recommend_exam_preparation"
  | "review_placement";

export type HeartbeatDecisionActor = "student" | "parent" | "tutor" | "admin" | "system";

export type HeartbeatDecisionUrgency = "low" | "medium" | "high" | "critical";

export type HeartbeatDecisionRisk = "low" | "medium" | "high" | "critical";

export type HeartbeatDecision = {
  primaryAction: HeartbeatPrimaryAction;
  confidenceScore: number;
  urgency: HeartbeatDecisionUrgency;
  reasons: string[];
  blockers: string[];
  evidence: string[];
  actorRequired: HeartbeatDecisionActor;
  suggestedNextStep: string;
  riskLevel: HeartbeatDecisionRisk;
};

export type RecommendationEngineKey =
  | "heartbeat"
  | "coach_tutor"
  | "catch_up"
  | "daily_journey"
  | "homework"
  | "assignments"
  | "mastery_map"
  | "certificates";

export type RecommendationSyncStatus = "synced" | "warning" | "blocked";

export type RecommendationIntent =
  | "placement_review"
  | "catch_up"
  | "tutor_support"
  | "revision"
  | "homework"
  | "assessment"
  | "advance"
  | "maintain"
  | "certificate"
  | "unknown";

export type RecommendationTarget = {
  subject?: string | null;
  topic?: string | null;
  skill?: string | null;
  label: string;
};

export type RecommendationCanonicalDecision = {
  intent: RecommendationIntent;
  target: RecommendationTarget;
  locked: boolean;
  lockReason: string | null;
  sourceEngine: RecommendationEngineKey;
  action: string;
};

export type RecommendationEngineSignal = {
  engine: RecommendationEngineKey;
  label: string;
  intent: RecommendationIntent;
  target: RecommendationTarget;
  status: "aligned" | "mismatch" | "informational";
  summary: string;
  evidence: string[];
};

export type RecommendationMismatch = {
  engine: RecommendationEngineKey;
  label: string;
  expected: string;
  actual: string;
  reason: string;
};

export type RecommendationSyncAudit = {
  status: RecommendationSyncStatus;
  canonicalDecision: RecommendationCanonicalDecision;
  signals: RecommendationEngineSignal[];
  mismatches: RecommendationMismatch[];
  action: string;
  generatedAt: string;
};

export type OrchestrationStatus = "healthy" | "warning" | "blocked";

export type OrchestrationTopicState = "weak" | "recovering" | "secure" | "mastered" | "unknown";

export type OrchestrationNextAction =
  | "catch_up"
  | "reinforce_homework"
  | "progression"
  | "assessment"
  | "review_placement"
  | "maintain";

export type AcademicOrchestration = {
  status: OrchestrationStatus;
  canonicalTarget: RecommendationTarget;
  topicState: OrchestrationTopicState;
  nextAction: OrchestrationNextAction;
  gatedEngines: RecommendationEngineKey[];
  alignedEngines: RecommendationEngineKey[];
  mismatchedEngines: RecommendationEngineKey[];
  reason: string;
  adminAction: string;
};

export type CoachTutorAuditIntent = "catch_up" | "tutor_support" | "maintain" | "advance" | "unknown";

export type CoachTutorAuditStatus = "aligned" | "mismatch" | "informational";

export type CoachTutorOrchestrationAudit = {
  recentCoachHelpCount: number;
  stillStrugglingCount: number;
  needsCatchUpCount: number;
  liveTutorSupportCount: number;
  differentExplanationStyleCount: number;
  topSubject: string | null;
  topTopic: string | null;
  topSkillId: string | null;
  topSkillLabel: string | null;
  unresolvedTutorSkippedCount: number;
  intent: CoachTutorAuditIntent;
  target: RecommendationTarget;
  status: CoachTutorAuditStatus;
  reason: string;
  adminAction: string;
};

export type CoachSignalBreakdownEntry = {
  value: string;
  count: number;
};

export type CoachHeartbeatSignalSummary = {
  windowDays: number;
  totalCoachSignals: number;
  understoodAfterHelpCount: number;
  stillStrugglingCount: number;
  repeatedWeakAreaCount: number;
  needsCatchUpCount: number;
  needsDifferentExplanationStyleCount: number;
  needsLiveTutorSupportCount: number;
  topSubjects: CoachSignalBreakdownEntry[];
  topStrands: CoachSignalBreakdownEntry[];
  topSkillTopics: CoachSignalBreakdownEntry[];
  latestSignalAt: string | null;
  hasCoachConcern: boolean;
  hasTutorEscalationSignal: boolean;
  hasCatchUpSignal: boolean;
};

export type SchoolWeekday = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday";

export type SchoolWeekSettings = {
  enabled: boolean;
  activeDays: SchoolWeekday[];
  startTime: string;
  endTime: string;
  lessonBlockMinutes: number;
  shortBreakMinutes: number;
  lunchMinutes: number;
  dailySubjectLimit: number;
  weeklySubjectSelection: string[];
  includeCatchUpTasks: boolean;
  includeRevisionBlocks: boolean;
  includeHomeworkBlock: boolean;
  includeQuizReviewBlock: boolean;
  includeWellbeingBlock: boolean;
  includeEndOfDaySummary: boolean;
  parentAdminNotes?: string | null;
};

export type SchoolWeekModeBlock = {
  blockId: string;
  day: SchoolWeekday;
  title: string;
  activityType:
    | "check_in"
    | "subject"
    | "break"
    | "lunch"
    | "catch_up"
    | "revision"
    | "quiz"
    | "homework"
    | "wellbeing"
    | "summary";
  subject?: string | null;
  topic?: string | null;
  estimatedMinutes: number;
  startTime: string;
  endTime: string;
  routeTarget: string | null;
  recommendationId: string | null;
  friendlyLabel: string;
  graphMetadata?: SchoolWeekModeBlockGraphMetadata | null;
};

export type SchoolWeekModeDayPlan = {
  day: SchoolWeekday;
  focus: string;
  activityType: "catch_up" | "assessment" | "mastery" | "revision";
  estimatedMinutes: number;
  routeTarget: string | null;
  recommendationId: string | null;
};

export type SchoolDaySchedule = {
  day: SchoolWeekday;
  totalMinutes: number;
  blocks: SchoolWeekModeBlock[];
};

export type SchoolWeekModePlan = {
  enabled: boolean;
  strategy: string;
  totalEstimatedMinutes: number;
  days: SchoolWeekModeDayPlan[];
  dailySchedules: SchoolDaySchedule[];
  settings: Omit<SchoolWeekSettings, "parentAdminNotes">;
};

export type MasteryExpansionSummary = {
  needsCatchUpTopics: number;
  nearlySecureTopics: number;
  masteredTopics: number;
  overdueRevisionTopics: number;
  highConfidenceTopics: number;
  priorityTopics: string[];
};

export type ParentAdminReviewAction = {
  action: CatchUpTaskAction | "assign_assessment";
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

export type CurriculumGraphNodeType =
  | "topic"
  | "mastery_state"
  | "weak_area"
  | "recommendation"
  | "prerequisite"
  | "learning_twin_signal"
  | "assessment_readiness";

export type CurriculumGraphEdgeType =
  | "has_mastery_state"
  | "has_weak_area"
  | "recommends"
  | "blocked_by"
  | "requires"
  | "informed_by"
  | "targets"
  | "supports_readiness";

export type CurriculumGraphNode = {
  id: string;
  type: CurriculumGraphNodeType;
  label: string;
  subject?: string | null;
  topicKey?: string | null;
  metadata?: Record<string, unknown>;
};

export type CurriculumGraphEdge = {
  id: string;
  source: string;
  target: string;
  type: CurriculumGraphEdgeType;
  weight: number;
  metadata?: Record<string, unknown>;
};

export type CurriculumRecommendationLayer = {
  recommendationId: string;
  source: "catch_up" | "assessment";
  priority: AcademicPriority;
  status: string;
  subject?: string | null;
  topic?: string | null;
  skill?: string | null;
  reason: string;
  action: string;
  routeTarget?: string | null;
};

export type CurriculumMasteryOverlayEntry = {
  topicKey: string;
  subject: string;
  topic?: string | null;
  skill?: string | null;
  masteryStatus: MasteryStatus;
  coverageStatus: CurriculumCoverageStatus;
  confidenceScore: number;
  weakAreaActive: boolean;
  revisionOverdue: boolean;
};

export type CurriculumWeakAreaTrace = {
  weakAreaId: string;
  subject: string;
  topic?: string | null;
  skill?: string | null;
  linkedTopicKeys: string[];
  linkedRecommendationIds: string[];
  prerequisiteIds: string[];
};

export type CurriculumConnectedSystemKey =
  | "curriculum_knowledge_graph"
  | "student_mastery_data"
  | "ai_generator"
  | "smart_catch_up"
  | "assessment_exam_readiness"
  | "learning_twin"
  | "school_day_week_mode"
  | "parent_admin_reports"
  | "content_quality_safeguarding"
  | "storage_media";

export type CurriculumGraphHeartbeatState = {
  system: CurriculumConnectedSystemKey;
  connected: boolean;
  status: "ready" | "partial";
  summary: string;
  updatedAt: string;
};

export type CurriculumGraphHeartbeat = {
  sourceOfTruth: "academic_intelligence";
  generatedAt: string;
  systemStates: CurriculumGraphHeartbeatState[];
  baselineSignals?: string[];
};

export type CurriculumGraphAiGenerationContext = {
  masteryGapTopics: string[];
  prerequisiteConcepts: string[];
  weakAreaTopics: string[];
  recommendationFocus: string[];
  catchUpRouteTargets: string[];
  examReadinessBand: ExamReadinessBand;
  examReadinessBlockers: string[];
  learningTwinSignals: string[];
  bestExplanationStyle: ExplanationStyleSignalType;
  recommendedApproach: string;
};

export type SchoolWeekModeBlockGraphMetadata = {
  blockId: string;
  linkedNodeIds: string[];
  recommendationIds: string[];
  catchUpRouteTargets: string[];
  homeworkTaskIds: string[];
  revisionTopicKeys: string[];
  rationale: string;
};

export type CurriculumSchoolPlanningContext = {
  strategy: string;
  activeDayCount: number;
  blockMetadata: SchoolWeekModeBlockGraphMetadata[];
  recommendationIds: string[];
  homeworkTaskIds: string[];
  revisionTopicKeys: string[];
};

export type CurriculumGraphReportSummary = {
  recommendationReasons: string[];
  parentSummary: string;
  adminSummary: string;
  reportSignals: string[];
};

export type CurriculumContentGovernanceProfile = {
  ageSuitability: {
    keyStage: string | null;
    yearGroup: string | null;
    status: "aligned" | "review";
  };
  curriculumAlignment: {
    coveredTopicCount: number;
    gapTopicCount: number;
    status: "aligned" | "review";
  };
  sensitiveContent: {
    status: "clear" | "needs_review";
    flaggedTags: string[];
  };
  approvalStatus: {
    requiredStatuses: Array<"reviewed" | "published">;
    recommendedDefault: "reviewed" | "published";
    status: "review_required" | "ready";
  };
  auditTrailTags: string[];
};

export type CurriculumGraphMediaReference = {
  id: string;
  assetType: "lesson_image" | "diagram" | "audio" | "certificate_pdf" | "generated_asset" | "homework_asset";
  label: string;
  nodeIds: string[];
  routeTarget?: string | null;
  mediaRole: "instructional" | "revision" | "evidence" | "certificate";
  storageStatus: "planned" | "generated" | "stored";
  publicUrl?: string | null;
};

export type CurriculumGraphMediaPlan = {
  supportedAssetTypes: CurriculumGraphMediaReference["assetType"][];
  references: CurriculumGraphMediaReference[];
  summary: string;
};

export type CurriculumGraphValidationIssue = {
  code:
    | "circular_dependency"
    | "orphan_node"
    | "duplicate_node"
    | "invalid_edge"
    | "protected_node_violation";
  severity: "warning" | "error";
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export type CurriculumGraphValidationReport = {
  valid: boolean;
  issues: CurriculumGraphValidationIssue[];
  circularDependencies: string[][];
  orphanNodeIds: string[];
  duplicateNodeIds: string[];
  duplicateFingerprints: string[];
};

export type CurriculumGraphProtectionStatus = {
  protectedNodeIds: string[];
  protectedNodeTypes: CurriculumGraphNodeType[];
  aiSuggestionMode: "suggestion_only";
  approvalRequiredForActivation: boolean;
  validation: CurriculumGraphValidationReport;
  blockedChangesCount: number;
  status: "protected" | "needs_attention";
};

export type CurriculumGraphChangeAction =
  | "add_node"
  | "add_edge"
  | "update_node"
  | "update_edge"
  | "remove_node"
  | "remove_edge";

export type CurriculumGraphChangeProposal = {
  proposalId: string;
  submittedAt: string;
  submittedBy: string;
  source: "ai" | "admin";
  action: CurriculumGraphChangeAction;
  reason: string;
  node?: CurriculumGraphNode;
  edge?: CurriculumGraphEdge;
};

export type CurriculumGraphApprovalWorkflow = {
  pendingProposals: CurriculumGraphChangeProposal[];
  latestDecision: "approved" | "rejected" | "pending" | "not_requested";
  latestDecisionReason: string | null;
  latestDecisionBy: string | null;
  latestDecisionAt: string | null;
};

export type CurriculumGraphFallback = {
  applied: boolean;
  reason: string | null;
  fallbackGeneratedAt: string | null;
};

export type CurriculumGraphAuditMetadata = {
  decisions: Array<{
    at: string;
    actor: string;
    decision: "build_success" | "build_fallback" | "proposal_pending" | "proposal_rejected" | "proposal_approved";
    reason: string;
  }>;
};

export type CurriculumIntelligenceGraph = {
  version: "v1";
  generatedAt: string;
  studentId: string;
  nodes: CurriculumGraphNode[];
  edges: CurriculumGraphEdge[];
  recommendationLayer: CurriculumRecommendationLayer[];
  masteryOverlay: CurriculumMasteryOverlayEntry[];
  weakAreaTrace: CurriculumWeakAreaTrace[];
  heartbeat: CurriculumGraphHeartbeat;
  aiGenerationContext: CurriculumGraphAiGenerationContext;
  schoolPlanningContext: CurriculumSchoolPlanningContext;
  reportSummary: CurriculumGraphReportSummary;
  contentGovernance: CurriculumContentGovernanceProfile;
  mediaPlan: CurriculumGraphMediaPlan;
  protection: CurriculumGraphProtectionStatus;
  approvalWorkflow: CurriculumGraphApprovalWorkflow;
  fallback: CurriculumGraphFallback;
  auditMetadata: CurriculumGraphAuditMetadata;
};

export type AcademicIntelligenceOutput = {
  studentId: string;
  summary: MasterySummary;
  heartbeatDecision: HeartbeatDecision;
  orchestration: AcademicOrchestration;
  coachTutorAudit: CoachTutorOrchestrationAudit;
  recommendationSync: RecommendationSyncAudit;
  coachHeartbeatSignals: CoachHeartbeatSignalSummary | null;
  learningTwin: LearningTwinProfile;
  masteryMap: MasteryMapEntry[];
  masteryExpansion: MasteryExpansionSummary;
  curriculumCoverage: CoverageEntry[];
  catchUpTriggers: CatchUpTrigger[];
  catchUpRecommendations: CatchUpRecommendation[];
  catchUpTasks: CatchUpTaskRecord[];
  homeworkTasks: HomeworkTaskRecord[];
  assessmentRecommendations: AssessmentRecommendation[];
  assessmentReadiness: AssessmentReadinessStatus;
  examReadinessProfile: ExamReadinessProfile;
  gcseReadiness: GcseReadiness | null;
  schoolWeekModePlan: SchoolWeekModePlan;
  reviewActions: ParentAdminReviewAction[];
  reportNotes: AcademicReportNote[];
  unresolvedAcademicGaps: string[];
  nextRecommendedActions: string[];
  curriculumIntelligenceGraph: CurriculumIntelligenceGraph;
  auditHistoryDraft: AcademicAuditHistoryDraft[];
  generatedAt: string;
};
