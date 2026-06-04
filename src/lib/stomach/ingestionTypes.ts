export type IngestionSignalStatus = "ready" | "warning" | "informational" | "missing";

export type IngestionSource =
  | "platform_attempt"
  | "platform_assignment"
  | "platform_weak_area"
  | "platform_student_skill"
  | "platform_homework"
  | "platform_coach_usage"
  | "document_ingestion"
  | "profile_snapshot"
  | "unknown";

export type IngestionEvidenceType =
  | "attempt_outcome"
  | "assignment_status"
  | "weak_area_signal"
  | "skill_snapshot"
  | "homework_signal"
  | "coach_support_signal"
  | "document_note"
  | "onboarding_profile"
  | "unknown";

export type IngestionRecommendedAction =
  | "monitor"
  | "review_signal"
  | "ingest_more_evidence"
  | "request_document_quality"
  | "sync_to_brain"
  | "escalate_for_admin_review";

export type IngestionSignal = {
  id: string;
  studentId: string | null;
  source: IngestionSource;
  evidenceType: IngestionEvidenceType;
  status: IngestionSignalStatus;
  confidence: number;
  warningCodes: string[];
  summary: string;
  recommendedNextAction: IngestionRecommendedAction;
  observedAt: string | null;
  metadata?: Record<string, unknown>;
};

export type IngestionMonitoringCounts = {
  totalStudents: number;
  studentsWithProfiles: number;
  studentsWithRecentAttempts: number;
  activeWeakAreas: number;
  activeAssignments: number;
  queuedIngestionJobs: number;
  latestEvidenceAt: string | null;
};

export type IngestionHealthStatus = "healthy" | "warning" | "informational";

export type IngestionHealthMetrics = {
  status: IngestionHealthStatus;
  score: number;
  profileCoveragePercent: number;
  activeEvidenceCoveragePercent: number;
  warnings: string[];
  recommendedNextAction: IngestionRecommendedAction;
  summary: string;
  generatedAt: string;
};

export type StomachPipelineSummary = {
  totalSignals: number;
  byStatus: Record<IngestionSignalStatus, number>;
  averageConfidence: number;
  warnings: string[];
  generatedAt: string;
};

export type StomachIngestionOutput = {
  decisionBoundary: "digest_only";
  signals: IngestionSignal[];
  summary: StomachPipelineSummary;
};
