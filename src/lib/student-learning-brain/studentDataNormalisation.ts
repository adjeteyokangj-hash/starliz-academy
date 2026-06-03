export type StudentDataState =
  | "new_no_activity"
  | "qlf_completed_no_activity"
  | "active_with_qlf"
  | "active_without_qlf_legacy"
  | "insufficient_evidence"
  | "inconsistent_profile_needs_review";

export type StudentDataNormalisationInput = {
  attemptsCount: number;
  progressRecordsCount: number;
  assignmentsCount: number;
  weakAreasCount: number;
  sessionCount: number;
  hasQuickLevelFinderCompleted: boolean;
  hasQuickLevelFinderSession: boolean;
  hasQuickLevelFinderPlacementSignal: boolean;
  hasAcademicSnapshot: boolean;
  hasLearningDna: boolean;
  createdAt?: string | null;
};

export type StudentDataNormalisationResult = {
  state: StudentDataState;
  checklistStatus: "pass" | "warning" | "fail";
  headline: string;
  detail: string;
  reviewRecommended: boolean;
};

const LEGACY_ACTIVITY_FLOOR = 3;
const LEGACY_AGE_DAYS = 2;

function normalizeCount(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function ageDays(createdAt: string | null | undefined): number | null {
  if (!createdAt) return null;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return null;
  return Math.max(0, Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24)));
}

export function classifyStudentDataState(input: StudentDataNormalisationInput): StudentDataNormalisationResult {
  const attemptsCount = normalizeCount(input.attemptsCount);
  const progressRecordsCount = normalizeCount(input.progressRecordsCount);
  const assignmentsCount = normalizeCount(input.assignmentsCount);
  const weakAreasCount = normalizeCount(input.weakAreasCount);
  const sessionCount = normalizeCount(input.sessionCount);

  const hasActivity = attemptsCount > 0 || progressRecordsCount > 0 || sessionCount > 0;
  const hasStrongActivity = attemptsCount + progressRecordsCount >= LEGACY_ACTIVITY_FLOOR;
  const hasSignals = assignmentsCount > 0 || weakAreasCount > 0 || input.hasAcademicSnapshot || input.hasLearningDna || input.hasQuickLevelFinderPlacementSignal;
  const createdAgeDays = ageDays(input.createdAt ?? null);
  const olderProfile = createdAgeDays !== null && createdAgeDays >= LEGACY_AGE_DAYS;

  if (!hasActivity && !input.hasQuickLevelFinderCompleted && !hasSignals) {
    return {
      state: "new_no_activity",
      checklistStatus: "fail",
      headline: "New profile not started",
      detail: "No Quick Level Finder completion and no learning activity yet.",
      reviewRecommended: false,
    };
  }

  if (!hasActivity && input.hasQuickLevelFinderCompleted) {
    return {
      state: "qlf_completed_no_activity",
      checklistStatus: "warning",
      headline: "Baseline complete, activity pending",
      detail: "Quick Level Finder is complete but lesson or quiz activity has not started yet.",
      reviewRecommended: false,
    };
  }

  if (hasActivity && input.hasQuickLevelFinderCompleted) {
    return {
      state: "active_with_qlf",
      checklistStatus: "pass",
      headline: "Active learner with baseline",
      detail: "Quick Level Finder and learning activity are both present.",
      reviewRecommended: false,
    };
  }

  if (hasActivity && !input.hasQuickLevelFinderCompleted) {
    if (input.hasQuickLevelFinderSession && !input.hasQuickLevelFinderPlacementSignal && !input.hasAcademicSnapshot && !input.hasLearningDna) {
      return {
        state: "inconsistent_profile_needs_review",
        checklistStatus: "warning",
        headline: "Profile state needs review",
        detail: "Activity exists but Quick Level Finder evidence appears incomplete or inconsistent.",
        reviewRecommended: true,
      };
    }

    if (hasStrongActivity || hasSignals || olderProfile) {
      return {
        state: "active_without_qlf_legacy",
        checklistStatus: "warning",
        headline: "Legacy active profile",
        detail: "Learner is active without completed Quick Level Finder. Treat as legacy/bypassed onboarding and review optionally.",
        reviewRecommended: true,
      };
    }
  }

  return {
    state: "insufficient_evidence",
    checklistStatus: "warning",
    headline: "Insufficient evidence",
    detail: "Profile has partial data but not enough stable evidence to classify with confidence.",
    reviewRecommended: true,
  };
}
