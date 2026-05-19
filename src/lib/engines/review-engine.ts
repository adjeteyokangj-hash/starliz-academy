/**
 * engines/review-engine.ts
 *
 * Decides when and how to enter a review round, labels repair context,
 * and computes improvement signals after review completion.
 *
 * Architecture layer: Tutor Runtime Engine → Review Engine
 * No React, no state, no side effects.
 */

import { type NormalizedLessonItem } from "@/lib/lesson-runtime-normalizer";
import { isAlphabetLessonItem } from "@/lib/tutor-runtime/utils";
import { type QuestionLearningStatus } from "@/lib/engines/mastery-engine";

type LessonItem = NormalizedLessonItem;

// ---------------------------------------------------------------------------
// Review trigger
// ---------------------------------------------------------------------------

/**
 * Returns true when the review round should start.
 * Pure function of the review queue length — no side effects.
 */
export function computeReviewTrigger(reviewQueue: number[]): boolean {
  return reviewQueue.length > 0;
}

// ---------------------------------------------------------------------------
// Review item labelling
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable reason string for why this item is in the repair
 * queue. Used in the lesson header and review intro screen.
 */
export function reviewReason(item: LessonItem): string {
  const skill = String(item.skillFocus ?? "").toLowerCase();
  if (skill.includes("vowel") || skill.includes("cvc")) return "short vowel practice";
  if (skill.includes("letter") || isAlphabetLessonItem(item)) return "letter sound repair";
  if (skill.includes("read")) return "reading comprehension repair";
  if (skill.includes("math")) return "maths strategy repair";
  return "targeted skill repair";
}

// ---------------------------------------------------------------------------
// Post-review improvement signals
// ---------------------------------------------------------------------------

/**
 * Computes whether the student improved during the review round.
 * Returns true when at least one previously-skipped item was corrected,
 * or when any items were reviewed (reviewed = attempted improvement).
 */
export function computeReviewImproved(
  skippedQuestionKeys: string[],
  questionStatuses: Record<string, QuestionLearningStatus>,
  reviewQueueLength: number,
): boolean {
  const fixedCount = skippedQuestionKeys.filter(
    (key) => questionStatuses[key] === "reteach_complete",
  ).length;
  return fixedCount > 0 || reviewQueueLength > 0;
}

/**
 * Returns the memory feedback message shown at the end of the review round.
 * Adapts tone based on whether measurable improvement occurred.
 */
export function buildReviewMemoryFeedback(improved: boolean): string {
  return improved
    ? "You've improved these tricky questions!"
    : "We'll practise these again tomorrow.";
}
