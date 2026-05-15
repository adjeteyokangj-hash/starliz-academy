// ─────────────────────────────────────────────────────────────────────────────
// Database Helpers — record interactions, track mastery levels
// Query and update the new SkillMastery, MasteryCheckResult, and CoachInteractionLog tables
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db";
import type { CoachInteractionLog } from "@prisma/client";
import { MasteryLevel } from "./types";

/**
 * Record a coach interaction to the log.
 * Called after every coaching turn to build history for gating and analytics.
 */
export async function recordCoachInteraction(
  childId: string,
  subject: string,
  skillFocus: string | undefined,
  questionText: string,
  hintLevel: number,
  mode: "hint" | "guided_steps" | "full_walkthrough" | "mistake_recovery" | "reveal",
  studentAnswer: string | undefined,
  correct: boolean | undefined,
  responseTimeMs: number | undefined,
): Promise<void> {
  try {
    await prisma.coachInteractionLog.create({
      data: {
        childId,
        subject,
        skillFocus: skillFocus || null,
        questionText,
        hintLevel,
        mode,
        studentAnswer: studentAnswer || null,
        correct: correct ?? null,
        responseTimeMs: responseTimeMs ?? null,
      },
    });
  } catch (err) {
    console.error("[coach db] Failed to record interaction:", err);
    // Non-fatal; don't throw
  }
}

/**
 * Get or create the current skill mastery record for a student.
 */
export async function getSkillMastery(
  childId: string,
  subject: string,
  skillFocus: string,
) {
  const existing = await prisma.skillMastery.findUnique({
    where: {
      childId_subject_skillFocus: { childId, subject, skillFocus },
    },
  });

  if (existing) {
    return existing;
  }

  // First encounter with this skill
  return await prisma.skillMastery.create({
    data: {
      childId,
      subject,
      skillFocus,
      masteryLevel: "new",
      confidenceScore: 0.3,
      attemptCount: 0,
      correctCount: 0,
    },
  });
}

/**
 * Update mastery level after a student attempt.
 * Considers: correctness, responseTime, attemptCount, previous level
 */
export async function updateMasteryAfterAttempt(
  skillId: string,
  studentWasCorrect: boolean,
  responseTimeMs: number | undefined,
): Promise<void> {
  const skill = await prisma.skillMastery.findUnique({
    where: { id: skillId },
  });

  if (!skill) return;

  // Calculate new metrics
  const newAttemptCount = skill.attemptCount + 1;
  const newCorrectCount = studentWasCorrect ? skill.correctCount + 1 : skill.correctCount;
  const correctRate = newCorrectCount / newAttemptCount;

  // Fast response + correct = high confidence boost
  const responseSpeedFactor = responseTimeMs
    ? Math.max(0.5, 1 - responseTimeMs / 60000) // Faster = higher
    : 0.7;

  const correctnessBoost = studentWasCorrect ? 0.15 : -0.05;
  const newConfidence = Math.max(0, Math.min(1, skill.confidenceScore + correctnessBoost * responseSpeedFactor));

  // Infer new mastery level
  let newMasteryLevel: MasteryLevel = skill.masteryLevel as MasteryLevel;

  if (newAttemptCount === 1 && studentWasCorrect) {
    newMasteryLevel = "developing";
  } else if (correctRate >= 0.8 && newAttemptCount >= 3) {
    newMasteryLevel = "confident";
  } else if (correctRate >= 0.9 && newAttemptCount >= 5) {
    newMasteryLevel = "mastered";
  } else if (correctRate < 0.3 && newAttemptCount >= 2) {
    newMasteryLevel = "practising"; // Going backwards
  }

  // Update the skill mastery record
  await prisma.skillMastery.update({
    where: { id: skillId },
    data: {
      attemptCount: newAttemptCount,
      correctCount: newCorrectCount,
      confidenceScore: newConfidence,
      masteryLevel: newMasteryLevel,
      lastAttemptAt: new Date(),
      lastMasteredAt:
        newMasteryLevel === "mastered"
          ? new Date()
          : skill.lastMasteredAt,
    },
  });
}

/**
 * Record a mastery check result (independent question attempt).
 */
export async function recordMasteryCheckResult(
  childId: string,
  skillId: string,
  questionText: string,
  correctAnswer: string,
  studentAnswer: string,
  hintsUsed: number,
  responseTimeMs: number | undefined,
  passed: boolean,
): Promise<void> {
  try {
    await prisma.masteryCheckResult.create({
      data: {
        childId,
        skillId,
        questionText,
        correctAnswer,
        studentAnswer,
        hintsUsed,
        responseTimeMs,
        passed,
      },
    });
  } catch (err) {
    console.error("[coach db] Failed to record mastery check:", err);
  }
}

/**
 * Get the last few mastery check results for a skill.
 * Used to decide if a student has proven mastery.
 */
export async function getRecentMasteryCheckResults(
  skillId: string,
  limit: number = 5,
) {
  return await prisma.masteryCheckResult.findMany({
    where: { skillId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Get all interactions for a skill in the current session.
 * Used for progressive gating logic.
 */
export async function getSkillInteractionsToday(
  childId: string,
  subject: string,
  skillFocus: string,
): Promise<CoachInteractionLog[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return await prisma.coachInteractionLog.findMany({
    where: {
      childId,
      subject,
      skillFocus,
      createdAt: { gte: today },
    },
    orderBy: { createdAt: "desc" },
  });
}
