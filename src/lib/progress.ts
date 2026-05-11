import { ChildProfile } from "@/lib/store";
import { computeWeakAreas, nextVoiceMessage } from "@/lib/adaptive";
import { ActivityArea } from "@/lib/store";
import { recordProfileLearningEvent } from "@/lib/progress_data";
import { applyPetOutcome } from "@/lib/pet_state";
import { rollSurpriseReward, SurpriseReward } from "@/lib/surprise_rewards";
import { levelFromXp as levelFromXpTable } from "@/lib/level_system";
import { evaluateLearningLevels, SubjectKey } from "@/lib/learningLevelEngine";

export function levelFromXp(xp: number): number {
  return levelFromXpTable(xp);
}

type AttemptMeta = {
  hintsUsed?: number;
  responseMs?: number;
  supportTag?: string;
  masteryTag?: string;
  weakItemKey?: string;
  difficultyBand?: "easier" | "core" | "challenge";
};

type SpellingResult = {
  profile: ChildProfile;
  voiceMessage: string;
  promotedDifficulty: boolean;
  surpriseReward: SurpriseReward;
  rewardDelta: {
    stars: number;
    xp: number;
    coins: number;
  };
};

const MAX_LITERACY_INTERVENTIONS = 20;

function describeLiteracySupportReason(
  mode: "balanced" | "spelling_support" | "reading_support",
  spellingCompetency: number,
  readingCompetency: number,
): string {
  if (mode === "spelling_support") {
    return `Spelling competency dropped to ${spellingCompetency}% (below 70%). Activated spelling support scaffolds.`;
  }
  if (mode === "reading_support") {
    return `Reading competency dropped to ${readingCompetency}% (below 65%). Activated reading support scaffolds.`;
  }
  return `Competencies recovered (spelling ${spellingCompetency}%, reading ${readingCompetency}%). Returned to balanced mode.`;
}

function clampLevel(level: number): number {
  return Math.max(1, Math.min(5, level));
}

function clampReadingLevel(level: number): number {
  return Math.max(1, Math.min(10, level));
}

function computeSpellingAccuracyPct(profile: ChildProfile): number {
  const attempts = profile.learnerInsights.spelling.attempts;
  if (!attempts) return 100;
  return Math.round((profile.learnerInsights.spelling.correct / attempts) * 100);
}

function computeReadingAccuracyPct(profile: ChildProfile): number {
  const attempts = profile.learnerInsights.reading.attempts;
  if (!attempts) return 100;
  return Math.round((profile.learnerInsights.reading.correct / attempts) * 100);
}

function computeMathAccuracyPct(profile: ChildProfile): number {
  const attempts = profile.learnerInsights.math.attempts;
  if (!attempts) return 100;
  return Math.round((profile.learnerInsights.math.correct / attempts) * 100);
}

function applyMathSupportPolicy(profile: ChildProfile): ChildProfile {
  const mathAttempts = profile.learnerInsights.math.attempts;
  const mathCompetency = computeMathAccuracyPct(profile);
  const needsMathSupport = mathAttempts >= 5 && mathCompetency < 65;
  const mode: "standard" | "math_support" = needsMathSupport ? "math_support" : "standard";

  const weakOperations = Object.entries(profile.masteryTags.math)
    .filter(([, stats]) => stats.attempts >= 2 && stats.correct / stats.attempts < 0.6)
    .map(([tag]) => tag)
    .slice(0, 3);

  const previousMode = profile.mathSupport?.mode ?? "standard";
  const previousInterventions = profile.mathSupport?.interventions ?? [];
  const interventions = previousMode !== mode
    ? [
      ...previousInterventions,
      {
        ts: new Date().toISOString(),
        fromMode: previousMode,
        toMode: mode,
        reason: mode === "math_support"
          ? `Maths accuracy dropped to ${mathCompetency}% (below 65% after ${mathAttempts} attempts). Activated visual CRA scaffolds and error coaching.`
          : `Maths accuracy recovered to ${mathCompetency}%. Returned to standard mode.`,
        mathCompetency,
      },
    ].slice(-MAX_LITERACY_INTERVENTIONS)
    : previousInterventions;

  const adjustedMathLevel = needsMathSupport
    ? clampLevel(profile.subjectLevels.math - 1)
    : profile.subjectLevels.math;

  return {
    ...profile,
    adaptive: {
      ...profile.adaptive,
      mathDifficulty: adjustedMathLevel,
    },
    subjectLevels: {
      ...profile.subjectLevels,
      math: adjustedMathLevel,
    },
    mathSupport: {
      mathCompetency,
      weakOperations,
      mode,
      interventions,
      updatedAt: new Date().toISOString(),
    },
  };
}

