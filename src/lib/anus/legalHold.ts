import type { LifecycleRecordType } from "@/lib/anus/lifecycleContracts";
import { retentionPolicyFor } from "@/lib/anus/retentionPolicies";

export type LegalHoldStatus = "active" | "released" | "not_applicable";

export type LegalHoldRecord = {
  recordType: LifecycleRecordType;
  studentId: string | null;
  holdStatus: LegalHoldStatus;
  holdReason: string;
  appliedAt: string;
  releasedAt: string | null;
  blocksDisposal: boolean;
  blocksArchive: boolean;
};

export type LegalHoldDecision = {
  recordType: LifecycleRecordType;
  holdStatus: LegalHoldStatus;
  blocksDisposal: boolean;
  blocksArchive: boolean;
  reason: string;
};

const PERMANENT_RECORD_TYPES: ReadonlySet<LifecycleRecordType> = new Set([
  "certificates",
  "achievements",
  "audit_records",
  "safeguarding_records",
  "issued_awards",
]);

export function legalHoldDecisionFor(recordType: LifecycleRecordType): LegalHoldDecision {
  const policy = retentionPolicyFor(recordType);

  if (PERMANENT_RECORD_TYPES.has(recordType)) {
    return {
      recordType,
      holdStatus: "active",
      blocksDisposal: true,
      blocksArchive: false,
      reason: "Permanent record type is subject to inherent legal hold. Disposal is blocked.",
    };
  }

  if (!policy.disposable) {
    return {
      recordType,
      holdStatus: "not_applicable",
      blocksDisposal: false,
      blocksArchive: false,
      reason: "Non-disposable record type. No active legal hold, but manual review is required before any disposal.",
    };
  }

  return {
    recordType,
    holdStatus: "not_applicable",
    blocksDisposal: false,
    blocksArchive: false,
    reason: "Disposable record type. No legal hold applies under current policy.",
  };
}

export function legalHoldBlocks(recordType: LifecycleRecordType, action: "disposal" | "archive"): boolean {
  const decision = legalHoldDecisionFor(recordType);
  return action === "disposal" ? decision.blocksDisposal : decision.blocksArchive;
}

export function makeLegalHoldRecord(input: {
  recordType: LifecycleRecordType;
  studentId: string | null;
  holdReason: string;
  appliedAt: string;
}): LegalHoldRecord {
  const decision = legalHoldDecisionFor(input.recordType);
  return {
    recordType: input.recordType,
    studentId: input.studentId,
    holdStatus: decision.holdStatus === "not_applicable" ? "not_applicable" : "active",
    holdReason: input.holdReason,
    appliedAt: input.appliedAt,
    releasedAt: null,
    blocksDisposal: decision.blocksDisposal,
    blocksArchive: decision.blocksArchive,
  };
}

export function isLegalHoldEngineReadOnly(): true {
  return true;
}
