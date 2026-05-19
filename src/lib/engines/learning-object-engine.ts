/**
 * engines/learning-object-engine.ts
 *
 * Defines the canonical LearningObject type — the core primitive of the
 * StarLiz adaptive tutoring runtime.
 *
 * Also provides the Phase 1 adapter: NormalizedLessonItem → LearningObject.
 * This adapter is the boundary at which the old item shape is normalised into
 * the new composable primitive that all engines consume.
 *
 * Architecture layer: Tutor Runtime Engine → Learning Object Engine
 * No React, no state, no side effects.
 *
 * PHASE NOTES:
 * - Phase 1 (current): Types defined. Adapter wraps NormalizedLessonItem.
 * - Phase 4: Fields populated from DB-backed LearningObject records.
 * - Phase 5: AI tutor behaviours injected into tutorBehaviour.
 */

import { type NormalizedLessonItem, type LessonVisuals } from "@/lib/lesson-runtime-normalizer";
import {
  decodeLessonText,
  getAnswer,
  getItemSection,
  getOptions,
  getPrompt,
  isAlphabetLessonItem,
} from "@/lib/tutor-runtime/utils";

// ---------------------------------------------------------------------------
// Sub-types
// ---------------------------------------------------------------------------

/** The three levels of learning content within a LearningObject. */
export interface TeachingContent {
  /** The question or prompt shown to the student. */
  prompt: string;
  /** A brief explanation of the concept, shown after incorrect answer. */
  exampleExplanation: string | null;
  /** Structured formula scaffold for maths items. */
  formulaScaffold: null; // Populated by coaching-engine in Phase 4
  /** Full worked solution shown on 3rd failure. */
  workedExample: string | null;
  /** Reading passage for comprehension items. */
  readingPassage: string | null;
  /** Phonics breakdown for alphabet and spelling items. */
  phonicsBreakdown: string | null;
}

export interface AssessmentContent {
  /** The normalised correct answer string. */
  correctAnswer: string;
  /** Available answer options. Empty for free-recall / speech items. */
  options: string[];
  /** Primary input modality for this item. */
  inputMode: "speech" | "tap" | "type" | "hybrid";
  /** Normalised spoken target for ASR comparison. */
  speechExpected: string | null;
  /** Overrides the default stage heading in the assessment UI. */
  assessmentPrompt: string | null;
  /** Overrides the default retry heading. */
  supportPrompt: string | null;
  /** Overrides the default tap/type heading. */
  tapPrompt: string | null;
}

export interface ReinforcementContent {
  /** Coaching message shown on 1st wrong answer. */
  retryInstruction: string | null;
  /** Deeper instruction shown on 2nd wrong answer. */
  teachBreakdown: string | null;
  /** Full worked solution shown on 3rd wrong answer. */
  workedSolution: string | null;
  /** The "sticky" phrase anchoring this item in memory. */
  memoryAnchor: string | null;
}

export interface TutorBehaviourRules {
  /** Maximum retries before skip/reveal. Default 3. */
  maxRetries: number;
  /** Whether the tutor reads the prompt aloud. */
  useSpokenPrompt: boolean;
  /** Whether to pause after a correct answer for celebration. */
  pauseAfterCorrect: boolean;
  /** Celebration style adapts to student energy level. */
  celebrationStyle: "standard" | "quiet" | "enthusiastic";
  /** Whether the skip button is available. */
  allowSkip: boolean;
  /** Force this item into the review queue on failure. */
  forceReviewOnFail: boolean;
}

/** Per-attempt escalation path — what action to take at each retry depth. */
export interface EscalationPath {
  attempt1: "retry" | "teach" | "reveal";
  attempt2: "teach" | "worked_example" | "intervention";
  attempt3: "reveal" | "intervention" | "skip";
}

export interface AdaptationRules {
  /** 1–5 difficulty level, used by adaptation engine for item selection. */
  difficultyLevel: 1 | 2 | 3 | 4 | 5;
  /** Whether this item can be chosen as the gentle-start first question. */
  gentleStartEligible: boolean;
  /** Whether a visual scaffold is required to attempt this item. */
  requiresVisualScaffold: boolean;
  /** What happens at each wrong-answer depth. */
  escalationPath: EscalationPath;
}