function applyLiteracySupportPolicy(profile: ChildProfile): ChildProfile {
  const spellingAttempts = profile.learnerInsights.spelling.attempts;
  const readingAttempts = profile.learnerInsights.reading.attempts;

  const spellingCompetency = computeSpellingAccuracyPct(profile);
  const readingAccuracy = computeReadingAccuracyPct(profile);
  const oralReadingScore = profile.literacySupport?.oralReadingScore ?? readingAccuracy;
  const readingCompetency = Math.round((readingAccuracy * 0.6) + (oralReadingScore * 0.4));

  const needsSpellingSupport = spellingAttempts >= 3 && spellingCompetency < 70;
  const needsReadingSupport = readingAttempts >= 3 && readingCompetency < 65;
  const mode: "balanced" | "spelling_support" | "reading_support" = needsSpellingSupport
    ? "spelling_support"
    : needsReadingSupport
      ? "reading_support"
      : "balanced";

  const adjustedSpellingLevel = needsSpellingSupport
    ? clampLevel(profile.subjectLevels.spelling - 1)
    : profile.subjectLevels.spelling;
  const adjustedReadingLevel = needsReadingSupport
    ? clampReadingLevel(profile.subjectLevels.reading - 1)
    : profile.subjectLevels.reading;

  const nextBestActivity = mode === "spelling_support"
    ? "Spelling support mode: practise easier words with phonics hints."
    : mode === "reading_support"
      ? "Reading support mode: shorter passages and read-aloud coaching."
      : profile.adaptive.nextBestActivity;

  const previousMode = profile.literacySupport?.mode ?? "balanced";
  const previousInterventions = profile.literacySupport?.interventions ?? [];
  const interventions = previousMode !== mode
    ? [
      ...previousInterventions,
      {
        ts: new Date().toISOString(),
        fromMode: previousMode,
        toMode: mode,
        reason: describeLiteracySupportReason(mode, spellingCompetency, readingCompetency),
        spellingCompetency,
        readingCompetency,
        oralReadingScore,
      },
    ].slice(-MAX_LITERACY_INTERVENTIONS)
    : previousInterventions;

  return {
    ...profile,
    adaptive: {
      ...profile.adaptive,
      spellingDifficulty: adjustedSpellingLevel,
      readingDifficulty: adjustedReadingLevel,
      nextBestActivity,
    },
    subjectLevels: {
      ...profile.subjectLevels,
      spelling: adjustedSpellingLevel,
      reading: adjustedReadingLevel,
    },
    literacySupport: {
      spellingCompetency,
      readingCompetency,
      oralReadingScore,
      mode,
      interventions,
      updatedAt: new Date().toISOString(),
    },
  };
}

function detectSpellingPatterns(word: string): string[] {
  const w = word.toLowerCase();
  const patterns: string[] = [];
  if (/ph/.test(w)) patterns.push("ph");
  if (/ough/.test(w)) patterns.push("ough");
  if (/tion/.test(w)) patterns.push("tion");
  if (/ight/.test(w)) patterns.push("ight");
  if (/ck$/.test(w)) patterns.push("ck_end");
  if (/[aeiou]e$/.test(w)) patterns.push("silent_e");
  if (/(.)(\1)/.test(w)) patterns.push("double_letter");
  if (/wr/.test(w)) patterns.push("wr");
  if (/kn/.test(w)) patterns.push("kn");
  return patterns;
}

function areaDifficultyKey(area: ActivityArea): "spellingDifficulty" | "mathDifficulty" | "readingDifficulty" {
  if (area === "math") return "mathDifficulty";
  if (area === "reading") return "readingDifficulty";
  return "spellingDifficulty";
}

function areaInsightKey(area: Extract<ActivityArea, "spelling" | "math" | "reading">): "spelling" | "math" | "reading" {
  if (area === "math") return "math";
  if (area === "reading") return "reading";
  return "spelling";
}

