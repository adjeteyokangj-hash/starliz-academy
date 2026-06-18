
export type BlackBoxContentDecision = "APPROVE" | "RECLASSIFY" | "REJECT" | "NEEDS_ADMIN_REVIEW";
export type BlackBoxRuntimeStatus = "passed" | "failed" | "needs_review" | "not_run";
export type BlackBoxVerificationDecision = "approve" | "reject" | "reclassify" | "needs_changes" | "send_back";

export type BlackBoxContentItemCheck = {
  itemIndex?: number;
  score?: number;
  maxScore?: number;
  rawScore?: number;
  rawMaxScore?: number;
  passRate?: number;
  declaredLevel?: number;
  estimatedLevel?: number;
  recommendedLevel?: number;
  levelDelta?: number;
  levelRecommendation?: {
    action: "keep" | "promote" | "demote";
    amount: number;
    reason: string;
  };
  reasons?: string[];
  checks?: Record<string, unknown>;
};

export type BlackBoxContentTest = {
  decision: BlackBoxContentDecision;
  score?: number;
  maxScore?: number;
  rawScore?: number;
  rawMaxScore?: number;
  passRate?: number;
  reasons?: string[];
  scoreCap?: {
    capPercent: number;
    reason: string;
    warningItemCount?: number;
    totalItemCount?: number;
  };
  itemChecks?: BlackBoxContentItemCheck[];
  reclassificationRecommendation?: {
    subject?: string | null;
    strand?: string | null;
    keyStage?: string | null;
    yearGroup?: string | null;
    level?: number | null;
    reasons?: string[];
  } | null;
};

export type BlackBoxRuntimeTest = {
  status: BlackBoxRuntimeStatus;
  score?: number;
  reasons?: string[];
  simulatedAttempts?: number;
  hintChecks?: string[];
  masteryChecks?: string[];
  flowChecks?: string[];
  testedAt?: string | null;
};

export type BlackBoxAdminVerification = {
  status: "verified" | "rejected" | "needs_changes" | "pending";
  decision?: BlackBoxVerificationDecision;
  notes?: string | null;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  reclassification?: {
    subject?: string | null;
    strand?: string | null;
    keyStage?: string | null;
    yearGroup?: string | null;
    level?: number | null;
  } | null;
  /** Original machine Black Box decision before admin review (Part 4) */
  originalBlackBoxDecision?: string | null;
  /** Original machine Black Box score before admin review (Part 4) */
  originalBlackBoxScore?: number | null;
};

export type BlackBoxStaleState = {
  isStale: boolean;
  reason?: string | null;
  staleAt?: string | null;
};

export type ContentReviewHistoryEntry = {
  action: string;
  status?: string | null;
  score?: number | null;
  decision?: string | null;
  notes?: string | null;
  actor?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown>;
  /** Which question was being reviewed when this action was taken (Part 3) */
  questionIndex?: number | null;
  /** Short preview of the question text at the time of review (Part 3) */
  questionPreview?: string | null;
  /** Stable item/question ID if available (Part 3) */
  itemId?: string | null;
  /** Parent content batch ID (Part 3) */
  contentId?: string | null;
  /** Parent content title (Part 3) */
  contentTitle?: string | null;
  /** Content subject at time of review (Part 3) */
  subject?: string | null;
  /** Strand/topic/learning focus (Part 3) */
  strandTopic?: string | null;
  /** Year group at time of review (Part 3) */
  yearGroup?: string | null;
  /** Key stage at time of review (Part 3) */
  keyStage?: string | null;
  /** Level/difficulty at time of review (Part 3) */
  level?: number | null;
  /** Exam board at time of review (Part 3) */
  examBoard?: string | null;
  /** Black Box machine decision at time of review (Part 3) */
  blackBoxDecision?: string | null;
  /** Black Box machine score at time of review (Part 3) */
  blackBoxScore?: number | null;
};

export type ContentReviewQueueBucket = "awaiting_review" | "reclassified" | "rejected" | "approved" | "published";
export type ContentItem = {
  id: string;
  contentType: string;
  level: number;
  topic: string;
  contentJson: string;
  usedCount: number;
  createdAt: string;
  createdBy: string;
  status: string;
  model?: string | null;
  prompt?: string | null;
  keyStage?: string | null;
  yearGroup?: string | null;
  skillFocus?: string | null;
  metadataJson?: string | null;
};

export type StudentOption = {
  id: string;
  name: string;
  age?: number | null;
  yearGroup?: string | null;
  keyStageLevel?: string | null;
  curriculumPathway?: string | null;
  learningLevel?: string | null;
  placementLevels?: Record<string, { accuracy: number; level: "below" | "secure" | "advanced" }>;
  examBoard?: string | null;
  classGroup?: string | null;
  classGroups?: string[];
  parentName?: string | null;
  subjectFocus?: string | null;
  weakPatterns?: string[];
  schoolIds?: string[];
};

export type ContentSummary = {
  valid: boolean;
  itemCount: number;
  preview: string;
  totalSlots?: number;
  filledSlots?: number;
  missingSlots?: number;
  isSessionComplete?: boolean;
  slotValidationExempt?: boolean;
};

export type ContentMeta = {
  title: string;
  subject: string;
  keyStage: string | null;
  yearGroup: string | null;
  curriculumPathway: string | null;
  examBoard: string | null;
  ageGroup: string | null;
  topic: string | null;
  skillFocus: string | null;
  schoolId: string | null;
};

export type StudentAssignmentCandidate = {
  student: StudentOption;
  hardEligible: boolean;
  hardBlockReason: string | null;
  warningReason: string | null;
  recommendationLevel: "recommended" | "eligible_manual";
  recommendationReason: string;
  matchedWeakAreas: string[];
  recommendationScore: number;
  /** True when the candidate is normally hard-blocked but can be assigned via admin override */
  overrideEligible?: boolean;
  /** The override-able block reason (year/ks/age mismatch) — present when overrideEligible=true */
  overrideBlockReason?: string | null;
};

export type AssignmentPayload = {
  count?: number;
  error?: string;
  allDuplicates?: boolean;
  blocked?: Array<{
    studentId: string;
    reason: string;
    schoolName?: string;
    code?: string;
    assignmentId?: string;
  }>;
  adminOverride?: boolean;
  overrideReason?: string;
};

export type AssignMode = "recommended" | "eligible_manual";

export type SortMode = "newest" | "oldest" | "most-used" | "recently-assigned";
export type ViewMode = "grid" | "list";
