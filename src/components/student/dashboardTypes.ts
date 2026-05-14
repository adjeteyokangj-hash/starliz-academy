export type StudentAssignment = {
  id: string;
  status: "assigned" | "in_progress" | "completed" | string;
  subject: string;
  title: string;
  skillFocus?: string | null;
  difficulty?: number;
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
  loading: boolean;
  error: string;
  startingJourney: boolean;
  onStartJourney: () => Promise<void>;
  onStartAssignment: (assignment: StudentAssignment | null) => void;
  onOpenStore: () => void;
};
