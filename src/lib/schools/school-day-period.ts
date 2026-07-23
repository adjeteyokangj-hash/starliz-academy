/** Shared school-day period clock helpers for admin, tutor, and student boards. */

export type PeriodClockState = "before_school" | "now" | "upcoming" | "past" | "after_school";

export type TimedPeriod = {
  id: string;
  startsAt: string;
  endsAt: string;
  periodIndex?: number;
};

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function schoolDayOfWeek(date = new Date()): number {
  const day = date.getDay();
  if (day === 0 || day === 6) return 1;
  return day;
}

export function weekdayLabel(dayOfWeek: number): string {
  if (dayOfWeek >= 1 && dayOfWeek <= 5) return DAY_LABELS[dayOfWeek];
  return "Weekday";
}

export function parseHmToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return -1;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return -1;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return -1;
  return hours * 60 + minutes;
}

export function isValidTimeRange(startsAt: string, endsAt: string): boolean {
  const start = parseHmToMinutes(startsAt);
  const end = parseHmToMinutes(endsAt);
  return start >= 0 && end >= 0 && end > start;
}

export function minutesNow(date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function comparePeriods(a: TimedPeriod, b: TimedPeriod): number {
  const byStart = a.startsAt.localeCompare(b.startsAt);
  if (byStart !== 0) return byStart;
  return (a.periodIndex ?? 0) - (b.periodIndex ?? 0);
}

export function sortPeriodsByTime<T extends TimedPeriod>(periods: T[]): T[] {
  return [...periods].sort(comparePeriods);
}

export function resolvePeriodState(
  startsAt: string,
  endsAt: string,
  nowMinutes: number,
  dayBounds?: { firstStart: number; lastEnd: number },
): PeriodClockState {
  const start = parseHmToMinutes(startsAt);
  const end = parseHmToMinutes(endsAt);
  if (start < 0 || end < 0) return "upcoming";
  if (nowMinutes >= start && nowMinutes < end) return "now";
  if (nowMinutes >= end) return "past";
  if (dayBounds && nowMinutes < dayBounds.firstStart) return "before_school";
  if (dayBounds && nowMinutes >= dayBounds.lastEnd) return "after_school";
  return "upcoming";
}

export function dayBoundsFromPeriods(periods: TimedPeriod[]): { firstStart: number; lastEnd: number } | null {
  if (periods.length === 0) return null;
  let firstStart = Number.POSITIVE_INFINITY;
  let lastEnd = Number.NEGATIVE_INFINITY;
  for (const period of periods) {
    const start = parseHmToMinutes(period.startsAt);
    const end = parseHmToMinutes(period.endsAt);
    if (start >= 0) firstStart = Math.min(firstStart, start);
    if (end >= 0) lastEnd = Math.max(lastEnd, end);
  }
  if (!Number.isFinite(firstStart) || !Number.isFinite(lastEnd)) return null;
  return { firstStart, lastEnd };
}

export function findCurrentPeriod<T extends TimedPeriod>(
  periods: T[],
  nowMinutes = minutesNow(),
): T | null {
  const ordered = sortPeriodsByTime(periods);
  return ordered.find((period) => {
    const start = parseHmToMinutes(period.startsAt);
    const end = parseHmToMinutes(period.endsAt);
    return start >= 0 && end >= 0 && nowMinutes >= start && nowMinutes < end;
  }) ?? null;
}

export function findNextPeriod<T extends TimedPeriod>(
  periods: T[],
  nowMinutes = minutesNow(),
): T | null {
  const ordered = sortPeriodsByTime(periods);
  return ordered.find((period) => {
    const start = parseHmToMinutes(period.startsAt);
    return start >= 0 && start > nowMinutes;
  }) ?? null;
}

export function describeSchoolClock(
  periods: TimedPeriod[],
  nowMinutes = minutesNow(),
): {
  phase: "before_school" | "in_session" | "after_school" | "no_timetable";
  current: TimedPeriod | null;
  next: TimedPeriod | null;
} {
  if (periods.length === 0) {
    return { phase: "no_timetable", current: null, next: null };
  }
  const bounds = dayBoundsFromPeriods(periods);
  const current = findCurrentPeriod(periods, nowMinutes);
  const next = findNextPeriod(periods, nowMinutes);
  if (!bounds) {
    return { phase: "in_session", current, next };
  }
  if (nowMinutes < bounds.firstStart) {
    return { phase: "before_school", current: null, next };
  }
  if (nowMinutes >= bounds.lastEnd) {
    return { phase: "after_school", current: null, next: null };
  }
  return { phase: "in_session", current, next };
}
