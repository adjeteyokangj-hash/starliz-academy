// ─────────────────────────────────────────────────────────────────────────────
// Progressive Help Gating — enforce sequential hint levels and interaction
// Ensures students engage at each level before advancing to the next
// ─────────────────────────────────────────────────────────────────────────────

import { CoachContext } from "./types";

export type GatingValidation = {
  allowed: boolean;
  reason?: string;
  suggestedHintLevel?: number;
};

/**
 * Validate that a hint request respects progressive help rules.
 * Rules:
 * 1. Cannot jump hint levels (e.g., 0 → 3 is invalid; must go 0 → 1 → 2 → 3)
 * 2. At each level, student must have attempted the question
 * 3. Cannot request the same hint level twice in a row without answering
 */
export function validateProgressiveHelp(
  ctx: CoachContext,
  lastRequestedHintLevel?: number,
): GatingValidation {
  const requestedLevel = Math.min(ctx.hintCount + 1, 4);

  // Rule 1: Check for level jumping
  if (lastRequestedHintLevel !== undefined) {
    const jump = requestedLevel - lastRequestedHintLevel;

    // Allow same level if no answer yet (accidental double-tap on hint button)
    if (jump === 0) {
      return {
        allowed: false,
        reason: "You already received a level " + lastRequestedHintLevel + " hint. Try answering first, or move to the next hint.",
        suggestedHintLevel: lastRequestedHintLevel,
      };
    }

    // Only allow advancing one level at a time
    if (jump > 1) {
      return {
        allowed: false,
        reason: `Cannot jump from hint level ${lastRequestedHintLevel} to ${requestedLevel}. Must use level ${lastRequestedHintLevel + 1} first.`,
        suggestedHintLevel: lastRequestedHintLevel + 1,
      };
    }
  }

  // Rule 2: Before requesting level 2+, must have made at least one genuine attempt
  if (requestedLevel >= 2 && ctx.attemptCount === 0 && !ctx.studentAnswer) {
    return {
      allowed: false,
      reason: "Try answering the question first. I can give more targeted help after seeing your attempt.",
      suggestedHintLevel: 1,
    };
  }

  // Rule 3: At level 4 (reveal), must have used previous hints
  if (requestedLevel >= 4 && ctx.hintCount < 2) {
    return {
      allowed: false,
      reason: "I can show the full answer after you've worked through a few hints first. You're on hint " + ctx.hintCount + " of 3.",
      suggestedHintLevel: Math.min(ctx.hintCount + 1, 3),
    };
  }

  return { allowed: true };
}

/**
 * Determine the appropriate hint level based on student's interaction pattern.
 * Recommends a level even if the requested one is invalid.
 */
export function recommendHintLevel(ctx: CoachContext): number {
  // No answer yet → Hint 1 (small nudge)
  if (!ctx.studentAnswer && ctx.attemptCount === 0) {
    return 1;
  }

  // One wrong attempt → Hint 2 (guided question)
  if (ctx.attemptCount === 1) {
    return 2;
  }

  // Two wrong attempts → Hint 3 (partial walkthrough)
  if (ctx.attemptCount === 2) {
    return 3;
  }

  // Three+ wrong attempts → Hint 4 (full reveal)
  if (ctx.attemptCount >= 3) {
    return 4;
  }

  return ctx.hintCount + 1;
}

/**
 * Extract the last hint level the student requested for this skill+question combo.
 * This would normally come from the coach interaction log or session state.
 * For now, we infer it from hintCount.
 */
export function inferLastHintLevel(hintCount: number): number | undefined {
  if (hintCount === 0) return undefined;
  return hintCount;
}
