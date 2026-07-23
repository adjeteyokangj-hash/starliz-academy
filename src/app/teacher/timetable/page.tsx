"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  isRegisterEligibleLessonType,
} from "@/lib/schools/attendance-status";
import {
  minutesNow,
  resolvePeriodState,
} from "@/lib/schools/school-day-period";

type BoardPeriod = {
  id: string;
  title: string;
  subject: string;
  lessonType: string;
  startsAt: string;
  endsAt: string;
  room: string | null;
  classroomId: string | null;
  classroomName: string | null;
  lessonTitle: string | null;
  skillFocus: string | null;
};

type BoardPayload = {
  weekdayLabel: string;
  dateIso: string;
  phase: string;
  currentPeriodId: string | null;
  nextPeriodId: string | null;
  periods: BoardPeriod[];
  studentsByClassroom: Record<string, Array<{ id: string; name: string }>>;
};

export default function TeacherDaytimeTimetablePage() {
  const [board, setBoard] = useState<BoardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/teacher/daytime-timetable", {
          credentials: "include",
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "Unable to load timetable.");
        }
        if (!active) return;
        setBoard(data.board as BoardPayload);
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Unable to load timetable.");
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

  if (loading) {
    return <div className="p-6 text-sm text-foreground/60">Loading your school day...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
      </div>
    );
  }

  if (!board) {
    return <div className="p-6 text-sm text-foreground/60">No timetable available.</div>;
  }

  const now = minutesNow();
  const current = board.periods.find((row) => row.id === board.currentPeriodId) ?? null;
  const next = board.periods.find((row) => row.id === board.nextPeriodId) ?? null;
  const dateLabel = new Date(board.dateIso).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-5 p-6">
      <header>
        <p className="text-xs uppercase tracking-[0.14em] text-foreground/45">My school day</p>
        <h1 className="mt-1 text-2xl font-black text-foreground">{board.weekdayLabel}</h1>
        <p className="mt-1 text-sm text-foreground/60">{dateLabel}</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-[0.1em] text-foreground/45">Current</p>
          <p className="mt-1 text-sm font-semibold">
            {current
              ? `${current.startsAt}–${current.endsAt} · ${current.title}`
              : board.phase === "before_school"
                ? "Before school"
                : board.phase === "after_school"
                  ? "After school"
                  : board.periods.length === 0
                    ? "No periods today"
                    : "Between periods"}
          </p>
        </article>
        <article className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-[0.1em] text-foreground/45">Next</p>
          <p className="mt-1 text-sm font-semibold">
            {next ? `${next.startsAt} · ${next.title}` : "—"}
          </p>
        </article>
        <article className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-[0.1em] text-foreground/45">Periods today</p>
          <p className="mt-1 text-sm font-semibold">{board.periods.length}</p>
        </article>
      </section>

      {board.periods.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground/60">
          You have no assigned periods today.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {board.periods.map((period) => {
            const state = resolvePeriodState(period.startsAt, period.endsAt, now);
            const studentNames = period.classroomId
              ? (board.studentsByClassroom[period.classroomId] ?? [])
              : [];

            return (
              <li key={period.id} className={`px-4 py-3 ${state === "now" ? "bg-sky-500/10" : ""}`}>
                <p className="font-mono text-xs text-foreground/55">
                  {period.startsAt}–{period.endsAt}
                  {state === "now" ? <span className="ml-2 text-[10px] font-bold uppercase text-sky-600">Now</span> : null}
                </p>
                <p className="mt-1 font-semibold">{period.title}</p>
                <p className="text-xs text-foreground/55">
                  {period.subject}
                  {period.classroomName ? ` · ${period.classroomName}` : ""}
                  {period.room ? ` · ${period.room}` : " · Room not set"}
                  {period.lessonTitle
                    ? ` · Lesson: ${period.lessonTitle}`
                    : period.lessonType === "break" || period.lessonType === "registration" || period.lessonType === "lunch"
                      ? ""
                      : " · No linked lesson"}
                </p>
                {studentNames.length > 0 && period.lessonType !== "break" ? (
                  <p className="mt-2 text-xs text-foreground/50">
                    Students: {studentNames.map((student) => student.name).join(", ")}
                  </p>
                ) : null}
                {isRegisterEligibleLessonType(period.lessonType) && period.classroomId ? (
                  <div className="mt-3">
                    <Link
                      href={`/teacher/attendance/${period.id}`}
                      className="inline-flex rounded-lg border border-sky-500/50 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-500/20 dark:text-sky-100"
                    >
                      {state === "upcoming" || state === "before_school"
                        ? "Open register (before lesson)"
                        : state === "now"
                          ? "Take register"
                          : "Open / amend register"}
                    </Link>
                  </div>
                ) : isRegisterEligibleLessonType(period.lessonType) ? (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">No class attached — register unavailable.</p>
                ) : (
                  <p className="mt-2 text-xs text-foreground/45">No student register for break / lunch.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
