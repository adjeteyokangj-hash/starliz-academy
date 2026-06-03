import type { LifecycleRecordType } from "@/lib/anus/lifecycleContracts";
import { retentionPolicyFor } from "@/lib/anus/retentionPolicies";

export function disposalEligibilityFor(recordType: LifecycleRecordType): {
  disposable: boolean;
  automaticPurgeEnabled: false;
  reason: string;
} {
  const policy = retentionPolicyFor(recordType);
  return {
    disposable: policy.disposable,
    automaticPurgeEnabled: false,
    reason: policy.disposable
      ? "Record can be disposed manually or by future supervised workflows."
      : "Record is retained or archived under lifecycle policy.",
  };
}

export function hasAutomaticPurge(): false {
  return false;
}
