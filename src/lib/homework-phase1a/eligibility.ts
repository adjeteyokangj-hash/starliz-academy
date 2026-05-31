function localWeekday(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: timezone }).format(now);
}

function localDateParts(now: Date, timezone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");
  return { year, month, day };
}

function isoDate(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function weekWindowInTimezone(now: Date, timezone: string): { weekStartIso: string; weekEndIso: string } {
  const weekday = localWeekday(now, timezone);
  const order: Record<string, number> = {
    Monday: 0,
    Tuesday: 1,
    Wednesday: 2,
    Thursday: 3,
    Friday: 4,
    Saturday: 5,
    Sunday: 6,
  };
  const dayIndex = order[weekday] ?? 0;
  const base = localDateParts(now, timezone);

  const utcBase = new Date(Date.UTC(base.year, base.month - 1, base.day));
  const monday = new Date(utcBase);
  monday.setUTCDate(utcBase.getUTCDate() - dayIndex);
  const friday = new Date(monday);
  friday.setUTCDate(monday.getUTCDate() + 4);

  return {
    weekStartIso: isoDate(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate()),
    weekEndIso: isoDate(friday.getUTCFullYear(), friday.getUTCMonth() + 1, friday.getUTCDate()),
  };
}

export type WeeklyHomeworkEligibilityInput = {
  now: Date;
  timezone: string;
  completedSessionCount: number;
  startedSessionCount: number;
  existingBatchForWeek: boolean;
};

export type WeeklyHomeworkEligibility = {
  status: "ELIGIBLE" | "NOT_ELIGIBLE";
  reason:
    | "NOT_FRIDAY"
    | "NO_COMPLETED_SESSIONS"
    | "ALREADY_GENERATED"
    | "ELIGIBLE_FOR_GENERATION"
    | "CATCH_UP_ONLY";
  weekStartIso: string;
  weekEndIso: string;
  catchUpOnly: boolean;
};

export function evaluateWeeklyHomeworkEligibility(input: WeeklyHomeworkEligibilityInput): WeeklyHomeworkEligibility {
  const weekWindow = weekWindowInTimezone(input.now, input.timezone);
  const weekday = localWeekday(input.now, input.timezone);

  if (weekday !== "Friday") {
    return {
      status: "NOT_ELIGIBLE",
      reason: "NOT_FRIDAY",
      catchUpOnly: false,
      ...weekWindow,
    };
  }

  if (input.existingBatchForWeek) {
    return {
      status: "NOT_ELIGIBLE",
      reason: "ALREADY_GENERATED",
      catchUpOnly: false,
      ...weekWindow,
    };
  }

  if (input.completedSessionCount <= 0) {
    return {
      status: "NOT_ELIGIBLE",
      reason: input.startedSessionCount > 0 ? "CATCH_UP_ONLY" : "NO_COMPLETED_SESSIONS",
      catchUpOnly: input.startedSessionCount > 0,
      ...weekWindow,
    };
  }

  return {
    status: "ELIGIBLE",
    reason: "ELIGIBLE_FOR_GENERATION",
    catchUpOnly: false,
    ...weekWindow,
  };
}
