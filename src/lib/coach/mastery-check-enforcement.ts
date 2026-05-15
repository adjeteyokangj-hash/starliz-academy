// ─────────────────────────────────────────────────────────────────────────────
// Mastery Check Enforcement — require independent success after full reveal
// Only marks a skill as Confident/Mastered when student proves understanding alone
// ─────────────────────────────────────────────────────────────────────────────

import { CoachContext, CoachResponse, MasteryLevel } from "./types";

export type MasteryCheckPolicy = {
  requireCheck: boolean;       // whether a mastery check is mandatory
  checkBefore: "reveal" | "record";  // check BEFORE reveal (practice) or AFTER recording
  maxTriesAllowed: number;     // how many tries for the check itself
  requiredPassRate: number;    // 0–1 (e.g., 0.8 = 80% must pass)
};

/**
 * Determine whether a mastery check should be presented after a full reveal.
 * Mastery checks are independent questions with NO HINTS allowed.
 */
export function shouldEnforceMasteryCheck(ctx: CoachContext): boolean {
  // Only after full reveal (hint 4)
  if (ctx.hintCount < 3) return false;

  // Suppress if student already solved independently recently
  // (this would be checked against the database in production)
  if (ctx.confidenceScore >= 0.85) return false;

  return true;
}

/**
 * Build a mastery check prompt from the original question.
 * Returns clear instructions and a similar-but-different question.
 */
export function buildMasteryCheckPrompt(
  ctx: CoachContext,
  similarQuestion: { prompt: string; answer?: string } | undefined,
): string {
  if (!similarQuestion) {
    return (
      `Now, to prove you truly understand, please try a similar question completely on your own — without any hints. ` +
      `This is your chance to show real mastery.`
    );
  }

  return (
    `Now that you've seen the method, let's check you truly understand. ` +
    `Try this similar question independently — no hints allowed. ` +
    `This is how we know you've mastered the skill.\n\n` +
    `Question: ${similarQuestion.prompt}`
  );
}

/**
 * Evaluate a mastery check result and return feedback + updated mastery level.
 */
export function evaluateMasteryCheck(
  previousMasteryLevel: MasteryLevel,
  masteryCheckPassed: boolean,
  hintsUsedInCheck: number,
): MasteryLevel {
  // If the mastery check is passed with no hints, mark as Mastered
  if (masteryCheckPassed && hintsUsedInCheck === 0) {
    return "mastered";
  }

  // If passed with hints, mark as Confident
  if (masteryCheckPassed && hintsUsedInCheck <= 1) {
    return "confident";
  }

  // If failed, return to Developing (need more practice)
  if (!masteryCheckPassed) {
    return previousMasteryLevel === "mastered" ? "confident" : previousMasteryLevel;
  }

  return previousMasteryLevel;
}

/**
 * Generate feedback for the mastery check result.
 */
export function getMasteryCheckFeedback(
  passed: boolean,
  hintsUsed: number,
  _responseTimeMs?: number,
): string {
  if (passed && hintsUsed === 0) {
    return (
      `🎉 Excellent! You solved it completely independently. ` +
      `You truly understand this now — skill marked as MASTERED.`
    );
  }

  if (passed && hintsUsed <= 2) {
    return (
      `Great job! You solved it with a little guidance. ` +
      `You're CONFIDENT in this skill. Practice more similar questions to reach mastery.`
    );
  }

  if (passed) {
    return (
      `Good effort! You got the right answer after using hints. ` +
      `Keep practicing — you're DEVELOPING this skill.`
    );
  }

  // Failed
  return (
    `This one was tricky — don't worry. This tells us the skill needs more practice. ` +
    `Let's revisit this concept with more guided questions to rebuild confidence.`
  );
}

/**
 * Determine the mastery check policy for a given subject and age band.
 */
export function getMasteryCheckPolicy(subject: string, ageBand: string): MasteryCheckPolicy {
  // GCSE students: strict mastery checks required
  if (ageBand === "gcse") {
    return {
      requireCheck: true,
      checkBefore: "record",
      maxTriesAllowed: 3,
      requiredPassRate: 0.8,
    };
  }

  // Secondary: moderate checks
  if (ageBand === "secondary") {
    return {
      requireCheck: true,
      checkBefore: "record",
      maxTriesAllowed: 2,
      requiredPassRate: 0.7,
    };
  }

  // Primary: optional but encouraged
  if (ageBand === "primary") {
    return {
      requireCheck: true,
      checkBefore: "record",
      maxTriesAllowed: 2,
      requiredPassRate: 0.65,
    };
  }

  // Foundation: light touch
  return {
    requireCheck: false,
    checkBefore: "record",
    maxTriesAllowed: 1,
    requiredPassRate: 0.5,
  };
}

/**
 * Attach mastery check metadata to a coach response.
 */
export function attachMasteryCheckToResponse(
  response: CoachResponse,
  shouldEnforceCheck: boolean,
  checkPrompt: string,
): CoachResponse {
  if (!shouldEnforceCheck) {
    return response;
  }

  return {
    ...response,
    masteryCheckPrompt: checkPrompt,
    masteryCheckRequired: true,
  };
}
