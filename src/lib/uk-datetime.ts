/**
 * Canonical UK date/time helpers for Short Learning and parent/student surfaces.
 * Contract: interpret booking wall-clock in Europe/London; store UTC; display Europe/London.
 */

export const UK_TIMEZONE = "Europe/London";

export type UkDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0=Sunday … 6=Saturday
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function getUkParts(instant: Date, timeZone: string = UK_TIMEZONE): UkDateParts {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  const weekdayName = get("weekday");
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: weekdayMap[weekdayName] ?? 0,
  };
}

/**
 * Convert a Europe/London (or other IANA) local civil datetime to a UTC Instant.
 * Handles BST/GMT via Intl; for spring-forward gaps snaps forward; for fall-back
 * ambiguity prefers the earlier offset.
 */
export function zonedLocalToUtc(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
  timeZone?: string;
}): Date {
  const timeZone = input.timeZone ?? UK_TIMEZONE;
  const second = input.second ?? 0;
  const desiredAsUtcMs = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, second);

  let guess = desiredAsUtcMs;
  for (let i = 0; i < 4; i += 1) {
    const parts = getUkParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const delta = desiredAsUtcMs - asUtc;
    if (delta === 0) break;
    guess += delta;
  }

  // If still in a spring-forward gap, walk forward in 15-minute steps until parts match.
  const resolved = getUkParts(new Date(guess), timeZone);
  const matches =
    resolved.year === input.year
    && resolved.month === input.month
    && resolved.day === input.day
    && resolved.hour === input.hour
    && resolved.minute === input.minute;
  if (!matches) {
    for (let step = 0; step < 8; step += 1) {
      guess += 15 * 60_000;
      const p = getUkParts(new Date(guess), timeZone);
      if (
        p.year === input.year
        && p.month === input.month
        && p.day === input.day
        && p.hour === input.hour
        && p.minute === input.minute
      ) {
        break;
      }
    }
  }

  return new Date(guess);
}

/** Build UTC instant from YYYY-MM-DD + HH:mm in the given timezone (default Europe/London). */
export function londonInstantFromDateAndHm(dateIso: string, hm: string, timeZone: string = UK_TIMEZONE): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!dateMatch || !timeMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (
    !Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)
    || hour < 0 || hour > 23 || minute < 0 || minute > 59
  ) {
    return null;
  }
  return zonedLocalToUtc({ year, month, day, hour, minute, timeZone });
}

/** Calendar YYYY-MM-DD for an instant in Europe/London. */
export function formatUkDateIso(instant: Date, timeZone: string = UK_TIMEZONE): string {
  const p = getUkParts(instant, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** Today's calendar date in Europe/London as YYYY-MM-DD. */
export function todayUkDateIso(now: Date = new Date(), timeZone: string = UK_TIMEZONE): string {
  return formatUkDateIso(now, timeZone);
}

export function formatUkDate(instant: Date | string, timeZone: string = UK_TIMEZONE): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatUkTime(instant: Date | string, timeZone: string = UK_TIMEZONE): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

/** e.g. Wed 29 Jul 2026, 17:30 */
export function formatUkDateTime(instant: Date | string, timeZone: string = UK_TIMEZONE): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

/** Compact card format: Wed 29 Jul, 17:30 */
export function formatUkDateTimeShort(instant: Date | string, timeZone: string = UK_TIMEZONE): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}
