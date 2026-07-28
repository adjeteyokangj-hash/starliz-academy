import { currentAcademicYearLabel } from "@/lib/schools/ensure-year-classes";

/** Next UK academic-year label after `current` (e.g. 2025/26 -> 2026/27). */
export function nextAcademicYearLabel(current: string, now = new Date()): string {
  const match = /^(\d{4})\s*\/\s*(\d{2}|\d{4})$/.exec(current.trim());
  if (match) {
    const start = Number(match[1]);
    const nextStart = start + 1;
    return `${nextStart}/${String(nextStart + 1).slice(-2)}`;
  }
  // Fall back from calendar convention.
  const base = currentAcademicYearLabel(now);
  const baseMatch = /^(\d{4})\//.exec(base);
  if (!baseMatch) return base;
  const start = Number(baseMatch[1]) + 1;
  return `${start}/${String(start + 1).slice(-2)}`;
}

/** Default promotion date: 1 September of the next academic year start. */
export function defaultPromotionDateForNextYear(nextAcademicYear: string): Date {
  const match = /^(\d{4})\//.exec(nextAcademicYear.trim());
  const startYear = match ? Number(match[1]) : new Date().getFullYear();
  return new Date(Date.UTC(startYear, 8, 1)); // 1 September UTC date-only
}

export function formatDateOnlyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseDateOnlyUtc(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) throw new Error("Date must be YYYY-MM-DD.");
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export const ACADEMIC_YEAR_STATUSES = ["waiting", "ready", "applied"] as const;
export type AcademicYearStatus = (typeof ACADEMIC_YEAR_STATUSES)[number];

export function isAcademicYearStatus(value: string): value is AcademicYearStatus {
  return (ACADEMIC_YEAR_STATUSES as readonly string[]).includes(value);
}