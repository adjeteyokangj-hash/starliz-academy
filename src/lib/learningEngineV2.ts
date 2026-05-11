import { prisma } from "@/lib/db";
import { parseSkills, skillFocusToCode } from "@/lib/skills";

export type SkillMasteryStatus = "weak" | "learning" | "secure";

export type SkillState = {
  skill: string;
  accuracy: number;
  attempts: number;
  retries: number;
  lastSeen: Date;
  confidence: number;
  firstTryRate: number;
  recentPerformance: number;
  status: SkillMasteryStatus;
  daysSinceSeen: number;
  priority: number;
};

export type AttemptSignal = {
  correct: boolean;
  hintsUsed: number;
  responseTimeMs: number;
  createdAt: Date;
  difficulty: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function daysBetweenUtc(from: Date, to: Date): number {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.max(0, Math.floor((end - start) / (24 * 60 * 60 * 1000)));
}

export function calculateConfidence(input: {
  accuracy: number;
  firstTryRate: number;
  recentPerformance: number;
}): number {
  const accuracyNorm = clamp(input.accuracy / 100, 0, 1);
  const firstTryRate = clamp(input.firstTryRate, 0, 1);
  const recentPerformance = clamp(input.recentPerformance, 0, 1);
  return clamp((accuracyNorm * 0.6) + (firstTryRate * 0.3) + (recentPerformance * 0.1), 0, 1);
}

export function skillStatusFromConfidence(confidence: number): SkillMasteryStatus {
  if (confidence < 0.5) return "weak";
  if (confidence <= 0.75) return "learning";
  return "secure";
}

export function toLegacyStudentSkillStatus(status: SkillMasteryStatus): "weak" | "improving" | "mastered" {
  if (status === "weak") return "weak";
  if (status === "learning") return "improving";
  return "mastered";
}

export function computeWeakPriority(input: { confidence: number; daysSinceSeen: number }): number {
  const confidence = clamp(input.confidence, 0, 1);
  const daysWeight = clamp(input.daysSinceSeen / 7, 0, 1);
  return clamp(((1 - confidence) * 0.7) + (daysWeight * 0.3), 0, 1);
}

function computeFirstTryRate(attempts: AttemptSignal[]): number {
  if (!attempts.length) return 0;
  const firstTryCorrect = attempts.filter((attempt) => attempt.correct && attempt.hintsUsed === 0).length;
  return clamp(firstTryCorrect / attempts.length, 0, 1);
}

function computeRecentPerformance(attempts: AttemptSignal[]): number {
  if (!attempts.length) return 0;
  const recent = attempts.slice(-6);
  const correct = recent.filter((attempt) => attempt.correct).length;
  return clamp(correct / recent.length, 0, 1);
}

export function buildSkillState(input: {
  skill: string;
  accuracy: number;
  attempts: number;
  retries: number;
  lastSeen: Date;
  attemptSignals: AttemptSignal[];
  now?: Date;
}): SkillState {
  const now = input.now ?? new Date();
  const firstTryRate = computeFirstTryRate(input.attemptSignals);
  const recentPerformance = computeRecentPerformance(input.attemptSignals);
  const confidence = calculateConfidence({
    accuracy: input.accuracy,
    firstTryRate,
    recentPerformance,
  });
  const status = skillStatusFromConfidence(confidence);
  const daysSinceSeen = daysBetweenUtc(input.lastSeen, now);
  const priority = computeWeakPriority({ confidence, daysSinceSeen });

  return {
    skill: input.skill,
    accuracy: clamp(input.accuracy, 0, 100),
    attempts: Math.max(0, input.attempts),
    retries: Math.max(0, input.retries),
    lastSeen: input.lastSeen,
    confidence,
    firstTryRate,
    recentPerformance,
    status,
    daysSinceSeen,
    priority,
  };
}

function difficultyBandForLevel(level: number): { min: number; max: number } {
  if (level <= 3) return { min: 1, max: 2 };
  if (level <= 6) return { min: 2, max: 3 };
  return { min: 3, max: 5 };
}

export function adaptiveDifficultyFromSignals(input: {
  level: number;
  currentDifficulty: number;
  recentCorrectness: boolean[];
}): number {
  const { min, max } = difficultyBandForLevel(input.level);
  const current = clamp(Math.round(input.currentDifficulty), min, max);
  if (!input.recentCorrectness.length) return current;

  let correctStreak = 0;
  for (let i = input.recentCorrectness.length - 1; i >= 0; i -= 1) {
    if (input.recentCorrectness[i]) correctStreak += 1;
    else break;
  }

  let wrongStreak = 0;
  for (let i = input.recentCorrectness.length - 1; i >= 0; i -= 1) {
    if (!input.recentCorrectness[i]) wrongStreak += 1;
    else break;
  }

  let next = current;
  if (correctStreak >= 3) next += 1;
  if (wrongStreak >= 2) next -= 1;
  return clamp(next, min, max);
}

export function isBossUnlockEligibleV2(input: {
  accuracy: number;
  skippedCount: number;
  unresolvedSkipped: number;
  confidenceImproving: boolean;
}): { eligible: boolean; reason: string | null } {
  if (input.accuracy < 80) {
    return { eligible: false, reason: "Boss unlock needs 80% accuracy." };
  }
  if (input.skippedCount > 0 || input.unresolvedSkipped > 0) {
    return { eligible: false, reason: "Complete your review first. Fix all skipped questions to unlock Boss Battle." };
  }
  if (!input.confidenceImproving) {
    return { eligible: false, reason: "Keep building confidence. Boss Battle unlocks when confidence is improving." };
  }
  return { eligible: true, reason: null };
}

export async function buildSkillStatesForStudent(studentId: string): Promise<SkillState[]> {
  const [rows, attempts] = await Promise.all([
    prisma.studentSkill.findMany({ where: { studentId } }),
    prisma.attempt.findMany({
      where: { studentId },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: {
        correct: true,
        hintsUsed: true,
        responseTimeMs: true,
        createdAt: true,
        difficulty: true,
        skills: true,
        skillFocus: true,
      },
    }),
  ]);

  const attemptsBySkill = new Map<string, AttemptSignal[]>();
  for (const attempt of attempts) {
    const explicit = parseSkills(attempt.skills);
    const inferred = skillFocusToCode(attempt.skillFocus);
    const skillCodes = explicit.length ? explicit : inferred ? [inferred] : [];

    for (const skill of skillCodes) {
      const bucket = attemptsBySkill.get(skill) ?? [];
      bucket.push({
        correct: attempt.correct,
        hintsUsed: attempt.hintsUsed,
        responseTimeMs: attempt.responseTimeMs,
        createdAt: attempt.createdAt,
        difficulty: attempt.difficulty,
      });
      attemptsBySkill.set(skill, bucket);
    }
  }

  const now = new Date();
  return rows.map((row) => {
    const signal = attemptsBySkill.get(row.skill) ?? [];
    const retries = signal.filter((item) => !item.correct || item.hintsUsed > 0).length;
    const lastSeen = signal.length ? signal[signal.length - 1].createdAt : row.updatedAt;
    return buildSkillState({
      skill: row.skill,
      accuracy: row.accuracy,
      attempts: row.attempts,
      retries,
      lastSeen,
      attemptSignals: signal,
      now,
    });
  });
}
