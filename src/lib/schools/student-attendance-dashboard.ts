import type { AttendanceStatus } from "@/lib/schools/attendance-status";
import {
  emptyAttendanceSummary,
  summarizeAttendanceMarks,
} from "@/lib/progress-reporting/attendance";
import type { AttendanceSummary } from "@/lib/progress-reporting/types";

export type StudentAttendanceHistoryLike = {
  sessionDate: string;
  status: AttendanceStatus;
  periodTitle: string;
  subject: string;
  startsAt: string;
  endsAt: string;
};

export type TodayAttendanceSlot = {
  status: AttendanceStatus | null;
  periodTitle: string | null;
  waiting: boolean;
};

export type StudentAttendanceDashboard = {
  summary: Pick<
    AttendanceSummary,
    "presentRatePct" | "counts" | "recordedMarks" | "windowDays" | "linkedToSchool"
  >;
  today: {
    morning: TodayAttendanceSlot;
    afternoon: TodayAttendanceSlot;
  };
  streakDays: number;
};

function dateIsoLocal(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseHm(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return -1;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isPresentLike(status: AttendanceStatus): boolean {
  return status === "present" || status === "late";
}

function emptySlot(): TodayAttendanceSlot {
  return { status: null, periodTitle: null, waiting: true };
}

/**
 * Best-effort morning/afternoon slots from today's marks.
 * Prefers registration-like titles; otherwise earliest AM / earliest PM mark.
 */
export function pickTodayAttendanceSlots(
  items: StudentAttendanceHistoryLike[],
  todayIso = dateIsoLocal(),
): { morning: TodayAttendanceSlot; afternoon: TodayAttendanceSlot } {
  const todayItems = items.filter((row) => row.sessionDate === todayIso);
  if (todayItems.length === 0) {
    return { morning: emptySlot(), afternoon: emptySlot() };
  }

  const morningCandidates = todayItems.filter((row) => {
    const m = parseHm(row.startsAt);
    return m >= 0 && m < 12 * 60;
  });
  const afternoonCandidates = todayItems.filter((row) => {
    const m = parseHm(row.startsAt);
    return m >= 12 * 60;
  });

  function pick(list: StudentAttendanceHistoryLike[]): TodayAttendanceSlot {
    if (list.length === 0) return emptySlot();
    const registration = list.find((row) =>
      /registration|register|morning|afternoon/i.test(`${row.periodTitle} ${row.subject}`),
    );
    const chosen = registration ?? [...list].sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    return {
      status: chosen.status,
      periodTitle: chosen.periodTitle,
      waiting: false,
    };
  }

  return {
    morning: pick(morningCandidates),
    afternoon: pick(afternoonCandidates),
  };
}

/**
 * Consecutive calendar days (back from today) with at least one present/late mark.
 * Gaps or absent-only days break the streak.
 */
export function computeAttendanceStreakDays(
  items: StudentAttendanceHistoryLike[],
  todayIso = dateIsoLocal(),
): number {
  const byDay = new Map<string, AttendanceStatus[]>();
  for (const item of items) {
    const list = byDay.get(item.sessionDate) ?? [];
    list.push(item.status);
    byDay.set(item.sessionDate, list);
  }

  let streak = 0;
  const cursor = new Date(`${todayIso}T12:00:00`);
  for (let i = 0; i < 366; i += 1) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    const iso = `${y}-${m}-${d}`;
    const statuses = byDay.get(iso);
    if (!statuses || statuses.length === 0) {
      // Today with no marks yet does not break an ongoing streak — skip and keep looking.
      if (iso === todayIso) {
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      break;
    }
    if (!statuses.some(isPresentLike)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function buildStudentAttendanceDashboard(input: {
  items: StudentAttendanceHistoryLike[];
  windowDays?: number;
  linkedToSchool?: boolean;
  todayIso?: string;
}): StudentAttendanceDashboard {
  const windowDays = input.windowDays ?? 30;
  const todayIso = input.todayIso ?? dateIsoLocal();
  const since = new Date(`${todayIso}T12:00:00`);
  since.setDate(since.getDate() - (windowDays - 1));
  const sinceIso = dateIsoLocal(since);

  const windowItems = input.items.filter((row) => row.sessionDate >= sinceIso);
  const summaryFull = summarizeAttendanceMarks(
    windowItems.map((row) => row.status),
    windowDays,
    input.linkedToSchool ?? true,
  );

  return {
    summary: {
      presentRatePct: summaryFull.presentRatePct,
      counts: summaryFull.counts,
      recordedMarks: summaryFull.recordedMarks,
      windowDays: summaryFull.windowDays,
      linkedToSchool: summaryFull.linkedToSchool,
    },
    today: pickTodayAttendanceSlots(input.items, todayIso),
    streakDays: computeAttendanceStreakDays(input.items, todayIso),
  };
}

export function emptyStudentAttendanceDashboard(windowDays = 30): StudentAttendanceDashboard {
  const empty = emptyAttendanceSummary(windowDays, true);
  return {
    summary: {
      presentRatePct: empty.presentRatePct,
      counts: empty.counts,
      recordedMarks: empty.recordedMarks,
      windowDays: empty.windowDays,
      linkedToSchool: empty.linkedToSchool,
    },
    today: { morning: emptySlot(), afternoon: emptySlot() },
    streakDays: 0,
  };
}

export function supportPreviewLabel(input: {
  onlineTutorCount: number;
  availableTutorCount: number;
}): {
  onlineTutorCount: number;
  availableTutorCount: number;
  label: string;
  aiLabel: string;
  humanLabel: string;
  humanDetail: string | null;
} {
  const online = Math.max(0, input.onlineTutorCount);
  const available = Math.max(0, input.availableTutorCount);
  const aiLabel = "Ready to help whenever you need it";

  if (available > 0) {
    return {
      onlineTutorCount: online,
      availableTutorCount: available,
      label: `AI Tutor ready · ${available} tutor${available === 1 ? "" : "s"} available`,
      aiLabel,
      humanLabel: "Available if AI cannot solve your problem",
      humanDetail: null,
    };
  }
  if (online > 0) {
    return {
      onlineTutorCount: online,
      availableTutorCount: available,
      label: "AI Tutor ready · Tutors busy",
      aiLabel,
      humanLabel: "Currently helping another student",
      humanDetail: "AI Tutor will continue helping you.",
    };
  }
  return {
    onlineTutorCount: 0,
    availableTutorCount: 0,
    label: "AI Tutor ready · 0 human tutors online",
    aiLabel,
    humanLabel: "No human tutors are online right now",
    humanDetail: "Your AI Tutor will continue supporting you throughout your lesson.",
  };
}
