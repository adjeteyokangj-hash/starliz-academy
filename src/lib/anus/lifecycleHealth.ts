import type { LifecycleRecordType } from "@/lib/anus/lifecycleContracts";
import { retentionPolicyFor } from "@/lib/anus/retentionPolicies";

export type LifecycleHealthStatus = "healthy" | "warning" | "informational";

export type LifecycleMonitoringCounts = {
  totalStudents: number;
  archivedStudents: number;
  softDeletedStudents: number;
  recordsUnderLegalHold: number;
  recordsPendingReview: number;
  overdueRetentionRecords: number;
  recoveryAuditEntriesLast30Days: number;
};

export type LifecycleHealthMetrics = {
  status: LifecycleHealthStatus;
  score: number;
  warnings: string[];
  summary: string;
  recommendedNextAction: string;
  retentionCoveragePercent: number;
  generatedAt: string;
};

export type RecordTypeRetentionSummary = {
  recordType: LifecycleRecordType;
  category: string;
  retentionDays: number | null;
  archiveEligible: boolean;
  disposable: boolean;
  automaticPurgeEnabled: false;
};

export function buildRetentionSummary(): RecordTypeRetentionSummary[] {
  const recordTypes: LifecycleRecordType[] = [
    "certificates",
    "achievements",
    "audit_records",
    "safeguarding_records",
    "issued_awards",
    "mastery_history",
    "progression_history",
    "placement_history",
    "exam_history",
    "coach_conversations",
    "catch_up_tasks",
    "interventions",
    "recommendations",
    "temporary_signals",
    "temporary_notifications",
    "processing_queues",
    "transient_workflow_state",
    "cache",
    "generated_temporary_artifacts",
    "rebuildable_graph_snapshots",
  ];

  return recordTypes.map((recordType) => {
    const policy = retentionPolicyFor(recordType);
    return {
      recordType,
      category: policy.category,
      retentionDays: policy.retentionDays,
      archiveEligible: policy.archiveEligible,
      disposable: policy.disposable,
      automaticPurgeEnabled: false,
    };
  });
}

export function buildLifecycleHealthMetrics(counts: LifecycleMonitoringCounts): LifecycleHealthMetrics {
  const generatedAt = new Date().toISOString();
  const warnings: string[] = [];

  if (counts.totalStudents === 0) {
    return {
      status: "informational",
      score: 100,
      warnings: [],
      summary: "No active students. Lifecycle engine is safely idle without false alarms.",
      recommendedNextAction: "monitor",
      retentionCoveragePercent: 100,
      generatedAt,
    };
  }

  const retentionCoveragePercent = counts.totalStudents > 0
    ? Math.round(((counts.totalStudents - counts.softDeletedStudents) / counts.totalStudents) * 100)
    : 100;

  if (counts.overdueRetentionRecords > 0) warnings.push("overdue_retention_records");
  if (counts.recordsPendingReview > Math.max(3, Math.floor(counts.totalStudents * 0.1))) warnings.push("pending_review_backlog_high");
  if (counts.recordsUnderLegalHold > 0 && counts.recoveryAuditEntriesLast30Days === 0) warnings.push("legal_hold_records_without_recent_audit");

  const penalty = warnings.length * 15;
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const status: LifecycleHealthStatus = warnings.length === 0 ? "healthy" : "warning";

  const summary = warnings.length === 0
    ? "Lifecycle, archive, and retention signals are healthy. No overdue or unreviewed records detected."
    : `Lifecycle has ${warnings.length} warning(s): ${warnings.join(", ")}.`;

  const recommendedNextAction = warnings.length === 0
    ? "monitor"
    : warnings.includes("overdue_retention_records")
      ? "review_overdue_retention_records"
      : "review_lifecycle_backlog";

  return {
    status,
    score,
    warnings,
    summary,
    recommendedNextAction,
    retentionCoveragePercent,
    generatedAt,
  };
}
