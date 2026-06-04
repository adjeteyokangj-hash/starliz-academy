import {
  isAcademicIntelligenceSnapshotStale,
  readAcademicIntelligenceSnapshot,
} from "@/lib/academic-intelligence/snapshot";
import type { HeartbeatDecision, RecommendationSyncAudit } from "@/lib/academic-intelligence/types";
import type { StudentDataNormalisationResult } from "@/lib/student-learning-brain/studentDataNormalisation";

export type BrainHealthStatus = "healthy" | "warning" | "critical";

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
