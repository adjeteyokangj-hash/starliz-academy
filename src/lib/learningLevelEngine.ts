import { StartLevelChoice } from "@/lib/store";

export type SubjectKey = "spelling" | "reading" | "math";

export type SubjectPerformanceInput = {
  accuracy: number;
  attempts: number;
  hintsUsed: number;
  avgResponseMs: number;
  retries: number;
  repeatedMistakes: number;
  weakTopics: number;
  masteredTopics: number;
  recallSuccess: number;
  bossSuccess: number;
};

export type SubjectDecisionInput = {
  subject: SubjectKey;
  currentLevel: number;
  ageYears: number;
  yearGroup?: string | null;
  startLevelChoice: StartLevelChoice;
  performance: SubjectPerformanceInput;
  minimumEvidence?: number;
  maxLevel?: number;
};

export type SubjectLevelDecision = {
  subject: SubjectKey;
  level: number;
  previousLevel: number;
  confidenceScore: number;
  movement: "up" | "down" | "hold";
  reasons: string[];
};

export type LearningLevelEngineInput = {
  ageYears: number;
  yearGroup?: string | null;
  startLevelChoice: StartLevelChoice;
  levels: Record<SubjectKey, number>;
  performance: Record<SubjectKey, SubjectPerformanceInput>;
  maxLevel?: number;
  maxLevels?: Partial<Record<SubjectKey, number>>;
};

export type LearningLevelEngineResult = {
  spellingLevel: number;
  readingLevel: number;
  mathsLevel: number;
  overallLevel: number;
  nextBestActivity: string;
  needsPlacementCheck: boolean;
  reasons: string[];
  decisions: SubjectLevelDecision[];
};

function clampLevel(level: number, maxLevel: number): number {
  return Math.max(1, Math.min(maxLevel, Math.round(level)));
}

function parseYearGroupLevel(yearGroup?: string | null): number | null {
  if (!yearGroup) return null;
  const match = yearGroup.match(/(\d+)/);
  if (!match) return null;
  const year = Number(match[1]);
  if (!Number.isFinite(year)) return null;
  return clampLevel(year + 1, 6);
}

function ageBaseline(ageYears: number): number {
  if (ageYears <= 5) return 1;
  if (ageYears <= 7) return 2;
  if (ageYears <= 9) return 3;
  return 4;
}

function startLevelOffset(startLevelChoice: StartLevelChoice): number {
  if (startLevelChoice === "Beginner") return -1;
  if (startLevelChoice === "Confident") return 1;
  return 0;
}

export function getStartingSubjectLevel(input: {
  ageYears: number;
  yearGroup?: string | null;
  startLevelChoice: StartLevelChoice;
  maxLevel?: number;
}): number {
  const maxLevel = input.maxLevel ?? 5;
  const byAge = ageBaseline(input.ageYears);
  const byYear = parseYearGroupLevel(input.yearGroup);
  const base = byYear ?? byAge;
  return clampLevel(base + startLevelOffset(input.startLevelChoice), maxLevel);
}

