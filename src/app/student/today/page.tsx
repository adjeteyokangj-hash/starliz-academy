"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/layout/Navbar";
import {
  greetingForHour,
  minutesUntil,
  resolvePeriodUiStatus,
  schoolDayProgress,
  statusChipClass,
} from "@/components/student/school-day/periodStatus";
import { subjectGlyph } from "@/components/student/school-day/subjectGlyph";
import {
  minutesNow,
  parseHmToMinutes,
  resolvePeriodState,
} from "@/lib/schools/school-day-period";
import { isPlayableDaytimeLessonType } from "@/lib/schools/start-daytime-period";

type BoardPeriod = {
  id: string;
  title: string;
  subject: string;
  lessonType: string;
  startsAt: string;
  endsAt: string;
  room: string | null;
  classroomName: string | null;
  teacherName: string | null;
  lessonId: string | null;
  lessonTitle: string | null;
  skillFocus: string | null;
  sessionSummary: {
    periodMinutes: number;
    studentWorkMinutes: number;
    stageCount: number;
    totalEstimatedMinutes: number;
  } | null;
};

type SupportPreview = {
  onlineTutorCount: number;
  availableTutorCount: number;
  label: string;
  aiLabel?: string;
  humanLabel?: string;
  humanDetail?: string | null;
};

type BoardPayload = {
  weekdayLabel: string;
  dateIso: string;
  phase: string;
  currentPeriodId: string | null;
  nextPeriodId: string | null;
  periods: BoardPeriod[];
  schoolName: string | null;
  classroomName: string | null;
  enrolment: { schoolId: string; classroomId: string } | null;
  supportPreview?: SupportPreview | null;
};

