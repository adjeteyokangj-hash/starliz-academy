export type LifecycleCategory = "permanent" | "long_term" | "medium_term" | "short_term" | "disposable";

export type LifecycleRecordType =
  | "certificates"
  | "achievements"
  | "audit_records"
  | "safeguarding_records"
  | "issued_awards"
  | "mastery_history"
  | "progression_history"
  | "placement_history"
  | "exam_history"
  | "coach_conversations"
  | "catch_up_tasks"
  | "interventions"
  | "recommendations"
  | "temporary_signals"
  | "temporary_notifications"
  | "processing_queues"
  | "transient_workflow_state"
  | "cache"
  | "generated_temporary_artifacts"
  | "rebuildable_graph_snapshots";

export type LifecyclePolicy = {
  category: LifecycleCategory;
  retentionDays: number | null;
  archiveEligible: boolean;
  disposable: boolean;
  automaticPurgeEnabled: false;
  rationale: string;
};

export type LifecycleDecision = {
  recordType: LifecycleRecordType;
  policy: LifecyclePolicy;
};