export interface MasterySignalConfig {
  /**
   * Number of consecutive correct answers required to record mastery.
   * Default 1 — any single correct answer promotes the item.
   */
  requiredConsecutiveCorrect: number;
  /**
   * Hours until recall strength decays by 50%. Used by memory engine.
   * Default 24 (1 day).
   */
  decayHalfLifeHours: number;
  /**
   * Recall strength threshold below which the item must be re-tested.
   * 0–1. Default 0.6.
   */
  recallStrengthThreshold: number;
  /**
   * Minimum days before this item becomes eligible for spaced review.
   * Default 1.
   */
  reviewEligibleAfterDays: number;
}

export interface ProgressionRules {
  /** IDs of learning objects unlocked after this item is mastered. */
  unlocksAfterMastery: string[];
  /** IDs of learning objects that must be mastered first. */
  prerequisiteIds: string[];
  /** Skill codes that, if weak, should block progression to this item. */
  blockedByWeakSkills: string[];
}

export interface MemoryHookConfig {
  /** Short memory cue (e.g. "R = V ÷ I"). */
  anchorPhrase: string | null;
  /** Visual mnemonic description. */
  visualMnemonic: string | null;
  /** Spoken rhyme or rhythm cue. */
  spokenRhyme: string | null;
  /** Category tag for grouping in memory review sessions. */
  categoryTag: string;
}

export interface InterventionPolicy {
  /** Minimum failed attempts before an intervention is triggered. */
  triggerAfterFailedAttempts: number;
  /** Type of intervention mission to launch. */
  interventionType: "spelling" | "maths" | "reading" | "none";
  /** Whether this item's failure should escalate to a human reviewer. */
  escalateToHuman: boolean;
}

export interface LearningObjectTelemetryConfig {
  /** Whether to record hesitation timing for this item. */
  trackHesitation: boolean;
  /** Whether to record ASR confidence signals. */
  trackSpeechConfidence: boolean;
  /** Whether to record support escalation depth. */
  trackSupportEscalation: boolean;
  /**
   * 0–1 weight applied when warmup mood affects difficulty scoring.
   * 0 = mood has no effect. 1 = full emotional weighting.
   */
  emotionalSignalWeight: number;
}

// ---------------------------------------------------------------------------
// Curriculum reference
// ---------------------------------------------------------------------------

export interface CurriculumRef {
  subject: string;
  yearGroup: string | null;
  skill: string;
  subSkill: string | null;
  strand: string | null;
}

// ---------------------------------------------------------------------------
// Core LearningObject type
// ---------------------------------------------------------------------------

/**
 * LearningObject — the canonical primitive of the StarLiz adaptive runtime.
 *
 * Replaces the fragmented LessonItem / AssignmentItem / NormalizedLessonItem
 * shapes with a single self-contained unit that carries:
 * - the teaching content
 * - the assessment structure
 * - the reinforcement escalation path
 * - engine-specific operating rules
 * - memory and mastery signal configuration
 * - telemetry tracking preferences
 *
 * All engines consume LearningObject. Nothing else.
 */
export interface LearningObject {
  // Identity
  id: string;
  version: number;
  source: "authored" | "ai_generated" | "ai_reviewed";

  // Content layers
  teaching: TeachingContent;
  assessment: AssessmentContent;
  reinforcement: ReinforcementContent;

  // Engine configuration
  tutorBehaviour: TutorBehaviourRules;
  adaptationRules: AdaptationRules;
  masterySignals: MasterySignalConfig;
  progressionRules: ProgressionRules;

  // Support materials
  visuals: LessonVisuals | null;
  memoryHooks: MemoryHookConfig;
  interventionPolicy: InterventionPolicy;

  // Telemetry preferences
  telemetry: LearningObjectTelemetryConfig;

  // Curriculum link
  curriculumRef: CurriculumRef;
}

// ---------------------------------------------------------------------------
// Phase 1 Adapter: NormalizedLessonItem → LearningObject
// ---------------------------------------------------------------------------

