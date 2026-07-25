/**
 * Assessment & Misconception Analytics v1 — typed read contract.
 *
 * Closed layers (Human Tutor Queue & Sessions v1): READ-ONLY.
 * Consume session metadata via parseSessionMetadata; do not change writers,
 * budgets, assignment/acceptance, guidance one-way rules, or eligibility.
 */

export const MISCONCEPTION_ANALYTICS_VERSION = 1 as const;

export type MisconceptionSignalSource =
  | "attempt_pattern"
  | "learning_dna"
  | "ai_help"
  | "human_notes"
  | "unresolved_report"
  | "spelling_mistake";

export type MisconceptionEvidenceRef = {
  kind:
    | "attempt"
    | "coach_interaction"
    | "human_support_session"
    | "learning_dna"
    | "word_progress"
    | "unresolved_report";
  id: string;
};

export type MisconceptionSignal = {
  studentId: string;
  subject: string;
  skillFocus: string;
  stage?: string | null;
  source: MisconceptionSignalSource;
  /** Free-text hypothesis or teacher label when available. */
  text: string | null;
  /** Coarse machine key when structured codes are unavailable. */
  code: string | null;
  confidence: number;
  evidenceRefs: MisconceptionEvidenceRef[];
  detectedAt: string;
  metadata?: Record<string, unknown>;
};

export type MisconceptionSourceCount = {
  source: MisconceptionSignalSource;
  count: number;
};

export type MisconceptionSkillBucket = {
  subject: string;
  skillFocus: string;
  signalCount: number;
  sources: MisconceptionSignalSource[];
  sampleText: string | null;
};

export type HumanOutcomeLink = {
  sessionId: string;
  studentId: string;
  outcome: string;
  outcomeLabel: string;
  misconception: string | null;
  remainingDifficulty: string | null;
  endedAt: string | null;
};

export type MisconceptionStudentSummary = {
  studentId: string;
  studentName?: string | null;
  signalCount: number;
  bySource: MisconceptionSourceCount[];
  topSkills: MisconceptionSkillBucket[];
  signals: MisconceptionSignal[];
  needsMonitoringSessionCount: number;
  unresolvedSessionCount: number;
  escalatedSessionCount: number;
};

export type MisconceptionCohortSummary = {
  version: typeof MISCONCEPTION_ANALYTICS_VERSION;
  generatedAt: string;
  schoolId?: string | null;
  windowDays: number;
  studentCount: number;
  totalSignals: number;
  bySource: MisconceptionSourceCount[];
  topSkills: MisconceptionSkillBucket[];
  students: MisconceptionStudentSummary[];
  humanOutcomeLinks: HumanOutcomeLink[];
};

/** Raw inputs for pure aggregators (fixtures / DB loaders). */
export type AttemptPatternInput = {
  id: string;
  studentId: string;
  subject: string;
  skillFocus: string;
  correct: boolean;
  questionText: string | null;
  answerGiven: string | null;
  hintsUsed: number;
  createdAt: string;
};

export type AiHelpTurnInput = {
  id: string;
  studentId: string;
  subject: string;
  skillFocus: string | null;
  questionText: string | null;
  hintLevel: number;
  mode: string | null;
  createdAt: string;
};

export type HumanSessionInput = {
  id: string;
  studentId: string;
  outcome: string | null;
  outcomeNotes: string | null;
  unresolvedReportJson: string | null;
  metadataJson: string | null;
  endedAt: string | null;
  startedAt: string;
};

export type LearningDnaInput = {
  studentId: string;
  aiLearningProfileJson: string | null;
};

export type SpellingMistakeInput = {
  id: string;
  studentId: string;
  word: string;
  mistakeType: string | null;
  status: string;
  attempts: number;
  correctCount: number;
  lastSeen: string;
};

export type AggregateMisconceptionInput = {
  attempts: AttemptPatternInput[];
  aiHelpTurns: AiHelpTurnInput[];
  humanSessions: HumanSessionInput[];
  learningDna: LearningDnaInput[];
  spellingMistakes: SpellingMistakeInput[];
  studentNames?: Record<string, string>;
  nowIso?: string;
  windowDays?: number;
  schoolId?: string | null;
};
