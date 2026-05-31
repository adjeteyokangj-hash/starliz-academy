import type { WeeklyWeaknessCandidate } from "@/lib/homework-phase1a/types";

function weaknessPriorityScore(candidate: WeeklyWeaknessCandidate): number {
  const repeatedMistakeWeight = candidate.repeatedMistakes * 1000;
  const lowScoreWeight = (candidate.averageScore === null ? 40 : Math.max(0, 100 - candidate.averageScore)) * 100;
  const coreTopicWeight = candidate.coreTopicWeakness ? 5000 : 0;
  const masteryGapWeight = candidate.masteryGap ? 3000 : 0;
  const coachWeight = candidate.coachUsageCount * 40;
  const completionWeight = candidate.completionIssueCount * 25;
  const previousHomeworkWeight = candidate.previousHomeworkWeakness ? 2000 : 0;
  return repeatedMistakeWeight + lowScoreWeight + coreTopicWeight + masteryGapWeight + coachWeight + completionWeight + previousHomeworkWeight;
}

export function rankWeeklyWeaknesses(candidates: WeeklyWeaknessCandidate[]): WeeklyWeaknessCandidate[] {
  return [...candidates].sort((left, right) => {
    const scoreDiff = weaknessPriorityScore(right) - weaknessPriorityScore(left);
    if (scoreDiff !== 0) return scoreDiff;
    return right.estimatedMinutes - left.estimatedMinutes;
  });
}
