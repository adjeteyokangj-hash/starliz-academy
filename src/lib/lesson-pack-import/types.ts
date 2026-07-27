import type { Subject, YearGroup, KeyStage } from "@/lib/curriculum";
import type { QuestionDuplicateSummary } from "@/lib/question-duplicate-detection";
import type { AcademicValidationResult } from "@/lib/lesson-pack-import/academic-validation/types";

export const LESSON_PACK_COMPONENT_TYPES = [
  "starter_questions",
  "starter_answers",
  "teaching_slides",
  "worksheet",
  "worksheet_answers",
  "exit_questions",
  "exit_answers",
  "teacher_notes",
  "supporting_material",
  "unknown",
] as const;

export type LessonPackComponentType = (typeof LESSON_PACK_COMPONENT_TYPES)[number];

export const LESSON_PACK_SESSION_TYPES = [
  "school_day",
  "short_learning_90",
  "short_learning_120",
  "general_library",
] as const;

export type LessonPackSessionType = (typeof LESSON_PACK_SESSION_TYPES)[number];

export const LESSON_PACK_IMPORT_STATUSES = [
  "creating_upload_session",
  "uploading",
  "uploaded",
  "verifying_upload",
  "extracting",
  "classifying",
  "analysing",
  "needs_input",
  "preview_ready",
  "analysis_failed",
  "failed",
  "cancelled",
  "draft_created",
  "awaiting_review",
  "changes_requested",
  "approved",
  "published",
  "rejected",
] as const;

export type LessonPackImportStatus = (typeof LESSON_PACK_IMPORT_STATUSES)[number];

export const LESSON_PACK_DUPLICATE_LEVELS = [
  "none",
  "possible",
  "high_confidence",
  "exact",
] as const;

export type LessonPackDuplicateLevel = (typeof LESSON_PACK_DUPLICATE_LEVELS)[number];

export type LessonPackFileKind =
  | "pdf"
  | "pptx"
  | "docx"
  | "doc"
  | "zip"
  | "txt"
  | "unsupported";

export type LessonPackUploadedFile = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  kind: LessonPackFileKind;
  textContent: string;
  pageOrSlideCount: number;
  headings: string[];
  documentTitle: string | null;
  metadata: Record<string, string>;
  extractionStatus: "ok" | "partial" | "failed" | "skipped";
  extractionError?: string;
  isPasswordProtected?: boolean;
  isScannedImageOnly?: boolean;
  classification: LessonPackComponentType;
  classificationConfidence: number;
  classificationEvidence: string[];
  manualClassification?: LessonPackComponentType;
  lessonGroupId?: string;
  /** Shared id when PDF/PPTX (etc.) are equivalent components of the same role. */
  equivalentGroupId?: string;
  /** Primary file used for student activity extraction within an equivalent group. */
  isPrimaryExtractionSource?: boolean;
};

export type LinkedQaItem = {
  id: string;
  prompt: string;
  answer?: string;
  choices?: string[];
  explanation?: string;
  hint?: string;
  difficulty?: number;
  sourceComponent: LessonPackComponentType;
  sourceFileId?: string;
  responseType?: "short_answer" | "fill_blank" | "multi_part" | "extended_reasoning" | "matching" | "multiple-choice";
  markingMode?: "auto" | "guided_review";
  questionNumber?: string;
  subQuestionNumber?: string;
  pairingMethod?: string;
  pairingConfidence?: number;
  supportingContext?: string;
  /** Student-facing instructional stem when maths is stored separately. */
  instructions?: string | null;
  mathExpression?: string | null;
  visualModel?: Record<string, unknown> | null;
  requiresVisual?: boolean;
  visualType?: string | null;
  visualSourceFile?: string | null;
  visualSourceSlideOrPage?: number | null;
  visualExtractionConfidence?: "high" | "medium" | "low" | null;
  visualReconstructionStatus?:
    | "not_required"
    | "reconstructed"
    | "needs_admin_reconstruction"
    | "excluded";
  playableStatus?: "playable" | "blocked" | "needs_admin_reconstruction";
  playableBlockReasons?: string[];
  acceptedAnswers?: string[];
  successCriteria?: string | null;
};

