/** Canonical attendance statuses for daytime school registers. */

export const ATTENDANCE_STATUSES = [
  "present",
  "absent",
  "late",
  "authorised_absence",
  "medical",
  "not_recorded",
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const RECORDED_ATTENDANCE_STATUSES = ATTENDANCE_STATUSES.filter(
  (status) => status !== "not_recorded",
) as Exclude<AttendanceStatus, "not_recorded">[];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  authorised_absence: "Authorised absence",
  medical: "Medical",
  not_recorded: "Not recorded",
};

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" && (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

export function isRecordedAttendanceStatus(status: AttendanceStatus): boolean {
  return status !== "not_recorded";
}

/** Break / lunch periods do not open a student attendance register. */
export function isRegisterEligibleLessonType(lessonType: string): boolean {
  const normalized = lessonType.trim().toLowerCase();
  return normalized !== "break" && normalized !== "lunch";
}

export function parseSessionDateInput(value: string | Date | undefined | null, fallback = new Date()): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return startOfUtcDate(value);
  }
  if (typeof value === "string" && value.trim()) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (match) {
      return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return startOfUtcDate(parsed);
  }
  return startOfUtcDate(fallback);
}

export function startOfUtcDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function formatSessionDateIso(date: Date): string {
  const d = startOfUtcDate(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
