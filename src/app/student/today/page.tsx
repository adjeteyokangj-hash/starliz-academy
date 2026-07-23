"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Navbar from "@/components/layout/Navbar";
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
  classroomName: string | null;
  teacherName: string | null;
  lessonTitle: string | null;
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
};

export default function StudentTodayPage() {
  const [board, setBoard] = useState<BoardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/student/daytime-timetable", {
          credentials: "include",
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "Unable to load today's timetable.");
        }
        if (!active) return;
        setBoard(data.board as BoardPayload);
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Unable to load today's timetable.");
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <header>
          <p className="text-xs uppercase tracking-[0.14em] text-foreground/45">Today at school</p>
          <h1 className="mt-1 text-2xl font-black">{board?.weekdayLabel ?? "My timetable"}</h1>
          <p className="mt-1 text-sm text-foreground/60">
            {board?.classroomName ? `${board.classroomName}` : "Your class timetable"}
            {board?.schoolName ? ` · ${board.schoolName}` : ""}
          </p>
        </header>

        {loading ? <p className="text-sm text-foreground/60">Loading today...</p> : null}
        {error ? (
          <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p>
        ) : null}

        {!loading && !error && board && !board.enrolment ? (
          <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground/60">
            You are not enrolled in an active school class yet. Ask your school to enrol you, then refresh.
          </p>
        ) : null}

        {!loading && !error && board?.enrolment ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2">
              <article className="rounded-xl border border-border bg-card p-4">
                <p className="text-[11px] uppercase tracking-[0.1em] text-foreground/45">Current</p>
                <p className="mt-1 text-sm font-semibold">
                  {(() => {
                    const current = board.periods.find((row) => row.id === board.currentPeriodId);
                    if (current) return `${current.startsAt}–${current.endsAt} · ${current.title}`;
                    if (board.phase === "before_school") return "Before school";
                    if (board.phase === "after_school") return "After school";
                    if (board.periods.length === 0) return "No timetable today";
                    return "Between periods";
                  })()}
                </p>
              </article>
              <article className="rounded-xl border border-border bg-card p-4">
                <p className="text-[11px] uppercase tracking-[0.1em] text-foreground/45">Next</p>
                <p className="mt-1 text-sm font-semibold">
                  {(() => {
                    const next = board.periods.find((row) => row.id === board.nextPeriodId);
                    return next ? `${next.startsAt} · ${next.title}` : "—";
                  })()}
                </p>
              </article>
            </section>

            {board.periods.length === 0 ? (
              <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground/60">
                No lessons are scheduled for your class today.
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {board.periods.map((period) => {
                  const state = resolvePeriodState(period.startsAt, period.endsAt, minutesNow());
                  return (
                    <li key={period.id} className={`px-4 py-3 ${state === "now" ? "bg-sky-500/10" : ""}`}>
                      <p className="font-mono text-xs text-foreground/55">
                        {period.startsAt}–{period.endsAt}
                        {state === "now" ? <span className="ml-2 text-[10px] font-bold uppercase text-sky-600">Now</span> : null}
                      </p>
                      <p className="mt-1 font-semibold">{period.title}</p>
                      <p className="text-xs text-foreground/55">
                        {period.subject}
                        {period.teacherName ? ` · ${period.teacherName}` : " · Tutor TBC"}
                        {period.room ? ` · ${period.room}` : " · Room TBC"}
                        {period.classroomName ? ` · ${period.classroomName}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : null}

        <Link href="/student/dashboard" className="inline-flex text-sm font-semibold text-sky-600 hover:underline">
          Back to dashboard
        </Link>
      </main>
    </div>
  );
}