export type LessonPackStructuredModel = {
  title: string;
  subject: Subject | null;
  yearGroup: YearGroup | null;
  keyStage: KeyStage | null;
  curriculumArea: string | null;
  learningObjective: string | null;
  lessonOutcome: string | null;
  keywords: string[];
  priorKnowledge: string[];
  teachingExplanations: string[];
  workedExamples: string[];
  guidedPractice: LinkedQaItem[];
  independentPractice: LinkedQaItem[];
  reflectionTasks: string[];
  starterQuestions: LinkedQaItem[];
  starterAnswers: LinkedQaItem[];
  worksheetTasks: LinkedQaItem[];
  worksheetAnswers: LinkedQaItem[];
  exitQuestions: LinkedQaItem[];
  exitAnswers: LinkedQaItem[];
  misconceptions: string[];
  teacherNotes: string[];
  sourceMetadata: {
    sourceName?: string | null;
    sourceUrl?: string | null;
    providerHints: string[];
    extractionMeta?: {
      primarySources: Array<{ component: string; fileName: string; reason: string }>;
      guidanceGroups: number;
      excludedFragments: number;
      orphanCorrectAnswers: number;
      questionsMissingAnswers: number;
      autoMarked: number;
      guidedReview: number;
      primaryExtractionSource?: string | null;
      equivalentSourceFiles?: string[];
      equivalenceConfidence?: number;
      playableActivities?: number;
      blockedActivities?: number;
      needsAdminReconstruction?: number;
      incompleteMathExpressions?: number;
      missingVisuals?: number;
      lowConfidenceActivities?: number;
      excludedFromQuestionCount?: number;
      blockedActivitiesDetail?: Array<{
        id: string;
        prompt: string;
        status: string;
        reasons: string[];
        mathExpression?: string | null;
        visualType?: string | null;
      }>;
      adminReconstructionQueue?: Array<{
        activityId: string;
        prompt: string;
        visualType?: string | null;
        sourceFile?: string | null;
        sourceSlideOrPage?: number | null;
        reasons: string[];
      }>;
    };
  };
  licenceMetadata: {
    licenceType?: string | null;
    attribution?: string | null;
  };
};

export type DetectionResult<T> = {
  value: T | null;
  confidence: number;
  evidence: string[];
  warning?: string | null;
};

export type DifficultyDetection = {
  overall: number;
  confidence: number;
  reasons: string[];
  byBlock: Array<{ blockId: string; difficulty: number; reasons: string[] }>;
  byQuestion: Array<{ questionId: string; difficulty: number; reasons: string[] }>;
};

export type ThirdPartyFinding = {
  id: string;
  fileId: string;
  fileName: string;
  pageOrSlide: number | null;
  detectedItem: string;
  riskReason: string;
  recommendedAction: "exclude" | "review";
  action: "exclude" | "include";
};

export type LessonPackDuplicateMatch = {
  level: LessonPackDuplicateLevel;
  matchedContentId?: string | null;
  matchedTopic?: string | null;
  reason: string;
  questionSummary?: QuestionDuplicateSummary | null;
};

export type LessonPackDuplicateReport = {
  level: LessonPackDuplicateLevel;
  label: string;
  matches: LessonPackDuplicateMatch[];
  sourceFingerprint: string;
  blocked: boolean;
  overrideAllowed: boolean;
};

export type LessonPackPreview = {
  lessonGroupId: string;
  title: string;
  subject: Subject | null;
  curriculumArea?: string | null;
  yearGroup: YearGroup | null;
  keyStage: KeyStage | null;
  difficulty: number;
  subjectConfidence: number;
  yearConfidence: number;
  difficultyConfidence: number;
  yearEvidence: string[];
  difficultyReasons: string[];
  subjectEvidence: string[];
  yearWarning?: string | null;
  subjectWarning?: string | null;
  learningObjective: string | null;
  estimatedDurationMinutes: number;
  sessionType: LessonPackSessionType;
  fileClassifications: Array<{
    fileId: string;
    originalName: string;
    classification: LessonPackComponentType;
    confidence: number;
    extractionStatus: string;
    extractionError?: string;
    equivalentGroupId?: string;
    isPrimaryExtractionSource?: boolean;
  }>;
  componentCounts: Record<string, number>;
  questionCount: number;
  answerKeyCount: number;
  qaPairingReport?: {
    questionsFound: number;
    answersPaired: number;
    questionsWithoutAnswers: number;
    answersWithoutQuestions: number;
    teacherGuidanceOnly: number;
  };
  preDraftValidation?: {
    titleQuality: string;
    objectiveQuality: string;
    encodingQuality: string;
    questionAnswerPairing: string;
    playableFirstActivity: string;
    playableAllActivities?: string;
    visualDependency?: string;
    durationQuality: string;
    licenceResult: string;
    thirdPartyResult: string;
    overallReady: boolean;
    issues: string[];
  };
  academicValidation?: AcademicValidationResult;
  duplicateReport: LessonPackDuplicateReport;
  thirdPartyFindings: ThirdPartyFinding[];
  licenceType?: string | null;
  attribution?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  structured: LessonPackStructuredModel;
  starlizDraftItems: Record<string, unknown>[];
  starlizMetadata: Record<string, unknown>;
};

export type LessonPackAnalysisResult = {
  importId?: string;
  status: LessonPackImportStatus;
  files: LessonPackUploadedFile[];
  lessonCount: number;
  lessons: LessonPackPreview[];
  errors: string[];
  partialFailures: Array<{ fileId: string; fileName: string; error: string }>;
};
