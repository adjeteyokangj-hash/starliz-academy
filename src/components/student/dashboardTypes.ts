export type StudentAssignment = {
  id: string;
  status: "assigned" | "in_progress" | "completed" | string;
  subject: string;
  contentId?: string;
  href?: string;
  title: string;
  skillFocus?: string | null;
  difficulty?: number;
  examBoard?: string | null;
  items?: unknown[];
  updatedAt: string;
};

export type StudentSkill = {
  skill: string;
  status: "weak" | "improving" | "mastered" | string;
  accuracy: number;
};

export type CoachRow = {
  code: string;
  label: string;
  accuracy: number;
  status: string;
};

export type ShopOwnedItem = {
  id: string;
  name: string;
  category: string;
};

export type SessionSummary = {
  learningConfidence: string;
  engagementLevel: string;
  speechConfidence: string;
  frustrationSignals: string;
  dominantMood: string;
};

export type StudentLearningState = {
  isFirstTimeStudent: boolean;
  hasAssignments: boolean;
  hasChosenSubjects: boolean;
  hasCompletedPlacement: boolean;
  hasAssessmentData: boolean;
  hasWeakAreas: boolean;
  hasMasteryData: boolean;
  onboardingStage: "NEW" | "SUBJECT_SELECTION" | "PLACEMENT_PENDING" | "ASSESSING" | "LEARNING" | "RECOVERY" | "MASTERY";
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

export type PlacementLevels = Record<string, {
  accuracy: number;
  level: "below" | "secure" | "advanced";
}>;

export type PlacementLessonRecommendation = {
  scopedSubject: string;
  parentSubject: string;
  strand: string | null;
  subjectLabel: string;
  strandLabel: string | null;
  status: "assigned" | "ready" | "content_needed" | "blocked";
  reason: string;
  accuracy: number;
  levelBand: "below" | "secure" | "advanced";
  level: number;
  levelLabel: string;
  contentId: string | null;
  assignmentId: string | null;
  href: string | null;
  contentStatus: string | null;
  generatorHint: {
    subject: string;
    strand: string | null;
    level: number;
    yearGroup: string | null;
    keyStage: string | null;
    skillFocus: string;
    reason: string;
  } | null;
};

export type PlacementLessonGroup = {
  parentSubject: string;
  label: string;
  recommendations: PlacementLessonRecommendation[];
};

export type DashboardProps = {
  childName: string;
  stats: { stars: number; xp: number; coins: number; streak: number };
  visibleAssignments: StudentAssignment[];
  skills: StudentSkill[];
  coachRows: CoachRow[];
  focusSkill: string;
  weakSkill: string | null;
  strongSkill: string;
  focusAssignment: StudentAssignment | null;
  weakAssignment: StudentAssignment | null;
  reviewAssignment: StudentAssignment | null;
  bossUnlocked: boolean;
  bossPlayedToday: boolean;
  ownedBadges: ShopOwnedItem[];
  sessionSummary: SessionSummary | null;
  learningState?: StudentLearningState | null;
  placementLevels?: PlacementLevels | null;
  placementLessonGroups?: PlacementLessonGroup[];
  placementContentGaps?: PlacementLessonRecommendation[];
  loading: boolean;
  error: string;
  startingJourney: boolean;
  pathway?: "primary" | "ks3" | "gcse";
  allAssignments?: StudentAssignment[];
  onStartJourney: () => Promise<void>;
  onStartAssignment: (assignment: StudentAssignment | null) => void;
  onStartBossBattle?: () => Promise<void>;
  bossLaunching?: boolean;
  onOpenStore: () => void;
  pendingAssignmentId?: string | null;
  openingStore?: boolean;
};
