import {
  isAcademicIntelligenceSnapshotStale,
  readAcademicIntelligenceSnapshot,
} from "@/lib/academic-intelligence/snapshot";
import type { HeartbeatDecision, RecommendationSyncAudit } from "@/lib/academic-intelligence/types";
import type { StudentDataNormalisationResult } from "@/lib/student-learning-brain/studentDataNormalisation";

export type BrainHealthStatus = "healthy" | "warning" | "critical";

export const BRAIN_WARNING_REVIEW_ACTION = "brain_warning_reviewed";
export const BRAIN_WARNING_REVIEW_ENTITY_TYPE = "brain_centre_student";

export type BrainWarningReviewState = {
  status: "reviewed" | "unreviewed" | "changed_since_review";
  fingerprint: string;
  reviewedFingerprint: string | null;
  signalChanged: boolean;
  reviewedAt: string | null;
  reviewedBy: string | null;
  note: string | null;
};

export function snapshotStatus(profileJson: string | null | undefined): {
  status: "fresh" | "stale" | "missing";
  lastCalculatedAt: string | null;
} {
  const snapshot = readAcademicIntelligenceSnapshot(profileJson ?? null);
  if (!snapshot) return { status: "missing", lastCalculatedAt: null };
  if (isAcademicIntelligenceSnapshotStale(snapshot)) {
    return { status: "stale", lastCalculatedAt: snapshot.lastCalculatedAt };
  }
  return { status: "fresh", lastCalculatedAt: snapshot.lastCalculatedAt };
}

export type BrainEvidenceSufficiency = "sufficient" | "limited" | "insufficient";

export function evidenceSufficiencyForBrain(input: {
  dataState: Pick<StudentDataNormalisationResult, "state" | "checklistStatus" | "recommendationHonesty">;
  attemptsCount?: number;
}): BrainEvidenceSufficiency {
  const honesty = input.dataState.recommendationHonesty;
  if (
    honesty === "insufficient_data"
    || input.dataState.state === "new_no_activity"
    || input.dataState.state === "insufficient_evidence"
  ) {
    return "insufficient";
  }
  if (
    honesty === "limited_evidence"
    || (typeof input.attemptsCount === "number" && input.attemptsCount === 0)
    || input.dataState.checklistStatus === "warning"
  ) {
    return "limited";
  }
  return "sufficient";
}

export function cappedHeartbeatSeverity(
  riskLevel: HeartbeatDecision["riskLevel"],
  sufficiency: BrainEvidenceSufficiency,
): HeartbeatDecision["riskLevel"] {
  if (sufficiency === "insufficient") {
    if (riskLevel === "critical" || riskLevel === "high") return "medium";
    if (riskLevel === "medium") return "low";
    return "low";
  }
  if (sufficiency === "limited") {
    if (riskLevel === "critical") return "high";
    return riskLevel;
  }
  return riskLevel;
}

export function cappedHeartbeatUrgency(
  urgency: HeartbeatDecision["urgency"],
  sufficiency: BrainEvidenceSufficiency,
): HeartbeatDecision["urgency"] {
  if (sufficiency === "insufficient") {
    if (urgency === "critical" || urgency === "high") return "medium";
    if (urgency === "medium") return "low";
    return "low";
  }
  if (sufficiency === "limited") {
    if (urgency === "critical") return "high";
    return urgency;
  }
  return urgency;
}

