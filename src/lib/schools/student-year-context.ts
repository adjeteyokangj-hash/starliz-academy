/**
 * Shared student year-resolution contract for Day School + Short Learning.
 *
 * Official year remains ChildProfile.yearGroup until a school rollover applies.
 * Incoming year is derived only for summer preparation messaging/context — never persisted.
 */

import {
  YEAR_GROUPS,
  normalizeYearGroup,
  yearGroupToOrdinal,
  type YearGroup,
} from "@/lib/curriculum";

/** Single safe fallback when official and classroom years are both missing. */
export const SAFE_YEAR_GROUP_FALLBACK = "Year 4" as const;

export type StudentYearSource =
  | "child-profile"
  | "classroom"
  | "working-year"
  | "safe-fallback";

export type ResolvedStudentYearContext = {
  administrativeYearGroup: string | null;
  learningYearGroup: string;
  targetYearGroup: string | null;
  academicYearLabel: string | null;
  officialYearGroup: string | null;
  classroomYearGroup: string | null;
  classroomName: string | null;
  classroomAcademicYear: string | null;
  workingYearGroup: string | null;
  incomingYearGroup: string | null;
  /** Year used for Day School timetable / published SL journey matching. */
  targetLearningYearGroup: string;
  source: StudentYearSource;
  isSummerTransition: boolean;
  yearDisplayLabel: string;
  summerPreparationLabel: string | null;
  summerTeachingIntent: string | null;
};

export type ResolveStudentYearInput = {
  officialYearGroup?: string | null;
  classroomYearGroup?: string | null;
  classroomName?: string | null;
  classroomAcademicYear?: string | null;
  /** Existing QLF/placement working year only — never StudentProfile.learningLevel. */
  workingYearGroup?: string | null;
  now?: Date;
  /**
   * Day School = official timetable context (ignore incoming for targeting).
   * Short Learning = may attach summer preparation context alongside official targeting.
   */
  surface?: "day-school" | "short-learning" | "dashboard";
};

/**
 * UK summer preparation window (Europe/London calendar date of `now`).
 * Begins after typical mid-July teaching close; ends before 1 September.
 * Inject `now` in tests — do not scatter month/day checks in UI.
 */
export function isUkSummerTransition(now: Date = new Date()): boolean {
  const month = now.getMonth(); // 0-based
  const day = now.getDate();
  if (month === 6 && day >= 16) return true; // 16 July+
  if (month === 7) return true; // August
  return false;
}

export function nextPromotableYearGroup(value: string | null | undefined): YearGroup | null {
  const ordinal = yearGroupToOrdinal(value);
  if (ordinal === null) return null;
  if (ordinal >= YEAR_GROUPS.length - 1) return null; // Year 11 — no next
  return YEAR_GROUPS[ordinal + 1] ?? null;
}

function normalizeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : null;
}

function labelsEquivalent(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeLabel(a)?.toLowerCase() ?? null;
  const right = normalizeLabel(b)?.toLowerCase() ?? null;
  if (!left || !right) return false;
  return left === right;
}

/**
 * Collapse duplicate year · class labels (e.g. "Year 4 · Year 4" → "Year 4").
 * When names differ meaningfully: "Year 4 · Class 4A".
 */
export function formatYearClassDisplay(input: {
  yearGroup: string | null | undefined;
  classroomName: string | null | undefined;
}): string {
  const year = normalizeLabel(input.yearGroup);
  const name = normalizeLabel(input.classroomName);
  if (year && name && !labelsEquivalent(year, name)) {
    return `${year} · ${name}`;
  }
  if (year) return year;
  if (name) return name;
  return "School";
}

export function resolveStudentYearContext(
  input: ResolveStudentYearInput,
): ResolvedStudentYearContext {
  const now = input.now ?? new Date();
  const surface = input.surface ?? "dashboard";

  const officialRaw = normalizeLabel(input.officialYearGroup);
  const classroomYearRaw = normalizeLabel(input.classroomYearGroup);
  const classroomName = normalizeLabel(input.classroomName);
  const classroomAcademicYear = normalizeLabel(input.classroomAcademicYear);
  const workingRaw = normalizeLabel(input.workingYearGroup);

  const officialCanonical = normalizeYearGroup(officialRaw);
  const classroomCanonical = normalizeYearGroup(classroomYearRaw);
  const workingCanonical = normalizeYearGroup(workingRaw);

  const officialYearGroup = officialCanonical ?? officialRaw;
  const classroomYearGroup = classroomCanonical ?? classroomYearRaw;
  const workingYearGroup = workingCanonical ?? workingRaw;

  let source: StudentYearSource = "safe-fallback";
  let targetLearningYearGroup: string = SAFE_YEAR_GROUP_FALLBACK;

  if (officialYearGroup) {
    source = "child-profile";
    targetLearningYearGroup = officialYearGroup;
  } else if (classroomYearGroup) {
    source = "classroom";
    targetLearningYearGroup = classroomYearGroup;
  } else if (workingYearGroup) {
    source = "working-year";
    targetLearningYearGroup = workingYearGroup;
  }

  // Working year may inform AI placement when present; Day School stays official/classroom.
  void surface;

  const isSummer = isUkSummerTransition(now);
  const basisForIncoming = officialYearGroup ?? classroomYearGroup;
  const incomingYearGroup =
    isSummer && basisForIncoming
      ? nextPromotableYearGroup(basisForIncoming)
      : null;

  const displayYear = officialYearGroup ?? classroomYearGroup;
  const yearDisplayLabel = formatYearClassDisplay({
    yearGroup: displayYear,
    classroomName,
  });

  const summerPreparationLabel =
    isSummer && incomingYearGroup
      ? `Preparing for ${incomingYearGroup}`
      : null;

  const summerTeachingIntent =
    isSummer && incomingYearGroup && displayYear
      ? `consolidate ${displayYear} and prepare for ${incomingYearGroup}`
      : null;

  return {
    officialYearGroup: officialYearGroup,
    classroomYearGroup: classroomYearGroup,
    classroomName,
    classroomAcademicYear,
    workingYearGroup: workingYearGroup,
    incomingYearGroup,
    targetYearGroup: incomingYearGroup ?? officialYearGroup,
    targetLearningYearGroup,
    administrativeYearGroup: officialYearGroup,
    learningYearGroup: targetLearningYearGroup,
    academicYearLabel: classroomAcademicYear,
    source,
    isSummerTransition: isSummer && Boolean(incomingYearGroup),
    yearDisplayLabel,
    summerPreparationLabel,
    summerTeachingIntent,
  };
}

export type ShortLearningYearGuidance = {
  yearGroup: string;
  officialYearGroup: string | null;
  incomingYearGroup: string | null;
  isSummerTransition: boolean;
  mode: "standard" | "summer-transition";
  teachingIntent: string | null;
};

export function toShortLearningYearGuidance(
  ctx: ResolvedStudentYearContext,
): ShortLearningYearGuidance {
  return {
    yearGroup: ctx.targetLearningYearGroup,
    officialYearGroup: ctx.officialYearGroup,
    incomingYearGroup: ctx.incomingYearGroup,
    isSummerTransition: ctx.isSummerTransition,
    mode: ctx.isSummerTransition ? "summer-transition" : "standard",
    teachingIntent: ctx.summerTeachingIntent,
  };
}