import type { LifecycleRecordType } from "@/lib/anus/lifecycleContracts";
import { retentionPolicyFor } from "@/lib/anus/retentionPolicies";
import { legalHoldBlocks } from "@/lib/anus/legalHold";

export type ArchiveState = "active" | "archived" | "soft_deleted" | "pending_review" | "under_legal_hold";

export type SoftDeleteEligibility = {
  eligible: boolean;
  blockedBy: Array<"legal_hold" | "retention_policy" | "permanent_record">;
  reason: string;
};

export type RecoveryAuditEntry = {
  id: string;
  recordType: LifecycleRecordType;
  studentId: string | null;
  action: "archive" | "soft_delete" | "restore" | "legal_hold_applied" | "legal_hold_released";
  performedBy: string;
  performedAt: string;
  previousState: ArchiveState;
  newState: ArchiveState;
  notes: string | null;
};

export type ArchiveEngineResult = {
  recordType: LifecycleRecordType;
  archiveState: ArchiveState;
  softDeleteEligibility: SoftDeleteEligibility;
  retentionDaysRemaining: number | null;
  boundaryEnforced: "read_only_determination";
};

export function softDeleteEligibilityFor(
  recordType: LifecycleRecordType,
  lastActivityAt: string | null,
): SoftDeleteEligibility {
  const policy = retentionPolicyFor(recordType);
  const legalBlock = legalHoldBlocks(recordType, "disposal");
  const blockedBy: SoftDeleteEligibility["blockedBy"] = [];

  if (legalBlock) blockedBy.push("legal_hold");
  if (!policy.disposable) blockedBy.push("retention_policy");
  if (policy.retentionDays === null) blockedBy.push("permanent_record");

  if (blockedBy.length > 0) {
    return {
      eligible: false,
      blockedBy,
      reason: `Soft delete blocked by: ${blockedBy.join(", ")}.`,
    };
  }

  if (policy.retentionDays !== null && lastActivityAt) {
    const ageMs = Date.now() - new Date(lastActivityAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays < policy.retentionDays) {
      return {
        eligible: false,
        blockedBy: ["retention_policy"],
        reason: `Retention period of ${policy.retentionDays} days has not elapsed. Record must be kept until then.`,
      };
    }
  }

  return {
    eligible: true,
    blockedBy: [],
    reason: "Record has passed retention window and has no active legal hold. Soft delete is eligible.",
  };
}

export function retentionDaysRemaining(
  recordType: LifecycleRecordType,
  createdAt: string,
): number | null {
  const policy = retentionPolicyFor(recordType);
  if (policy.retentionDays === null) return null;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(policy.retentionDays - ageDays));
}

export function archiveEngineFor(
  recordType: LifecycleRecordType,
  lastActivityAt: string | null,
): ArchiveEngineResult {
  const legalBlock = legalHoldBlocks(recordType, "disposal");
  const softDeleteEligibility = softDeleteEligibilityFor(recordType, lastActivityAt);

  let archiveState: ArchiveState = "active";
  if (legalBlock) archiveState = "under_legal_hold";
  else if (!softDeleteEligibility.eligible) archiveState = "pending_review";

  return {
    recordType,
    archiveState,
    softDeleteEligibility,
    retentionDaysRemaining: lastActivityAt ? retentionDaysRemaining(recordType, lastActivityAt) : null,
    boundaryEnforced: "read_only_determination",
  };
}

export function makeRecoveryAuditEntry(input: {
  id: string;
  recordType: LifecycleRecordType;
  studentId: string | null;
  action: RecoveryAuditEntry["action"];
  performedBy: string;
  performedAt: string;
  previousState: ArchiveState;
  newState: ArchiveState;
  notes?: string | null;
}): RecoveryAuditEntry {
  return {
    id: input.id,
    recordType: input.recordType,
    studentId: input.studentId,
    action: input.action,
    performedBy: input.performedBy,
    performedAt: input.performedAt,
    previousState: input.previousState,
    newState: input.newState,
    notes: input.notes ?? null,
  };
}

export function isArchiveEngineDestructive(): false {
  return false;
}
