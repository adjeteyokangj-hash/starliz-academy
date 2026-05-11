import { ChildProfile } from "@/lib/store";
import { getProfileHistory } from "@/lib/progress_data";
import { LearningEvent } from "@/lib/history_api";

export type DailyStarsPoint = { day: string; stars: number };

export function toGrade(score: number): "Excellent" | "Good" | "Needs Practice" {
  if (score >= 0.85) return "Excellent";
  if (score >= 0.65) return "Good";
  return "Needs Practice";
}

export function buildParentAnalytics(profile: ChildProfile, historyOverride?: LearningEvent[]) {
  const history = historyOverride ?? getProfileHistory(profile);
  const recent = history.slice(-50);
  const todayKey = new Date().toISOString().slice(0, 10);
  const weekAgoDate = new Date();
  weekAgoDate.setDate(weekAgoDate.getDate() - 7);
  const weekAgo = weekAgoDate.getTime();

  const activityUsage = {
    spelling: recent.filter((h) => h.activity === "spelling").length,
    math: recent.filter((h) => h.activity === "math").length,
    reading: recent.filter((h) => h.activity === "reading").length,
    coding: recent.filter((h) => h.activity === "coding").length,
  };

  const dailyMap = new Map<string, number>();
  for (const row of recent) {
    const day = row.ts.slice(0, 10);
    const points = row.correct ? 5 : 0;
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + points);
  }

  const starsPerDay: DailyStarsPoint[] = Array.from(dailyMap.entries())
    .map(([day, stars]) => ({ day, stars }))
    .slice(-7);

  const avgAccuracy = recent.length
    ? recent.reduce((acc, row) => acc + row.score, 0) / recent.length
    : 1;

  const todayCompleted = recent.filter((h) => h.ts.slice(0, 10) === todayKey).length;
  const weekCompleted = recent.filter((h) => new Date(h.ts).getTime() >= weekAgo).length;

  return {
    starsPerDay,
    activityUsage,
    weakAreas: profile.adaptive.weakAreas,
    weeklySummary: {
      completed: recent.length,
      averageAccuracy: avgAccuracy,
      grade: toGrade(avgAccuracy),
    },
    goals: {
      todayCompleted,
      weekCompleted,
      dailyGoalMet: todayCompleted >= profile.dailyGoal,
      weeklyTargetMet: weekCompleted >= profile.weeklyTarget,
    },
  };
}
