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
  ageGroup: string | null;
  topic: string | null;
  skillFocus: string | null;
  schoolId: string | null;
};

export type StudentAssignmentCandidate = {
  student: StudentOption;
  hardEligible: boolean;
  hardBlockReason: string | null;
  recommendationLevel: "recommended" | "eligible_manual";
  recommendationReason: string;
  matchedWeakAreas: string[];
  recommendationScore: number;
};

export type AssignmentPayload = {
  count?: number;
  error?: string;
  blocked?: Array<{
    studentId: string;
    reason: string;
    schoolName?: string;
    code?: string;
  }>;
};

export type AssignMode = "recommended" | "eligible_manual";

export type SortMode = "newest" | "oldest" | "most-used" | "recently-assigned";
export type ViewMode = "grid" | "list";
