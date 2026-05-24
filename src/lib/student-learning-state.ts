export type StudentLearningStage =
  | "NEW"
  | "SUBJECT_SELECTION"
  | "PLACEMENT_PENDING"
  | "ASSESSING"
  | "LEARNING"
  | "RECOVERY"
  | "MASTERY";

export const MIN_ATTEMPTS_FOR_COACH = 5;
export const MIN_WORDS_FOR_SPELLING_ANALYSIS = 20;
export const MIN_READING_INTERACTIONS = 3;
export const MIN_SPEECH_SAMPLES = 2;

export type StudentLearningState = {
  isFirstTimeStudent: boolean;
  hasAssignments: boolean;
  hasChosenSubjects: boolean;
  hasCompletedPlacement: boolean;
  hasAssessmentData: boolean;
  hasWeakAreas: boolean;
  hasMasteryData: boolean;
  onboardingStage: StudentLearningStage;
  coachUnlocked: boolean;
  aiSignalsReady: boolean;
  evidence: {
    assignmentCount: number;
    skillAttempts: number;
    progressEvents: number;
    weakAreaCount: number;
    masteredSkills: number;
    spellingAttempts: number;
    readingAttempts: number;
    speechSamples: number;
    placementResponses: number;
  };
  integrityWarnings: string[];
};

type DeriveStateInput = {
  assignmentCount: number;
  selectedSubjects: string[];
  skillAttempts: number;
  progressEvents: number;
  weakAreaCount: number;
  masteredSkills: number;
  spellingAttempts: number;
  readingAttempts: number;
  speechSamples: number;
  placementResponses?: number;
  placementCompleted?: boolean;
};

function asCount(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function parseSubjectFocus(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,|;]/g)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function parseSelectedSubjectsFromProfileJson(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const selected = parsed.selectedParentSubjects;
    if (!Array.isArray(selected)) return [];
    return selected
      .map((entry) => String(entry).trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function parseQuickLevelFinderSummary(raw: string | null | undefined): {
  hasSession: boolean;
  completed: boolean;
  responseCount: number;
} {
  if (!raw) {
    return { hasSession: false, completed: false, responseCount: 0 };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const quick = parsed.quickLevelFinder;
    if (!quick || typeof quick !== "object" || Array.isArray(quick)) {
      return { hasSession: false, completed: false, responseCount: 0 };
    }
    const session = quick as Record<string, unknown>;
    const responses = Array.isArray(session.responses) ? session.responses.length : 0;
    const status = session.status;
    return {
      hasSession: true,
      completed: status === "completed",
      responseCount: responses,
    };
  } catch {
    return { hasSession: false, completed: false, responseCount: 0 };
  }
}

export function deriveStudentLearningState(input: DeriveStateInput): StudentLearningState {
  const assignmentCount = asCount(input.assignmentCount);
  const selectedSubjects = input.selectedSubjects.map((value) => value.trim()).filter(Boolean);
  const skillAttempts = asCount(input.skillAttempts);
  const progressEvents = asCount(input.progressEvents);
  const weakAreaCount = asCount(input.weakAreaCount);
  const masteredSkills = asCount(input.masteredSkills);
  const spellingAttempts = asCount(input.spellingAttempts);
  const readingAttempts = asCount(input.readingAttempts);
  const speechSamples = asCount(input.speechSamples);
  const placementResponses = asCount(input.placementResponses);
  const placementCompleted = input.placementCompleted === true;

  const hasAssignments = assignmentCount > 0;
  const hasChosenSubjects = selectedSubjects.length > 0;
  const hasAssessmentData = skillAttempts > 0 || progressEvents > 0 || placementResponses > 0;
  const hasCompletedPlacement = placementCompleted || skillAttempts >= 3;
  const hasWeakAreas = weakAreaCount > 0;
  const hasMasteryData = masteredSkills > 0;
  const isFirstTimeStudent = !hasAssignments && !hasAssessmentData && !hasCompletedPlacement;

  let onboardingStage: StudentLearningStage;
  if (!hasChosenSubjects) {
    onboardingStage = "SUBJECT_SELECTION";
  } else if (!hasCompletedPlacement) {
    onboardingStage = "PLACEMENT_PENDING";
  } else if (!hasAssessmentData) {
    onboardingStage = "ASSESSING";
  } else if (hasWeakAreas) {
    onboardingStage = "RECOVERY";
  } else if (hasMasteryData && masteredSkills >= 3) {
    onboardingStage = "MASTERY";
  } else {
    onboardingStage = "LEARNING";
  }

  const coachUnlocked = skillAttempts >= MIN_ATTEMPTS_FOR_COACH
    && spellingAttempts >= MIN_WORDS_FOR_SPELLING_ANALYSIS
    && readingAttempts >= MIN_READING_INTERACTIONS
    && speechSamples >= MIN_SPEECH_SAMPLES;

  const aiSignalsReady = hasAssessmentData;

  const integrityWarnings: string[] = [];
  if (!hasAssessmentData && hasWeakAreas) {
    integrityWarnings.push("weak areas without assessments");
  }
  if (!hasAssessmentData && hasMasteryData) {
    integrityWarnings.push("mastery without attempts");
  }
  if (speechSamples === 0 && coachUnlocked) {
    integrityWarnings.push("confidence score without speech sample");
  }
  if (!hasChosenSubjects && hasAssessmentData) {
    integrityWarnings.push("learning profile without subject selection");
  }

  if (isFirstTimeStudent) {
    onboardingStage = hasChosenSubjects ? "PLACEMENT_PENDING" : "NEW";
  }

  return {
    isFirstTimeStudent,
    hasAssignments,
    hasChosenSubjects,
    hasCompletedPlacement,
    hasAssessmentData,
    hasWeakAreas,
    hasMasteryData,
    onboardingStage,
    coachUnlocked,
    aiSignalsReady,
    evidence: {
      assignmentCount,
      skillAttempts,
      progressEvents,
      weakAreaCount,
      masteredSkills,
      spellingAttempts,
      readingAttempts,
      speechSamples,
        placementResponses,
    },
    integrityWarnings,
  };
}

export function logLearningIntegrityWarnings(studentId: string, warnings: string[]): void {
  if (!warnings.length) return;
  console.warn("[student-learning-state] integrity warnings", { studentId, warnings });
}