function resetDailyProgressForDay(profile: ChildProfile, dayKey: string): ChildProfile["dailySubjectProgress"] {
  if (profile.dailySubjectProgress.dayKey === dayKey) return profile.dailySubjectProgress;
  return {
    ...profile.dailySubjectProgress,
    dayKey,
    completed: { spelling: 0, math: 0, reading: 0 },
    weakItems: { spelling: [], math: [], reading: [] },
  };
}

function processAdaptiveAttempt(
  profile: ChildProfile,
  area: Extract<ActivityArea, "spelling" | "math" | "reading">,
  isCorrect: boolean,
  _questionId?: string,
  meta?: AttemptMeta
): SpellingResult {
  const difficultyKey = areaDifficultyKey(area);
  const insightKey = areaInsightKey(area);
  const currentDifficulty = profile.adaptive[difficultyKey];
  const hintsUsed = meta?.hintsUsed ?? 0;
  const responseMs = meta?.responseMs ?? 0;
  const hintPenalty = Math.min(3, hintsUsed);
  const starsDelta = isCorrect ? 4 + currentDifficulty : 0;
  const xpDelta = isCorrect ? Math.max(4, 10 + currentDifficulty * 3 - hintPenalty * 2) : 2;
  const coinDelta = isCorrect ? Math.max(1, 2 + Math.floor(currentDifficulty / 2) - hintPenalty) : 0;
  const surpriseReward = rollSurpriseReward(profile, currentDifficulty, isCorrect);

  let nextStreak = isCorrect ? profile.adaptive.spellingStreak + 1 : 0;

  const history = recordProfileLearningEvent(profile, {
    ts: new Date().toISOString(),
    activity: area,
    score: isCorrect ? 1 : 0,
    correct: isCorrect,
    difficulty: currentDifficulty,
    notes: `${isCorrect ? "Correct answer" : "Incorrect answer"}${hintsUsed ? ` | hints:${hintsUsed}` : ""}${meta?.supportTag ? ` | support:${meta.supportTag}` : ""}`,
  });

  const previousInsight = profile.learnerInsights[insightKey];
  const nextAttempts = previousInsight.attempts + 1;
  const nextCorrect = previousInsight.correct + (isCorrect ? 1 : 0);
  const nextAvgResponseMs = responseMs > 0
    ? Math.round(((previousInsight.avgResponseMs * previousInsight.attempts) + responseMs) / nextAttempts)
    : previousInsight.avgResponseMs;
  const accuracy = nextAttempts ? nextCorrect / nextAttempts : 0;
  const supportTag = meta?.supportTag ?? "";
  const masteryTag = (meta?.masteryTag ?? supportTag ?? "").trim().toLowerCase();
  const weakItemKey = (meta?.weakItemKey ?? "").trim().toLowerCase();
  const dayKey = new Date().toISOString().slice(0, 10);
  const nextDailyProgress = resetDailyProgressForDay(profile, dayKey);
  const currentMastery = profile.masteryTags[insightKey] ?? {};

  const nextMasteryForSubject = { ...currentMastery };
  if (masteryTag) {
    const prev = nextMasteryForSubject[masteryTag] ?? { attempts: 0, correct: 0 };
    nextMasteryForSubject[masteryTag] = {
      attempts: prev.attempts + 1,
      correct: prev.correct + (isCorrect ? 1 : 0),
    };
  }

  const weakItemsForSubject = [...(nextDailyProgress.weakItems[insightKey] ?? [])];
  if (!isCorrect && weakItemKey) {
    if (!weakItemsForSubject.includes(weakItemKey)) {
      weakItemsForSubject.push(weakItemKey);
    }
  }
  if (isCorrect && weakItemKey) {
    const idx = weakItemsForSubject.indexOf(weakItemKey);
    if (idx >= 0) {
      weakItemsForSubject.splice(idx, 1);
    }
  }

  const completedBySubject = {
    ...nextDailyProgress.completed,
    [insightKey]: nextDailyProgress.completed[insightKey] + (isCorrect ? 1 : 0),
  };

  const strengths = new Set(previousInsight.strengths);
  const needsSupport = new Set(previousInsight.needsSupport);
  const repeatedMistakes = new Set(previousInsight.repeatedMistakes);

  if (isCorrect && hintsUsed <= 1 && responseMs > 0 && responseMs < 12000) {
    strengths.add("Independent solving");
  }
  if (isCorrect && supportTag) {
    strengths.add(`Improved in ${supportTag}`);
    needsSupport.delete(supportTag);
  }
  if (!isCorrect && supportTag) {
    needsSupport.add(supportTag);
    repeatedMistakes.add(supportTag);
  }
  if (hintsUsed >= 3) {
    needsSupport.add("Needs scaffolded hints");
  }

  const draftInsights = {
    ...profile.learnerInsights,
    [insightKey]: {
      ...previousInsight,
      level: currentDifficulty,
      attempts: nextAttempts,
      correct: nextCorrect,
      hintsUsed: previousInsight.hintsUsed + hintsUsed,
      avgResponseMs: nextAvgResponseMs,
      strengths: Array.from(strengths).slice(-5),
      needsSupport: Array.from(needsSupport).slice(-5),
      repeatedMistakes: Array.from(repeatedMistakes).slice(-6),
      audioSupportNeeded: hintsUsed >= 2 || accuracy < 0.65,
    },
    updatedAt: new Date().toISOString(),
  };

  const subjectPerformance = (subject: SubjectKey) => {
    const insight = draftInsights[subject];
    const attempts = Math.max(0, insight.attempts);
    const accuracyPct = attempts > 0 ? (insight.correct / attempts) * 100 : 0;
    return {
      accuracy: accuracyPct,
      attempts,
      hintsUsed: insight.hintsUsed,
      avgResponseMs: insight.avgResponseMs,
      retries: insight.audioSupportNeeded ? 2 : 0,
      repeatedMistakes: insight.repeatedMistakes.length,
      weakTopics: insight.needsSupport.length,
      masteredTopics: insight.strengths.length,
      recallSuccess: accuracyPct,
      bossSuccess: Math.max(0, Math.min(100, accuracyPct - insight.hintsUsed)),
    };
  };

  const levelResult = evaluateLearningLevels({
    ageYears: profile.ageYears,
    yearGroup: profile.yearGroup,
    startLevelChoice: profile.startLevelChoice,
    levels: {
      spelling: profile.subjectLevels.spelling,
      reading: profile.subjectLevels.reading,
      math: profile.subjectLevels.math,
    },
    performance: {
      spelling: subjectPerformance("spelling"),
      reading: subjectPerformance("reading"),
      math: subjectPerformance("math"),
    },
    maxLevel: 10,
    maxLevels: {
      spelling: 5,
      reading: 10,
      math: 5,
    },
  });

  const nextDifficulty = area === "spelling"
    ? levelResult.spellingLevel
    : area === "reading"
      ? levelResult.readingLevel
      : levelResult.mathsLevel;
  const promotedDifficulty = nextDifficulty > currentDifficulty;
  if (promotedDifficulty) {
    nextStreak = 0;
  }

  const decisionForArea = levelResult.decisions.find((d) => d.subject === insightKey);
  const levelDecisions = decisionForArea
    ? [
      ...(profile.levelDecisions ?? []),
      {
        ts: new Date().toISOString(),
        subject: decisionForArea.subject,
        previousLevel: decisionForArea.previousLevel,
        nextLevel: decisionForArea.level,
        confidenceScore: decisionForArea.confidenceScore,
        reasons: decisionForArea.reasons,
      },
    ].slice(-50)
    : (profile.levelDecisions ?? []);

  // --- Learning Memory: weakness map, spelling patterns, math skills ---
  const nextWeaknessMap = { ...profile.weaknessMap };
  const nextSpellingPatterns = { ...profile.spellingPatterns };
  const nextMathSkills = { ...profile.mathSkills };

  if (area === "spelling" && supportTag) {
    const wordKey = supportTag.toLowerCase();
    if (!isCorrect) {
      nextWeaknessMap[wordKey] = (nextWeaknessMap[wordKey] ?? 0) + 1;
      for (const pat of detectSpellingPatterns(wordKey)) {
        nextSpellingPatterns[pat] = (nextSpellingPatterns[pat] ?? 0) + 1;
      }
    } else {
      nextWeaknessMap[wordKey] = Math.max(0, (nextWeaknessMap[wordKey] ?? 0) - 1);
    }
  }

  if (area === "math" && supportTag) {
    const prev = nextMathSkills[supportTag] ?? { score: 0.5, attempts: 0, correct: 0 };
    const mAttempts = prev.attempts + 1;
    const mCorrect = prev.correct + (isCorrect ? 1 : 0);
    nextMathSkills[supportTag] = { score: mCorrect / mAttempts, attempts: mAttempts, correct: mCorrect };
  }
  // ---

  let updated: ChildProfile = {
    ...profile,
    stars: profile.stars + starsDelta + surpriseReward.starsBonus,
    xp: profile.xp + xpDelta,
    coins: profile.coins + coinDelta + surpriseReward.coinsBonus,
    adaptive: {
      ...profile.adaptive,
      [difficultyKey]: nextDifficulty,
      spellingDifficulty: levelResult.spellingLevel,
      readingDifficulty: levelResult.readingLevel,
      mathDifficulty: levelResult.mathsLevel,
      spellingStreak: nextStreak,
      weakAreas: computeWeakAreas(history),
      nextBestActivity: levelResult.needsPlacementCheck
        ? "Baseline check: complete 3 short activities in spelling, reading, and maths."
        : levelResult.nextBestActivity,
      lastVoiceMessage: nextVoiceMessage(profile, isCorrect),
    },
    subjectLevels: {
      spelling: levelResult.spellingLevel,
      reading: levelResult.readingLevel,
      math: levelResult.mathsLevel,
    },
    learnerInsights: draftInsights,
    levelDecisions,
    dailySubjectProgress: {
      ...nextDailyProgress,
      completed: completedBySubject,
      weakItems: {
        ...nextDailyProgress.weakItems,
        [insightKey]: weakItemsForSubject,
      },
    },
    masteryTags: {
      ...profile.masteryTags,
      [insightKey]: nextMasteryForSubject,
    },
    weaknessMap: nextWeaknessMap,
    spellingPatterns: nextSpellingPatterns,
    mathSkills: nextMathSkills,
  };

  updated = applyLiteracySupportPolicy(updated);

  if (area === "math") {
    updated = applyMathSupportPolicy(updated);
  }

  updated = applyPetOutcome(updated, isCorrect ? "correct" : "wrong");
  if (promotedDifficulty) {
    updated = applyPetOutcome(updated, "level-up");
  }
  if (surpriseReward.awarded) {
    updated = applyPetOutcome(updated, "reward");
  }

  return {
    profile: updated,
    voiceMessage: updated.adaptive.lastVoiceMessage,
    promotedDifficulty,
    surpriseReward,
    rewardDelta: {
      stars: Math.max(0, updated.stars - profile.stars),
      xp: Math.max(0, updated.xp - profile.xp),
      coins: Math.max(0, updated.coins - profile.coins),
    },
  };
}

