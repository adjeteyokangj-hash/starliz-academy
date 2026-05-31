function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return defaultValue;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function isWeeklyHomeworkPhase1BEnabled(): boolean {
  return envFlag("WEEKLY_HOMEWORK_PHASE1B_ENABLED", false);
}
