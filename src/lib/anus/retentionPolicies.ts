import type { LifecycleCategory, LifecyclePolicy, LifecycleRecordType } from "@/lib/anus/lifecycleContracts";

const CATEGORY_DEFAULTS: Record<LifecycleCategory, Omit<LifecyclePolicy, "rationale">> = {
  permanent: {
    category: "permanent",
    retentionDays: null,
    archiveEligible: true,
    disposable: false,
    automaticPurgeEnabled: false,
  },
  long_term: {
    category: "long_term",
    retentionDays: 3650,
    archiveEligible: true,
    disposable: false,
    automaticPurgeEnabled: false,
  },
  medium_term: {
    category: "medium_term",
    retentionDays: 730,
    archiveEligible: true,
    disposable: false,
    automaticPurgeEnabled: false,
  },
  short_term: {
    category: "short_term",
    retentionDays: 90,
    archiveEligible: true,
    disposable: true,
    automaticPurgeEnabled: false,
  },
  disposable: {
    category: "disposable",
    retentionDays: 30,
    archiveEligible: false,
    disposable: true,
    automaticPurgeEnabled: false,
  },
};

const RECORD_CATEGORY: Record<LifecycleRecordType, LifecycleCategory> = {
  certificates: "permanent",
  achievements: "permanent",
  audit_records: "permanent",
  safeguarding_records: "permanent",
  issued_awards: "permanent",
  mastery_history: "long_term",
  progression_history: "long_term",
  placement_history: "long_term",
  exam_history: "long_term",
  coach_conversations: "medium_term",
  catch_up_tasks: "medium_term",
  interventions: "medium_term",
  recommendations: "medium_term",
  temporary_signals: "short_term",
  temporary_notifications: "short_term",
  processing_queues: "short_term",
  transient_workflow_state: "short_term",
  cache: "disposable",
  generated_temporary_artifacts: "disposable",
  rebuildable_graph_snapshots: "disposable",
};

const CATEGORY_RATIONALE: Record<LifecycleCategory, string> = {
  permanent: "Regulatory, safeguarding, achievement, or audit evidence that must be preserved.",
  long_term: "Long-running learner trajectory evidence used for historical progression intelligence.",
  medium_term: "Operational learning support history retained for continuity and review.",
  short_term: "Temporary runtime evidence retained briefly for support and diagnostics.",
  disposable: "Regenerable artifacts and caches that do not represent canonical intelligence.",
};

export function categoryForRecordType(recordType: LifecycleRecordType): LifecycleCategory {
  return RECORD_CATEGORY[recordType];
}

export function retentionPolicyFor(recordType: LifecycleRecordType): LifecyclePolicy {
  const category = categoryForRecordType(recordType);
  const defaults = CATEGORY_DEFAULTS[category];
  return {
    ...defaults,
    rationale: CATEGORY_RATIONALE[category],
  };
}

export function isAnusRetentionDeterministic(): true {
  return true;
}
