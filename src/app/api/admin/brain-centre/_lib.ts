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

export function healthForBrain(input: {
  brain: {
    heartbeatSummary: HeartbeatDecision;
    academicIntelligence: { recommendationSync: RecommendationSyncAudit };
    dataState: Pick<StudentDataNormalisationResult, "checklistStatus">;
  };
  snapshotStatus: "fresh" | "stale" | "missing";
}): BrainHealthStatus {
  const sync = input.brain.academicIntelligence.recommendationSync;
  if (
    input.brain.heartbeatSummary.riskLevel === "critical"
    || sync.status === "blocked"
    || input.brain.dataState.checklistStatus === "fail"
  ) {
    return "critical";
  }
  if (
    input.brain.heartbeatSummary.riskLevel === "high"
    || input.brain.heartbeatSummary.urgency === "critical"
    || input.brain.heartbeatSummary.urgency === "high"
    || sync.status === "warning"
    || input.brain.dataState.checklistStatus === "warning"
    || input.snapshotStatus !== "fresh"
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
