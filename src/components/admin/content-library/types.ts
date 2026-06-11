
export type BlackBoxContentDecision = "APPROVE" | "RECLASSIFY" | "REJECT" | "NEEDS_ADMIN_REVIEW";

export type BlackBoxContentItemCheck = {
  itemIndex?: number;
  score?: number;
  reasons?: string[];
  checks?: Record<string, unknown>;
};

export type BlackBoxContentTest = {
  decision: BlackBoxContentDecision;
  score?: number;
  reasons?: string[];
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
