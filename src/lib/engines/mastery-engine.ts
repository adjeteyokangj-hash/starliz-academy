/**
 * engines/mastery-engine.ts
 *
 * Computes mastery state from attempt records.
 * Owns: per-question scoring, lesson-level mastery flag, question status types.
 *
 * Architecture layer: Tutor Runtime Engine → Mastery Engine
 * No React, no state, no side effects.
 */

import {
  computeAttemptWeightedScore,
  type QuestionAttemptSummary,
} from "@/lib/starliz-question-formula";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Per-question learning status within a session.
 * Drives review queue inclusion and repair round routing.
 */
export type QuestionLearningStatus =
  | "correct"
  | "wrong_retrying"
  | "skipped_needs_reteach"
  | "reteach_complete";

/** Summary of the mastery state at lesson completion. */
export interface MasteryReadyResult {
  masteryReady: boolean;
  unresolvedSkipped: number;
  firstTryCorrect: number;
  retryCorrect: number;
  skippedCount: number;
  finalScore: number;
}

// ---------------------------------------------------------------------------
// Mastery computation
// ---------------------------------------------------------------------------

/**
 * Computes whether the lesson qualifies as mastery-ready.
 *
 * Mastery requires:
 * - No unresolved skipped items (skipped and not corrected in review)
 * - No skipped items at all (all items reached a resolved state)
 * - Final weighted score ≥ 80
 *
 * This is a pure function of session state — called at lesson end before saving.
 */
export function computeMasteryReady(
  questionStatuses: Record<string, QuestionLearningStatus>,
  skippedQuestionKeys: string[],
  questionAttemptSummary: Record<string, QuestionAttemptSummary>,
): MasteryReadyResult {
  const statusValues = Object.values(questionStatuses);
  const unresolvedSkipped = statusValues.filter((s) => s === "skipped_needs_reteach").length;
  const firstTryCorrect = statusValues.filter((s) => s === "correct").length;
  const retryCorrect = statusValues.filter((s) => s === "reteach_complete").length;
  const skippedCount = skippedQuestionKeys.length;
  const finalScore = computeAttemptWeightedScore(questionAttemptSummary);
  const masteryReady = unresolvedSkipped === 0 && skippedCount === 0 && finalScore >= 80;

  return {
    masteryReady,
    unresolvedSkipped,
    firstTryCorrect,
    retryCorrect,
    skippedCount,
    finalScore,
  };
}

// ---------------------------------------------------------------------------
// Re-exports — scoring primitives live in starliz-question-formula
// ---------------------------------------------------------------------------

export {
  computeAttemptWeightedScore,
  scoreForResolvedQuestion,
  type QuestionAttemptSummary,
} from "@/lib/starliz-question-formula";
