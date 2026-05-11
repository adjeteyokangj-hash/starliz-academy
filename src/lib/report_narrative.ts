import { ChildProfile } from "@/lib/store";
import { buildParentAnalytics } from "@/lib/analytics";
import { LearningEvent } from "@/lib/history_api";

export function getTeacherSummary(profile: ChildProfile, history?: LearningEvent[]): string[] {
  const analytics = buildParentAnalytics(profile, history);
  const lines: string[] = [];

  lines.push(`${profile.name} is currently working at Level ${Math.min(50, Math.floor(profile.xp / 100) + 1)} with ${profile.stars} stars earned.`);

  if (analytics.weeklySummary.grade === "Excellent") {
    lines.push("This week showed strong focus, steady effort, and excellent accuracy across activities.");
  } else if (analytics.weeklySummary.grade === "Good") {
    lines.push("This week showed good progress with a solid foundation and room for extra repetition.");
  } else {
    lines.push("This week suggests a need for more guided practice and shorter focused sessions.");
  }

  if (analytics.weakAreas.length) {
    lines.push(`Recommended support area: ${analytics.weakAreas.join(", ")}.`);
  } else {
    lines.push("No major weak areas were detected in the latest activity history.");
  }

  if (analytics.goals.dailyGoalMet || analytics.goals.weeklyTargetMet) {
    lines.push("Goal-setting is supporting consistency well and should continue.");
  } else {
    lines.push("Encouraging one more short session per day would help goal progress.");
  }

  return lines;
}