export function processSpellingAttempt(profile: ChildProfile, isCorrect: boolean, questionId?: string, meta?: AttemptMeta): SpellingResult {
  return processAdaptiveAttempt(profile, "spelling", isCorrect, questionId, meta);
}

export function processMathAttempt(profile: ChildProfile, isCorrect: boolean, questionId?: string, meta?: AttemptMeta): SpellingResult {
  return processAdaptiveAttempt(profile, "math", isCorrect, questionId, meta);
}

export function processReadingAttempt(profile: ChildProfile, isCorrect: boolean, questionId?: string, meta?: AttemptMeta): SpellingResult {
  return processAdaptiveAttempt(profile, "reading", isCorrect, questionId, meta);
}

export function applyReadingFluencyAssessment(profile: ChildProfile, oralReadingScore: number): ChildProfile {
  const safeScore = Math.max(0, Math.min(100, Math.round(oralReadingScore)));
  const merged: ChildProfile = {
    ...profile,
    literacySupport: {
      spellingCompetency: profile.literacySupport?.spellingCompetency ?? computeSpellingAccuracyPct(profile),
      readingCompetency: profile.literacySupport?.readingCompetency ?? computeReadingAccuracyPct(profile),
      oralReadingScore: safeScore,
      mode: profile.literacySupport?.mode ?? "balanced",
      interventions: profile.literacySupport?.interventions ?? [],
      updatedAt: new Date().toISOString(),
    },
  };

  return applyLiteracySupportPolicy(merged);
}
