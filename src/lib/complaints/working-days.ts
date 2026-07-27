/**
 * Working-day helpers for the locked complaints SLA.
 *
 * Working days = Monday–Friday excluding England & Wales bank holidays.
 * Targets (from COMPLAINT_SLA_COMMERCIAL_FACTS): acknowledge ≤ 2 working days,
 * substantive response ≤ 10 working days, urgent acknowledgement ≤ 1 working day.
 * These are published service targets, not guarantees, and do not govern
 * safeguarding response.
 */

/**
 * England & Wales bank holidays (YYYY-MM-DD). Extend as GOV.UK publishes new
 * years. Dates falling on a weekend already resolve to the substitute weekday
 * listed here.
 */
export const ENGLAND_WALES_BANK_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2026
  "2026-01-01",
  "2026-04-03",
  "2026-04-06",
  "2026-05-04",
  "2026-05-25",
  "2026-08-31",
  "2026-12-25",
  "2026-12-28",
  // 2027
  "2027-01-01",
  "2027-03-26",
  "2027-03-29",
  "2027-05-03",
  "2027-05-31",
  "2027-08-30",
  "2027-12-27",
  "2027-12-28",
]);

function toIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isWorkingDay(date: Date): boolean {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false; // Sunday / Saturday
  return !ENGLAND_WALES_BANK_HOLIDAYS.has(toIsoDate(date));
}

/**
 * Adds N working days to a starting instant. Returns a Date at the same
 * wall-clock time on the resulting working day. N must be >= 0.
 */
export function addWorkingDays(from: Date, workingDays: number): Date {
  const result = new Date(from.getTime());
  let remaining = Math.max(0, Math.floor(workingDays));
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    if (isWorkingDay(result)) {
      remaining -= 1;
    }
  }
  return result;
}

/** Whole working days elapsed between two instants (exclusive of the start day). */
export function workingDaysBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let count = 0;
  const cursor = new Date(from.getTime());
  while (cursor < to) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor <= to && isWorkingDay(cursor)) count += 1;
  }
  return count;
}

export const COMPLAINT_SLA_TARGETS = {
  acknowledgementWorkingDays: 2,
  urgentAcknowledgementWorkingDays: 1,
  substantiveResponseWorkingDays: 10,
} as const;

export type ComplaintSlaDueDates = {
  acknowledgementDueAt: Date;
  substantiveResponseDueAt: Date;
};

/**
 * Computes SLA due dates from the received instant. Urgent complaints get the
 * shorter acknowledgement target.
 */
export function computeComplaintSlaDueDates(input: {
  receivedAt: Date;
  priority?: string | null;
}): ComplaintSlaDueDates {
  const urgent = (input.priority ?? "").toLowerCase() === "urgent";
  return {
    acknowledgementDueAt: addWorkingDays(
      input.receivedAt,
      urgent
        ? COMPLAINT_SLA_TARGETS.urgentAcknowledgementWorkingDays
        : COMPLAINT_SLA_TARGETS.acknowledgementWorkingDays,
    ),
    substantiveResponseDueAt: addWorkingDays(
      input.receivedAt,
      COMPLAINT_SLA_TARGETS.substantiveResponseWorkingDays,
    ),
  };
}

export type ComplaintSlaState = {
  acknowledgementOverdue: boolean;
  substantiveOverdue: boolean;
  atRisk: boolean;
};

/**
 * Server-side overdue/at-risk evaluation. Overdue is computed from the stored
 * due dates and whether the milestone has actually been met — opening a case
 * never clears overdue status.
 */
export function evaluateComplaintSla(input: {
  now: Date;
  status: string;
  acknowledgementDueAt: Date | null;
  substantiveResponseDueAt: Date | null;
  acknowledgedAt: Date | null;
  substantiveRespondedAt: Date | null;
}): ComplaintSlaState {
  const isClosed = input.status === "resolved" || input.status === "closed";

  const acknowledgementOverdue =
    !input.acknowledgedAt &&
    !isClosed &&
    input.acknowledgementDueAt !== null &&
    input.now > input.acknowledgementDueAt;

  const substantiveOverdue =
    !input.substantiveRespondedAt &&
    !isClosed &&
    input.substantiveResponseDueAt !== null &&
    input.now > input.substantiveResponseDueAt;

  // "At risk" = a milestone is still open and due within one working day.
  const oneWorkingDayOut = addWorkingDays(input.now, 1);
  const acknowledgementAtRisk =
    !input.acknowledgedAt &&
    !isClosed &&
    input.acknowledgementDueAt !== null &&
    !acknowledgementOverdue &&
    input.acknowledgementDueAt <= oneWorkingDayOut;
  const substantiveAtRisk =
    !input.substantiveRespondedAt &&
    !isClosed &&
    input.substantiveResponseDueAt !== null &&
    !substantiveOverdue &&
    input.substantiveResponseDueAt <= oneWorkingDayOut;

  return {
    acknowledgementOverdue,
    substantiveOverdue,
    atRisk: acknowledgementAtRisk || substantiveAtRisk,
  };
}