export function healthForBrain(input: {
  brain: {
    heartbeatSummary: HeartbeatDecision;
    academicIntelligence: { recommendationSync: RecommendationSyncAudit };
    dataState: Pick<StudentDataNormalisationResult, "state" | "checklistStatus" | "recommendationHonesty">;
    source?: { attempts?: unknown[] };
  };
  snapshotStatus: "fresh" | "stale" | "missing";
}): BrainHealthStatus {
  const sync = input.brain.academicIntelligence.recommendationSync;
  const sufficiency = evidenceSufficiencyForBrain({
    dataState: input.brain.dataState,
    attemptsCount: input.brain.source?.attempts?.length,
  });
  const displayRisk = cappedHeartbeatSeverity(input.brain.heartbeatSummary.riskLevel, sufficiency);
  const displayUrgency = cappedHeartbeatUrgency(input.brain.heartbeatSummary.urgency, sufficiency);
  // Hard blockers stay critical; thin-evidence heartbeat alone does not.
  if (sync.status === "blocked" || input.brain.dataState.checklistStatus === "fail") {
    return "critical";
  }
  if (displayRisk === "critical") {
    return "critical";
  }
  if (
    displayRisk === "high"
    || displayUrgency === "critical"
    || displayUrgency === "high"
    || sync.status === "warning"
    || input.brain.dataState.checklistStatus === "warning"
    || input.snapshotStatus !== "fresh"
    || sufficiency !== "sufficient"
  ) {
    return "warning";
  }
  return "healthy";
}

export function heartbeatNeedsAdminVisibility(brain: { heartbeatSummary: HeartbeatDecision }): boolean {
  const heartbeat = brain.heartbeatSummary;
  if (heartbeat.riskLevel === "critical" || heartbeat.riskLevel === "high") return true;
  if (heartbeat.urgency === "critical" || heartbeat.urgency === "high") return true;
  return heartbeat.primaryAction !== "advance_student" && heartbeat.primaryAction !== "maintain_level";
}

function stableHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) + value.charCodeAt(index);
    hash &= 0xffffffff;
  }
  return Math.abs(hash).toString(36);
}

export function buildBrainWarningFingerprint(input: {
  studentId: string;
  heartbeat: Pick<HeartbeatDecision, "primaryAction" | "riskLevel" | "urgency" | "suggestedNextStep">;
  recommendationSync: Pick<RecommendationSyncAudit, "status" | "action" | "mismatches">;
  dataState: Pick<StudentDataNormalisationResult, "state" | "checklistStatus">;
  snapshotStatus: "fresh" | "stale" | "missing";
}): string {
  const mismatchEngines = input.recommendationSync.mismatches
    .map((mismatch) => mismatch.engine)
    .sort()
    .join(",");
  const raw = [
    `student:${input.studentId}`,
    `heartbeat:${input.heartbeat.primaryAction}:${input.heartbeat.riskLevel}:${input.heartbeat.urgency}:${input.heartbeat.suggestedNextStep}`,
    `sync:${input.recommendationSync.status}:${input.recommendationSync.action}:${input.recommendationSync.mismatches.length}:${mismatchEngines}`,
    `data:${input.dataState.state}:${input.dataState.checklistStatus}`,
    `snapshot:${input.snapshotStatus}`,
  ].join("|");
  return `brain-warning-${stableHash(raw)}`;
}

export function parseBrainWarningReviewState(input: {
  fingerprint: string;
  review: {
    actorUserId: string | null;
    createdAt: Date | string;
    metadataJson: string | null;
  } | null;
}): BrainWarningReviewState {
  if (!input.review) {
    return {
      status: "unreviewed",
      fingerprint: input.fingerprint,
      reviewedFingerprint: null,
      signalChanged: false,
      reviewedAt: null,
      reviewedBy: null,
      note: null,
    };
  }

  let note: string | null = null;
  let reviewedFingerprint: string | null = null;
  try {
    const metadata = input.review.metadataJson ? JSON.parse(input.review.metadataJson) as Record<string, unknown> : {};
    note = typeof metadata.note === "string" && metadata.note.trim() ? metadata.note : null;
    reviewedFingerprint = typeof metadata.warningFingerprint === "string" ? metadata.warningFingerprint : null;
  } catch {
    note = null;
    reviewedFingerprint = null;
  }
  const signalChanged = Boolean(reviewedFingerprint && reviewedFingerprint !== input.fingerprint);

  return {
    status: signalChanged ? "changed_since_review" : "reviewed",
    fingerprint: input.fingerprint,
    reviewedFingerprint,
    signalChanged,
    reviewedAt: new Date(input.review.createdAt).toISOString(),
    reviewedBy: input.review.actorUserId,
    note,
  };
}
