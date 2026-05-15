// ─────────────────────────────────────────────────────────────────────────────
// Smart Coach — shared types
// ─────────────────────────────────────────────────────────────────────────────

export type CoachSubject = "maths" | "reading" | "spelling" | "science" | "english";

/** What style of coaching the engine selects for this interaction. */
export type CoachMode =
  | "hint"             // Hint 1: small, single nudge only — no working shown
  | "guided_steps"     // Hint 2: one interactive question before next step
  | "full_walkthrough" // Hint 3: partial working + interactive checkpoint
  | "mistake_recovery" // Student answered wrong — targeted misconception fix
  | "reveal";          // Hint 4: full worked answer shown (last resort)

/**
 * Age band — governs vocabulary, visual aid density, formality, and
 * how much reasoning is made explicit.
 */
export type AgeBand =
  | "foundation" // Reception–Y2 (age 4–7): visual, playful, count-based
  | "primary"    // Y3–Y6 (age 7–11): method building, reasoning patterns
  | "secondary"  // Y7–Y9 (age 11–14): structured algebra, multi-step
  | "gcse";      // Y10–Y11 (age 14–16): exam technique, misconceptions

/** Detected learning behaviour on this question. */
export type MasterySignal =
  | "confident"    // fast, unaided correct answer
  | "understanding" // correct with light support
  | "memorising"   // correct but slow + multiple hints
  | "guessing";    // answer revealed then confirmed

/** Longer-term mastery stage for a skill path. */
export type MasteryLevel =
  | "new"
  | "practising"
  | "developing"
  | "confident"
  | "mastered";

/** What the student appears to be doing cognitively in this interaction. */
export type LearningIntent =
  | "seeking_guidance"
  | "building_understanding"
  | "developing_understanding"
  | "misconception_risk"
  | "guessing_risk"
  | "independent_reasoning";

/** Explicit strategy object that controls tutoring behaviour for this turn. */
export type CoachStrategy = {
  subject: CoachSubject;
  ageBand: AgeBand;
  yearGroup?: number;
  hintLevel: number;
  confidenceLevel: number;
  weaknessHistory: string[];
  hintUsage: number;
  retryCount: number;
  responseSpeed: "fast" | "steady" | "slow";
  struggleScore: number; // 0-1
  learningIntent: LearningIntent;
  masteryLevel: MasteryLevel;
  teachingStyle:
    | "visual_scaffold"
    | "guided_reasoning"
    | "interactive_questioning"
    | "exam_technique"
    | "pattern_practice";
  adaptationSummary: string;
};

/**
 * All the information the coach engine needs to produce a response.
 * Serialisable — safe to pass over an API boundary.
 */
export type CoachContext = {
  subject: CoachSubject;
  question: string;         // exact question / equation text
  correctAnswer: string;    // expected answer as a string
  studentAnswer?: string;   // what the student submitted (if incorrect)
  passageText?: string;     // reading passages — the surrounding text
  hintCount: number;        // hints already consumed THIS question (0 = first)
  attemptCount: number;     // wrong attempts on this question
  ageBand: AgeBand;
  yearGroup?: number;       // 1–11
  skillFocus?: string;      // e.g. "linear_equations", "phonics_blends"
  confidenceScore: number;  // 0–1 from coaching memory
  weakSkills?: string[];    // known weak areas from progress tracking
  /** Time the student spent on this question before asking for help, in ms. */
  responseTimeMs?: number;
};

/** One visible line of algebraic / logical working. */
export type CoachStep = {
  expression: string;  // e.g. "2x + 3 − 3 = 11 − 3"
  explanation: string; // e.g. "Subtract 3 from both sides"
};

/**
 * An interactive micro-question embedded inside a coaching response.
 * Forces the student to think before the coach moves on.
 */
export type CoachFollowUp = {
  question: string;
  options: string[];
  correctIndex: number;
  onCorrect: string;  // coaching response when student selects the right option
  onWrong: string;    // targeted misconception correction when wrong
};

/** Full structured coaching response — returned by engine and API. */
export type CoachResponse = {
  mode: CoachMode;
  ageBand: AgeBand;
  message: string;               // the main tutor message
  steps: CoachStep[];            // visual step-by-step working
  followUp: CoachFollowUp | null; // interactive checkpoint (null for hint 1)
  hintLevel: number;             // 1–4
  shouldReveal: boolean;         // true only at hint 4 (last resort)
  reinforcementNote: string;     // exam tip / memory peg / encouragement
  tryAgainPrompt: string | null; // shown after reveal: "now try a similar one"
  masterySignal: MasterySignal | null;
  /** Short empathetic opening line shown above the main coaching message. */
  emotionalTone: string;
  /** Prompt shown during the 2-second wait phase before hint loads. */
  waitPrompt?: string;
  /** Follow-up question after full reveal — mastery confirmation. */
  similarQuestion?: { prompt: string; answer?: string };
  /** Strategy metadata that powers adaptive tutoring decisions. */
  strategy?: CoachStrategy;
  /** Current estimated mastery stage for this skill. */
  masteryLevel?: MasteryLevel;
  /** Estimated learning intent for this interaction. */
  learningIntent?: LearningIntent;
  /** Human-readable summary of why this adaptation was chosen. */
  adaptationSummary?: string;
};

/** Emitted when the student interacts with the coach — feeds tracking. */
export type CoachInteractionEvent = {
  subject: CoachSubject;
  skillFocus?: string;
  hintLevel: number;
  mode: CoachMode;
  followUpCorrect?: boolean; // whether embedded follow-up was answered correctly
  masterySignal: MasterySignal | null;
  responseTimeMs?: number;
  revealUsed: boolean;
};
