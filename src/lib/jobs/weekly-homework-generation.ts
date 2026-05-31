import { runWeeklyHomeworkFridayGeneration } from "@/lib/homework-phase1f/service";

export async function runWeeklyHomeworkGenerationJob() {
  const summary = await runWeeklyHomeworkFridayGeneration();
  return {
    featureEnabled: summary.featureEnabled,
    considered: summary.totals.considered,
    created: summary.totals.created,
    skipped: summary.totals.skipped,
    duplicatePrevented: summary.totals.duplicatePrevented,
  };
}