export function calculateConfidenceScore(performance: SubjectPerformanceInput): number {
  const accuracyScore = performance.accuracy;
  const recallScore = performance.recallSuccess;
  const bossScore = performance.bossSuccess;
  const speedBonus = performance.avgResponseMs <= 0
    ? 0
    : performance.avgResponseMs <= 7000
      ? 12
      : performance.avgResponseMs <= 12000
        ? 6
        : 0;

  const hintPenalty = Math.min(20, performance.hintsUsed * 1.4);
  const retryPenalty = Math.min(16, performance.retries * 2);
  const mistakePenalty = Math.min(18, performance.repeatedMistakes * 2);
  const weakPenalty = Math.min(14, performance.weakTopics * 2);
  const masteryBonus = Math.min(12, performance.masteredTopics * 1.5);

  const score = accuracyScore * 0.45
    + recallScore * 0.2
    + bossScore * 0.2
    + speedBonus
    + masteryBonus
    - hintPenalty
    - retryPenalty
    - mistakePenalty
    - weakPenalty;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function decideMovement(input: SubjectDecisionInput, confidenceScore: number): SubjectLevelDecision {
  const maxLevel = input.maxLevel ?? 5;
  const minEvidence = input.minimumEvidence ?? 8;
  const reasons: string[] = [];
  const previousLevel = clampLevel(input.currentLevel, maxLevel);

  if (input.performance.attempts < minEvidence) {
    reasons.push(`Held ${input.subject} level: only ${input.performance.attempts} attempts (need ${minEvidence}).`);
    return {
      subject: input.subject,
      previousLevel,
      level: previousLevel,
      confidenceScore,
      movement: "hold",
      reasons,
    };
  }

  const struggling = input.performance.accuracy < 60
    || input.performance.hintsUsed >= 4
    || input.performance.retries >= 3
    || input.performance.bossSuccess < 45;

  const strong = input.performance.accuracy >= 85
    && input.performance.hintsUsed <= 2
    && input.performance.recallSuccess >= 75
    && input.performance.bossSuccess >= 70;

  if (strong && confidenceScore >= 75 && previousLevel < maxLevel) {
    reasons.push(`Moved up ${input.subject}: accuracy ${Math.round(input.performance.accuracy)}%, low hints, strong recall/boss performance.`);
    return {
      subject: input.subject,
      previousLevel,
      level: previousLevel + 1,
      confidenceScore,
      movement: "up",
      reasons,
    };
  }

  if (struggling && confidenceScore <= 45 && previousLevel > 1) {
    reasons.push(`Moved down ${input.subject}: repeated struggle with hints/retries and low confidence score.`);
    reasons.push("Support mode enabled: more visuals, slower pacing, and shorter tasks.");
    return {
      subject: input.subject,
      previousLevel,
      level: previousLevel - 1,
      confidenceScore,
      movement: "down",
      reasons,
    };
  }

  reasons.push(`Held ${input.subject} level: improving but not enough evidence for safe movement.`);
  return {
    subject: input.subject,
    previousLevel,
    level: previousLevel,
    confidenceScore,
    movement: "hold",
    reasons,
  };
}

function getWeakestSubject(input: Record<SubjectKey, SubjectPerformanceInput>): SubjectKey {
  const scores: Array<{ subject: SubjectKey; score: number }> = [
    { subject: "spelling", score: calculateConfidenceScore(input.spelling) },
    { subject: "reading", score: calculateConfidenceScore(input.reading) },
    { subject: "math", score: calculateConfidenceScore(input.math) },
  ];
  scores.sort((a, b) => a.score - b.score);
  return scores[0].subject;
}

function recommendNextActivity(input: Record<SubjectKey, SubjectPerformanceInput>): string {
  const weakest = getWeakestSubject(input);
  if (weakest === "spelling") {
    return "Practise weak spelling words in reading passages.";
  }
  if (weakest === "reading") {
    return "Reading support using familiar spelling word families.";
  }
  return "Maths story problems using familiar reading vocabulary.";
}

export function evaluateLearningLevels(input: LearningLevelEngineInput): LearningLevelEngineResult {
  const maxLevel = input.maxLevel ?? 5;
  const maxLevelFor = (subject: SubjectKey): number => input.maxLevels?.[subject] ?? maxLevel;
  const decisions: SubjectLevelDecision[] = [
    decideMovement(
      {
        subject: "spelling",
        currentLevel: input.levels.spelling,
        ageYears: input.ageYears,
        yearGroup: input.yearGroup,
        startLevelChoice: input.startLevelChoice,
        performance: input.performance.spelling,
        maxLevel: maxLevelFor("spelling"),
      },
      calculateConfidenceScore(input.performance.spelling),
    ),
    decideMovement(
      {
        subject: "reading",
        currentLevel: input.levels.reading,
        ageYears: input.ageYears,
        yearGroup: input.yearGroup,
        startLevelChoice: input.startLevelChoice,
        performance: input.performance.reading,
        maxLevel: maxLevelFor("reading"),
      },
      calculateConfidenceScore(input.performance.reading),
    ),
    decideMovement(
      {
        subject: "math",
        currentLevel: input.levels.math,
        ageYears: input.ageYears,
        yearGroup: input.yearGroup,
        startLevelChoice: input.startLevelChoice,
        performance: input.performance.math,
        maxLevel: maxLevelFor("math"),
      },
      calculateConfidenceScore(input.performance.math),
    ),
  ];

  const spellingLevel = clampLevel(
    decisions.find((d) => d.subject === "spelling")?.level ?? input.levels.spelling,
    maxLevelFor("spelling"),
  );
  const readingLevel = clampLevel(
    decisions.find((d) => d.subject === "reading")?.level ?? input.levels.reading,
    maxLevelFor("reading"),
  );
  const mathsLevel = clampLevel(
    decisions.find((d) => d.subject === "math")?.level ?? input.levels.math,
    maxLevelFor("math"),
  );

  const overallLevel = clampLevel(Math.round((spellingLevel + readingLevel + mathsLevel) / 3), maxLevel);
  const nextBestActivity = recommendNextActivity(input.performance);
  const reasons = decisions.flatMap((decision) => decision.reasons);
  const needsPlacementCheck = input.performance.spelling.attempts < 3
    || input.performance.reading.attempts < 3
    || input.performance.math.attempts < 3;

  return {
    spellingLevel,
    readingLevel,
    mathsLevel,
    overallLevel,
    nextBestActivity,
    needsPlacementCheck,
    reasons,
    decisions,
  };
}
