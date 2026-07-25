import type { PeriodClockState } from "@/lib/schools/school-day-period";
import { isPlayableDaytimeLessonType } from "@/lib/schools/start-daytime-period";

export type PeriodUiStatus =
  | "ready"
  | "now"
  | "next"
  | "coming_up"
  | "ended"
  | "locked";

export type PeriodStatusMeta = {
  status: PeriodUiStatus;
  /** Student-facing chip text (NOW / NEXT / COMING UP / COMPLETED). */
  label: string;
  /** Short marker for timeline (emoji-safe, decorative). */
  marker: string;
  tone: "sky" | "violet" | "emerald" | "slate" | "amber";
};

/**
 * Derive student-facing period status from clock state + playability.
 * Past periods use COMPLETED as a schedule chip (period finished), not academic content mastery.
 */
export function resolvePeriodUiStatus(input: {
  clockState: PeriodClockState;
  lessonType: string;
  isCurrent: boolean;
  isNext: boolean;
}): PeriodStatusMeta {
  const playable = isPlayableDaytimeLessonType(input.lessonType);

  if (input.clockState === "now" || input.isCurrent) {
    return {
      status: playable ? "ready" : "now",
      label: "Now",
      marker: "🟢",
      tone: "sky",
    };
  }

  if (input.isNext) {
    return { status: "next", label: "Next", marker: "🔵", tone: "violet" };
  }

  if (input.clockState === "past") {
    return {
      status: "ended",
      label: "Completed",
      marker: "✓",
      tone: "emerald",
    };
  }

  if (!playable) {
    return { status: "locked", label: "In class", marker: "⚪", tone: "slate" };
  }

  if (input.clockState === "upcoming" || input.clockState === "before_school") {
    if (playable) {
      return {
        status: "locked",
        label: "Locked",
        marker: "🔒",
        tone: "slate",
      };
    }
    return {
      status: "coming_up",
      label: "Coming up",
      marker: "⚪",
      tone: "amber",
    };
  }

  return { status: "locked", label: "Locked", marker: "🔒", tone: "slate" };
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function minutesUntil(startsAt: string, nowMinutes: number): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(startsAt.trim());
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2]);
  if (!Number.isFinite(start) || start < nowMinutes) return null;
  return start - nowMinutes;
}

export function schoolDayProgress(input: {
  periods: Array<{ id: string; lessonType: string; startsAt: string; endsAt: string }>;
  nowMinutes: number;
  resolveClock: (startsAt: string, endsAt: string, nowMinutes: number) => PeriodClockState;
}): { ended: number; total: number; pct: number } {
  const playable = input.periods.filter((p) => isPlayableDaytimeLessonType(p.lessonType));
  const total = playable.length;
  const ended = playable.filter(
    (p) => input.resolveClock(p.startsAt, p.endsAt, input.nowMinutes) === "past",
  ).length;
  const pct = total > 0 ? Math.round((ended / total) * 100) : 0;
  return { ended, total, pct };
}

export function statusChipClass(tone: PeriodStatusMeta["tone"]): string {
  switch (tone) {
    case "sky":
      return "border-sky-300 bg-sky-100 text-sky-800";
    case "violet":
      return "border-violet-300 bg-violet-100 text-violet-800";
    case "emerald":
      return "border-emerald-300 bg-emerald-100 text-emerald-800";
    case "amber":
      return "border-amber-300 bg-amber-100 text-amber-800";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}
