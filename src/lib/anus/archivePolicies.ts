import type { LifecycleDecision, LifecycleRecordType } from "@/lib/anus/lifecycleContracts";
import { retentionPolicyFor } from "@/lib/anus/retentionPolicies";

export function archiveDecisionFor(recordType: LifecycleRecordType): LifecycleDecision {
  return {
    recordType,
    policy: retentionPolicyFor(recordType),
  };
}

export function canArchive(recordType: LifecycleRecordType): boolean {
  return retentionPolicyFor(recordType).archiveEligible;
}