function firstNameFrom(name: string | null | undefined): string | null {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

function periodDurationMinutes(period: BoardPeriod): number {
  if (period.sessionSummary?.periodMinutes) return period.sessionSummary.periodMinutes;
  const start = parseHmToMinutes(period.startsAt);
  const end = parseHmToMinutes(period.endsAt);
  if (start < 0 || end < 0 || end <= start) return 0;
  return end - start;
}

function lessonDisplayTitle(period: BoardPeriod): string {
  const glyph = subjectGlyph(period);
  if (period.subject && period.title && period.subject.trim().toLowerCase() !== period.title.trim().toLowerCase()) {
    const subjectBit = period.subject.trim();
    const titleBit = period.title.trim();
    if (titleBit.toLowerCase().includes(subjectBit.toLowerCase())) return titleBit;
    return `${subjectBit} – ${titleBit}`;
  }
  return glyph.shortLabel || period.title;
}

function showsNewLessonHint(period: BoardPeriod): boolean {
  return Boolean(period.lessonId && isPlayableDaytimeLessonType(period.lessonType));
}

export default function StudentTodayPage() {
  const router = useRouter();
  const [board, setBoard] = useState<BoardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [studentFirstName, setStudentFirstName] = useState<string | null>(null);
  const [nowMinutes, setNowMinutes] = useState(() => minutesNow());

  useEffect(() => {
    const tick = window.setInterval(() => setNowMinutes(minutesNow()), 30_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [timetableRes, summaryRes] = await Promise.all([
          fetch("/api/student/daytime-timetable", {
            credentials: "include",
            cache: "no-store",
          }),
          fetch("/api/student/dashboard-summary", {
            credentials: "include",
            cache: "no-store",
          }),
        ]);
        const data = await timetableRes.json().catch(() => ({}));
        if (!timetableRes.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "Unable to load your school day.");
        }
        if (!active) return;
        setBoard(data.board as BoardPayload);

        if (summaryRes.ok) {
          const summary = await summaryRes.json().catch(() => ({}));
          if (!active) return;
          setStudentFirstName(firstNameFrom(summary?.child?.name));
        }
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Unable to load your school day.");
        setBoard(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  async function enterClassroom(periodId: string) {
    setStartingId(periodId);
    setStartError(null);
    try {
      const response = await fetch(`/api/student/daytime-period/${encodeURIComponent(periodId)}/start`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Unable to enter this classroom.");
      }
      if (typeof data.href !== "string" || !data.href) {
        throw new Error("Classroom link was missing.");
      }
      router.push(data.href);
    } catch (cause) {
      setStartError(cause instanceof Error ? cause.message : "Unable to enter this classroom.");
      setStartingId(null);
    }
  }

  const current = board?.periods.find((row) => row.id === board.currentPeriodId) ?? null;
  const next = board?.periods.find((row) => row.id === board.nextPeriodId) ?? null;
  const focus = current ?? next;
  const currentPlayable = Boolean(current && isPlayableDaytimeLessonType(current.lessonType));
  const progress = useMemo(() => {
    if (!board) return { ended: 0, total: 0, pct: 0 };
    return schoolDayProgress({
      periods: board.periods,
      nowMinutes,
      resolveClock: resolvePeriodState,
    });
  }, [board, nowMinutes]);

  const greeting = greetingForHour(Math.floor(nowMinutes / 60));
  const heroGlyph = focus ? subjectGlyph(focus) : { glyph: "🏫", shortLabel: "School day" };
  const heroStartsIn = !current && next ? minutesUntil(next.startsAt, nowMinutes) : null;
  const support = board?.supportPreview;
  const aiLabel = support?.aiLabel ?? "Ready to help whenever you need it";
  const humanLabel = support?.humanLabel ?? "No human tutors are online right now";
  const humanDetail = support?.humanDetail
    ?? "Your AI Tutor will continue supporting you throughout your lesson.";
  const focusMins = focus ? periodDurationMinutes(focus) : 0;
  const classroomReady = Boolean(currentPlayable && current);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-[0.14em] text-foreground/45">My school day</p>
          <div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              {greeting}
              {studentFirstName ? `, ${studentFirstName}` : ""}
            </h1>
            <p className="mt-1 text-sm text-foreground/60">{board?.weekdayLabel ?? "Today"}</p>
          </div>
          {board?.enrolment && progress.total > 0 ? (
            <div>
              <div className="flex items-center justify-between gap-3 text-xs font-semibold text-sky-900">
                <span>School day progress</span>
                <span>
                  {progress.ended} of {progress.total}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-sky-200/70">
                <div
                  className="h-full rounded-full bg-sky-600 transition-[width]"
                  style={{ width: `${Math.min(100, progress.pct)}%` }}
                />
              </div>
            </div>
          ) : null}
        </header>

        {loading ? <p className="text-sm text-foreground/60">Loading your school day…</p> : null}
        {error ? (
          <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p>
        ) : null}
        {startError ? (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{startError}</p>
        ) : null}

        {!loading && !error && board && !board.enrolment ? (
          <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground/60">
            You are not enrolled in an active school class yet. Ask your school to enrol you, then refresh.
          </p>
        ) : null}

        {!loading && !error && board?.enrolment ? (
          <>
            {/* Dominant classroom hero */}
            <section className="rounded-[1.75rem] border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-indigo-50 p-6 shadow-md sm:p-8">
              <p className="text-sm font-semibold text-sky-800">
                {classroomReady
                  ? "Your classroom is ready."
                  : board.phase === "after_school"
                    ? "School day finished."
                    : heroStartsIn != null && heroStartsIn > 0
                      ? "Your classroom opens soon."
                      : "Here's what comes next."}
              </p>

              <div className="mt-4 flex items-start gap-3">
                <span className="text-4xl leading-none" aria-hidden>
                  {heroGlyph.glyph}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-3xl font-black tracking-tight text-slate-900 sm:text-[2rem]">
                    {focus
                      ? lessonDisplayTitle(focus)
                      : board.periods.length === 0
                        ? "No lessons today"
                        : "Between lessons"}
                  </h2>
                  {focus?.sessionSummary?.stageCount ? (
                    <p className="mt-2 text-sm font-semibold text-slate-700">
                      Stage 1 of {focus.sessionSummary.stageCount}
                    </p>
                  ) : null}
                  {heroStartsIn != null && heroStartsIn > 0 ? (
                    <p className="mt-2 text-base font-semibold text-sky-800">
                      Starts in {heroStartsIn} minute{heroStartsIn === 1 ? "" : "s"}
                    </p>
                  ) : null}
                </div>
              </div>

              {focus ? (
                <div className="mt-5 space-y-2 text-sm text-slate-700">
                  {focus.teacherName ? (
                    <p>
                      <span className="font-semibold text-slate-900">{focus.teacherName}</span> is teaching today.
                    </p>
                  ) : (
                    <p>Your teacher will be confirmed soon.</p>
                  )}
                  <p>AI Tutor is ready to help.</p>
                  {focusMins > 0 ? <p>{focusMins} minute lesson.</p> : null}
                  {focus.room || focus.classroomName ? (
                    <p className="text-slate-600">Room {focus.room ?? focus.classroomName}</p>
                  ) : null}
                </div>
              ) : null}

              {focus && showsNewLessonHint(focus) ? (
                <p className="mt-4 text-sm font-semibold text-emerald-800">
                  New learning today
                  <span className="mt-0.5 block text-xs font-medium text-emerald-700/90">
                    ✓ Different from earlier this week
                  </span>
                </p>
              ) : null}

              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-violet-300 bg-violet-50 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-700">
                    AI Tutor · Primary
                  </p>
                  <p className="mt-1 text-sm font-semibold text-violet-950">{aiLabel}.</p>
                  <ul className="mt-2 space-y-1 text-xs text-violet-900/80">
                    <li>✓ Explain questions</li>
                    <li>✓ Give hints</li>
                    <li>✓ Break problems into steps</li>
                  </ul>
                  <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-violet-700">Always available</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                    Human Tutor · Secondary
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-800">{humanLabel}.</p>
                  {humanDetail ? (
                    <p className="mt-1 text-xs text-slate-500">{humanDetail}</p>
                  ) : support && (support.availableTutorCount ?? 0) > 0 ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Available if AI cannot solve your problem.
                    </p>
                  ) : null}
                </div>
              </div>

              {classroomReady && current ? (
                <button
                  type="button"
                  disabled={startingId === current.id}
                  onClick={() => void enterClassroom(current.id)}
                  className="mt-7 flex w-full items-center justify-center rounded-2xl bg-sky-600 px-6 py-4 text-lg font-black uppercase tracking-[0.06em] text-white shadow-lg shadow-sky-600/25 hover:bg-sky-500 disabled:opacity-60"
                >
                  {startingId === current.id ? "Entering…" : "Enter Classroom"}
                </button>
              ) : null}
            </section>

            {/* Next lesson — secondary */}
            {next && next.id !== current?.id ? (
              <section className="rounded-2xl border border-border/80 bg-card/80 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/45">Next lesson</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-base font-black text-slate-900">
                    <span aria-hidden className="mr-1.5">{subjectGlyph(next).glyph}</span>
                    {lessonDisplayTitle(next)}
                  </p>
                  <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusChipClass("violet")}`}>
                    Next
                  </span>
                </div>
                <p className="mt-1 font-mono text-sm text-foreground/55">
                  {next.startsAt}
                  {next.room || next.classroomName ? ` · Room ${next.room ?? next.classroomName}` : ""}
                </p>
              </section>
            ) : null}

            {/* Today's journey — compact rhythm strip */}
            {board.periods.length > 0 ? (
              <section className="rounded-2xl border border-border bg-card px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/45">Today&apos;s journey</p>
                <ol className="mt-3">
                  {board.periods.map((period, index) => {
                    const clock = resolvePeriodState(period.startsAt, period.endsAt, nowMinutes);
                    const ui = resolvePeriodUiStatus({
                      clockState: clock,
                      lessonType: period.lessonType,
                      isCurrent: period.id === board.currentPeriodId,
                      isNext: period.id === board.nextPeriodId,
                    });
                    const glyph = subjectGlyph(period);
                    const done = clock === "past";
                    const active = period.id === board.currentPeriodId;
                    return (
                      <li key={period.id} className="flex flex-col items-stretch">
                        <div
                          className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${
                            active ? "bg-sky-50 ring-1 ring-sky-200" : ""
                          }`}
                        >
                          <span className="text-lg" aria-hidden>
                            {glyph.glyph}
                          </span>
                          <span
                            className={`min-w-0 flex-1 text-sm ${
                              done
                                ? "text-foreground/45 line-through"
                                : active
                                  ? "font-black text-slate-900"
                                  : "font-semibold text-slate-800"
                            }`}
                          >
                            {glyph.shortLabel}
                            {done ? " ✓" : ""}
                          </span>
                          {!done ? (
                            <span
                              className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${statusChipClass(ui.tone)}`}
                            >
                              {ui.label}
                            </span>
                          ) : null}
                        </div>
                        {index < board.periods.length - 1 ? (
                          <div className="flex justify-center py-0.5 text-foreground/25" aria-hidden>
                            ↓
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </section>
            ) : (
              <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground/60">
                No lessons are scheduled for your class today.
              </p>
            )}
          </>
        ) : null}

        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/student/dashboard" className="font-semibold text-sky-600 hover:underline">
            Back to Home
          </Link>
          <Link href="/student/attendance" className="font-semibold text-foreground/55 hover:text-foreground">
            Attendance
          </Link>
        </div>
      </main>
    </div>
  );
}
