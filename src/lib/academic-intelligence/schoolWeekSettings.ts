import { SchoolWeekSettings, SchoolWeekday } from "@/lib/academic-intelligence/types";

const SCHOOL_WEEK_DAYS: SchoolWeekday[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export const DEFAULT_SCHOOL_WEEK_SETTINGS: SchoolWeekSettings = {
  enabled: true,
  activeDays: [...SCHOOL_WEEK_DAYS],
  startTime: "16:00",
  endTime: "19:00",
  lessonBlockMinutes: 35,
  shortBreakMinutes: 10,
  lunchMinutes: 30,
  dailySubjectLimit: 2,
  weeklySubjectSelection: [],
  includeCatchUpTasks: true,
  includeRevisionBlocks: true,
  includeHomeworkBlock: true,
  includeQuizReviewBlock: true,
  includeWellbeingBlock: false,
  includeEndOfDaySummary: true,
  parentAdminNotes: null,
};

type JsonObject = Record<string, unknown>;

function parseJsonObject(raw: string | null | undefined): JsonObject {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as JsonObject;
    }
  } catch {
    // Ignore malformed profile JSON and use defaults.
  }
  return {};
}

function normalizeTime(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const match = value.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? `${match[1]}:${match[2]}` : fallback;
}

function normalizeMinutes(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) return fallback;
  return rounded;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeActiveDays(value: unknown, fallback: SchoolWeekday[]): SchoolWeekday[] {
  if (!Array.isArray(value)) return fallback;
  const next = value.filter((entry): entry is SchoolWeekday => typeof entry === "string" && SCHOOL_WEEK_DAYS.includes(entry as SchoolWeekday));
  return next.length ? Array.from(new Set(next)) : fallback;
}

function toJsonObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
}

export function sanitizeSchoolWeekSettings(
  input: Partial<SchoolWeekSettings> | null | undefined,
  fallback: SchoolWeekSettings = DEFAULT_SCHOOL_WEEK_SETTINGS,
): SchoolWeekSettings {
  const candidate = input ?? {};
  const activeDays = normalizeActiveDays(candidate.activeDays, fallback.activeDays);

  return {
    enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : fallback.enabled,
    activeDays,
    startTime: normalizeTime(candidate.startTime, fallback.startTime),
    endTime: normalizeTime(candidate.endTime, fallback.endTime),
    lessonBlockMinutes: normalizeMinutes(candidate.lessonBlockMinutes, fallback.lessonBlockMinutes, 20, 90),
    shortBreakMinutes: normalizeMinutes(candidate.shortBreakMinutes, fallback.shortBreakMinutes, 5, 20),
    lunchMinutes: normalizeMinutes(candidate.lunchMinutes, fallback.lunchMinutes, 15, 60),
    dailySubjectLimit: normalizeMinutes(candidate.dailySubjectLimit, fallback.dailySubjectLimit, 1, 4),
    weeklySubjectSelection: normalizeStringArray(candidate.weeklySubjectSelection),
    includeCatchUpTasks: typeof candidate.includeCatchUpTasks === "boolean" ? candidate.includeCatchUpTasks : fallback.includeCatchUpTasks,
    includeRevisionBlocks: typeof candidate.includeRevisionBlocks === "boolean" ? candidate.includeRevisionBlocks : fallback.includeRevisionBlocks,
    includeHomeworkBlock: typeof candidate.includeHomeworkBlock === "boolean" ? candidate.includeHomeworkBlock : fallback.includeHomeworkBlock,
    includeQuizReviewBlock: typeof candidate.includeQuizReviewBlock === "boolean" ? candidate.includeQuizReviewBlock : fallback.includeQuizReviewBlock,
    includeWellbeingBlock: typeof candidate.includeWellbeingBlock === "boolean" ? candidate.includeWellbeingBlock : fallback.includeWellbeingBlock,
    includeEndOfDaySummary: typeof candidate.includeEndOfDaySummary === "boolean" ? candidate.includeEndOfDaySummary : fallback.includeEndOfDaySummary,
    parentAdminNotes: typeof candidate.parentAdminNotes === "string"
      ? candidate.parentAdminNotes.trim().slice(0, 300)
      : (candidate.parentAdminNotes === null ? null : fallback.parentAdminNotes),
  };
}

export function readSchoolWeekSettingsFromProfileJson(raw: string | null | undefined): SchoolWeekSettings {
  const parsed = parseJsonObject(raw);
  const schoolWeekMode = toJsonObject(parsed.schoolWeekModeSettings);
  return sanitizeSchoolWeekSettings(schoolWeekMode as Partial<SchoolWeekSettings>, DEFAULT_SCHOOL_WEEK_SETTINGS);
}

export function mergeSchoolWeekSettingsIntoProfileJson(input: {
  existingJson?: string | null;
  settings: Partial<SchoolWeekSettings>;
}): string {
  const base = parseJsonObject(input.existingJson);
  const current = readSchoolWeekSettingsFromProfileJson(input.existingJson);
  const mergedSettings = sanitizeSchoolWeekSettings(input.settings, current);
  const next = {
    ...base,
    schoolWeekModeSettings: mergedSettings,
  };
  return JSON.stringify(next);
}

export function stripSchoolWeekSensitiveFields(settings: SchoolWeekSettings): Omit<SchoolWeekSettings, "parentAdminNotes"> {
  const safe = { ...settings };
  delete safe.parentAdminNotes;
  return safe;
}
