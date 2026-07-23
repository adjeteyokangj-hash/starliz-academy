/**
 * Brain quality policies — additive contract for honest, explainable intelligence.
 * These do not change write paths or rename existing Brain fields.
 */
export const BRAIN_QUALITY_POLICIES = {
  /** Prefer Attempt → WeakArea → StudentSkill → snapshot over legacy ProgressRecord reconstruction. */
  evidenceSourceRank: ["attempt", "weak_area", "student_skill", "academic_snapshot", "progress_record"] as const,

  /** Minimum attempt+progress rows before legacy-active classification is trusted. */
  legacyActivityFloor: 3,

  /** Profile age (days) used as a soft legacy signal when QLF is missing. */
  legacyAgeDays: 2,

  /** Catch-up recommendations below this attempt support are flagged insufficientData. */
  recommendationMinEvidenceAttempts: 1,

  /** Brain must remain read-only; writes stay in dedicated services. */
  readOnly: true as const,

  /** Recommendations must cite evidence strings when available. */
  requireEvidenceCitations: true as const,

  /** When evidence is thin, prefer insufficient_data honesty over confident advice. */
  honestyOverConfidence: true as const,
} as const;

export type BrainConfidenceBand = "high" | "medium" | "low" | "insufficient";
export type BrainRecommendationHonesty = "ready" | "limited_evidence" | "insufficient_data";

export function confidenceBandForDataState(
  state: string,
  checklistStatus: "pass" | "warning" | "fail",
): BrainConfidenceBand {
  if (state === "active_with_qlf" && checklistStatus === "pass") return "high";
  if (state === "active_without_qlf_legacy" || state === "qlf_completed_no_activity") return "medium";
  if (state === "insufficient_evidence" || state === "inconsistent_profile_needs_review") return "low";
  if (state === "new_no_activity") return "insufficient";
  return checklistStatus === "pass" ? "medium" : "low";
}

export function recommendationHonestyForDataState(
  state: string,
  checklistStatus: "pass" | "warning" | "fail",
): BrainRecommendationHonesty {
  if (state === "new_no_activity" || state === "insufficient_evidence") return "insufficient_data";
  if (checklistStatus === "warning" || state === "qlf_completed_no_activity" || state === "active_without_qlf_legacy") {
    return "limited_evidence";
  }
  return "ready";
}
