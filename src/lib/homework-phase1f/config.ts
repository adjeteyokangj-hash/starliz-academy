import { normalizeYearGroup } from "@/lib/curriculum";

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return defaultValue;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function envCsvSet(name: string): Set<string> {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return new Set<string>();
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

const pausedKeywords = ["holiday", "paused", "pause", "travel", "break", "excused"];

export function isWeeklyHomeworkPhase1FEnabled(): boolean {
  return envFlag("WEEKLY_HOMEWORK_PHASE1B_ENABLED", false);
}

export function allowedHomeworkCohortStudentIds(): Set<string> {
  return envCsvSet("WEEKLY_HOMEWORK_PHASE1F_COHORT_STUDENT_IDS");
}

export function allowedHomeworkYearGroups(): Set<string> {
  const raw = envCsvSet("WEEKLY_HOMEWORK_PHASE1F_YEAR_GROUPS");
  const normalized = new Set<string>();
  for (const item of raw) {
    const value = normalizeYearGroup(item) ?? item;
    normalized.add(value);
  }
  return normalized;
}

export function isStudentInAllowedHomeworkCohort(studentId: string): boolean {
  const cohort = allowedHomeworkCohortStudentIds();
  return cohort.size === 0 || cohort.has(studentId);
}

export function isYearGroupAllowedForHomework(yearGroup: string | null | undefined): boolean {
  const allowed = allowedHomeworkYearGroups();
  if (allowed.size === 0) return true;
  const normalized = normalizeYearGroup(yearGroup) ?? (yearGroup ?? "").trim();
  return normalized.length > 0 && allowed.has(normalized);
}

export function hasPausedOrHolidayNote(note: string | null | undefined): boolean {
  const normalized = (note ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return pausedKeywords.some((keyword) => normalized.includes(keyword));
}