/**
 * Derives sensible defaults for all LearningObject fields from a
 * NormalizedLessonItem. This is the Phase 1 boundary adapter.
 *
 * In Phase 4, this adapter will be replaced by a DB-backed resolver that
 * returns fully-authored LearningObject records. Until then, every item
 * in the system passes through here.
 */
export function adaptLessonItemToLearningObject(
  item: NormalizedLessonItem,
  assignmentSubject: string,
): LearningObject {
  const section = getItemSection(item, assignmentSubject);
  const prompt = getPrompt(item, section);
  const correctAnswer = getAnswer(item);
  const options = getOptions(item);
  const isAlphabet = isAlphabetLessonItem(item);
  const skillFocus = decodeLessonText(String(item.skillFocus ?? assignmentSubject));
  const difficulty = Math.max(1, Math.min(5, item.difficulty ?? 1)) as 1 | 2 | 3 | 4 | 5;

  // Input mode: spelling items with no options → speech; with options → hybrid
  const inputMode: AssessmentContent["inputMode"] =
    section === "spelling"
      ? options.length > 0
        ? "hybrid"
        : "speech"
      : options.length > 0
        ? "tap"
        : "type";

  return {
    id: item.id,
    version: 1,
    source: "ai_generated",

    teaching: {
      prompt,
      exampleExplanation: item.explanation || null,
      formulaScaffold: null,
      workedExample: item.workedSolution || null,
      readingPassage: item.passage ? decodeLessonText(String(item.passage)) : null,
      phonicsBreakdown: isAlphabet ? `This is the letter ${correctAnswer.toLowerCase()}.` : null,
    },

    assessment: {
      correctAnswer,
      options,
      inputMode,
      speechExpected: section === "spelling" ? correctAnswer.toLowerCase() : null,
      assessmentPrompt: item.assessmentPrompt ? decodeLessonText(String(item.assessmentPrompt)) : null,
      supportPrompt: item.supportPrompt ? decodeLessonText(String(item.supportPrompt)) : null,
      tapPrompt: item.tapPrompt ? decodeLessonText(String(item.tapPrompt)) : null,
    },

    reinforcement: {
      retryInstruction: item.retryPrompts?.[0] ?? null,
      teachBreakdown: item.hint || null,
      workedSolution: item.workedSolution || null,
      memoryAnchor: item.learningFocus || null,
    },

    tutorBehaviour: {
      maxRetries: 3,
      useSpokenPrompt: section === "spelling",
      pauseAfterCorrect: true,
      celebrationStyle: "standard",
      allowSkip: true,
      forceReviewOnFail: false,
    },

    adaptationRules: {
      difficultyLevel: difficulty,
      gentleStartEligible: difficulty <= 2,
      requiresVisualScaffold: item.visuals.required,
      escalationPath: {
        attempt1: "retry",
        attempt2: "teach",
        attempt3: section === "spelling" ? "reveal" : "intervention",
      },
    },

    masterySignals: {
      requiredConsecutiveCorrect: 1,
      decayHalfLifeHours: 24,
      recallStrengthThreshold: 0.6,
      reviewEligibleAfterDays: 1,
    },

    progressionRules: {
      unlocksAfterMastery: [],
      prerequisiteIds: [],
      blockedByWeakSkills: item.weakSkillTags ?? [],
    },

    visuals: item.visuals.required ? item.visuals : null,

    memoryHooks: {
      anchorPhrase: item.learningFocus || null,
      visualMnemonic: null,
      spokenRhyme: null,
      categoryTag: skillFocus,
    },

    interventionPolicy: {
      triggerAfterFailedAttempts: 3,
      interventionType: section === "spelling" ? "spelling" : section === "math" ? "maths" : "reading",
      escalateToHuman: false,
    },

    telemetry: {
      trackHesitation: true,
      trackSpeechConfidence: section === "spelling",
      trackSupportEscalation: true,
      emotionalSignalWeight: 0.3,
    },

    curriculumRef: {
      subject: assignmentSubject,
      yearGroup: null,
      skill: skillFocus,
      subSkill: null,
      strand: null,
    },
  };
}
