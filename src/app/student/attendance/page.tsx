"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Navbar from "@/components/layout/Navbar";
import { ATTENDANCE_STATUS_LABELS, type AttendanceStatus } from "@/lib/schools/attendance-status";

type HistoryItem = {
  id: string;
  sessionDate: string;
  status: AttendanceStatus;
  note: string | null;
  periodTitle: string;
  subject: string;
  startsAt: string;
  endsAt: string;
  classroomName: string | null;
};

type TodaySlot = {
  status: AttendanceStatus | null;
  periodTitle: string | null;
  waiting: boolean;
};

type AttendanceSummaryPayload = {
  presentRatePct: number | null;
  recordedMarks: number;
  windowDays: number;
  counts: {
    present: number;
    late: number;
    absent: number;
    authorised_absence: number;
    medical: number;
    not_recorded: number;
  };
};

function slotLabel(slot: TodaySlot): string {
  if (slot.waiting || !slot.status) return "Waiting";
  return ATTENDANCE_STATUS_LABELS[slot.status] ?? slot.status;
}

export default function StudentAttendanceHistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [summary, setSummary] = useState<AttendanceSummaryPayload | null>(null);
  const [today, setToday] = useState<{ morning: TodaySlot; afternoon: TodaySlot } | null>(null);
  const [streakDays, setStreakDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/student/attendance", {
          credentials: "include",
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "Unable to load attendance.");
        }
        if (!active) return;
        setItems((data.items ?? []) as HistoryItem[]);
        setSummary((data.summary ?? null) as AttendanceSummaryPayload | null);
        setToday((data.today ?? null) as { morning: TodaySlot; afternoon: TodaySlot } | null);
        setStreakDays(typeof data.streakDays === "number" ? data.streakDays : 0);
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Unable to load attendance.");
        setItems([]);
        setSummary(null);
        setToday(null);
        setStreakDays(0);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const rate = summary?.presentRatePct;
  const recorded = summary?.recordedMarks ?? 0;
  const present = summary?.counts.present ?? 0;
  const late = summary?.counts.late ?? 0;
  const absent =
    (summary?.counts.absent ?? 0)
    + (summary?.counts.authorised_absence ?? 0)
    + (summary?.counts.medical ?? 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <header>
          <p className="text-xs uppercase tracking-[0.14em] text-foreground/45">My attendance</p>
          <h1 className="mt-1 text-2xl font-black">Attendance</h1>
          <p className="mt-1 text-sm text-foreground/60">Your school-day register at a glance.</p>
          <Link href="/student/today" className="mt-2 inline-block text-sm font-semibold text-sky-600 hover:underline">
            Enter School Day
          </Link>
        </header>

        {loading ? <p className="text-sm text-foreground/60">Loading…</p> : null}
        {error ? (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
        ) : null}

        {!loading && !error ? (
          <>
            <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700">
                This month
                {summary?.windowDays ? ` · ${summary.windowDays} days` : ""}
              </p>
              {rate != null && rate >= 90 ? (
                <p className="mt-2 text-sm font-bold text-emerald-800">Excellent attendance</p>
              ) : streakDays >= 5 ? (
                <p className="mt-2 text-sm font-bold text-emerald-800">Present every day this week</p>
              ) : recorded > 0 ? (
                <p className="mt-2 text-sm font-bold text-sky-800">Keep showing up</p>
              ) : (
                <p className="mt-2 text-sm font-bold text-sky-800">Your attendance story starts here</p>
              )}
              <p className="mt-1 text-4xl font-black text-slate-900">
                {rate != null ? `${rate}%` : "—"}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {streakDays > 0
                  ? `${streakDays} day streak`
                  : recorded > 0
                    ? "Present or late marks counted toward attendance."
                    : "Waiting for your first attendance mark."}
              </p>
              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-sky-200/80">
                <div
                  className="h-full rounded-full bg-sky-600 transition-[width]"
                  style={{ width: `${rate != null ? Math.min(100, rate) : 0}%` }}
                />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2 text-center">
                  <p className="text-lg font-black text-emerald-700">{present}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Present</p>
                </div>
                <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2 text-center">
                  <p className="text-lg font-black text-amber-700">{late}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Late</p>
                </div>
                <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2 text-center">
                  <p className="text-lg font-black text-rose-700">{absent}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Absent</p>
                </div>
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
              <article className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/45">Today</p>
                <h2 className="mt-2 font-black">Morning register</h2>
                <p className="mt-1 text-sm text-foreground/55">
                  {today?.morning.periodTitle ?? "Morning session"}
                </p>
                <p className="mt-3 inline-flex rounded-lg border border-border px-2.5 py-1 text-xs font-bold">
                  {slotLabel(today?.morning ?? { status: null, periodTitle: null, waiting: true })}
                </p>
              </article>
              <article className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/45">Today</p>
                <h2 className="mt-2 font-black">Afternoon register</h2>
                <p className="mt-1 text-sm text-foreground/55">
                  {today?.afternoon.periodTitle ?? "Afternoon session"}
                </p>
                <p className="mt-3 inline-flex rounded-lg border border-border px-2.5 py-1 text-xs font-bold">
                  {slotLabel(today?.afternoon ?? { status: null, periodTitle: null, waiting: true })}
                </p>
              </article>
            </section>

            <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800">Attendance streak</p>
              {streakDays > 0 ? (
                <p className="mt-1 text-sm text-amber-950">
                  You&apos;ve attended school for <span className="font-black">{streakDays}</span> consecutive day
                  {streakDays === 1 ? "" : "s"}.
                </p>
              ) : recorded === 0 ? (
                <p className="mt-1 text-sm text-amber-950">
                  <span className="font-black">0 days</span> so far — once your teacher takes the register, your streak will grow here.
                </p>
              ) : (
                <p className="mt-1 text-sm text-amber-950">
                  Build a streak by being present each school day. Every mark counts.
                </p>
              )}
            </section>

            <section>
              <h2 className="mb-2 text-sm font-black uppercase tracking-[0.12em] text-foreground/45">Recent history</h2>
              {items.length === 0 ? (
                <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground/60">
                  No attendance marks recorded yet — your summary above stays ready for the first register.
                </p>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                  {items.map((item) => {
                    const dateLabel = new Date(`${item.sessionDate}T12:00:00Z`).toLocaleDateString(undefined, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    });
                    return (
                      <li key={item.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-xs text-foreground/50">
                              {dateLabel} · {item.startsAt}–{item.endsAt}
                            </p>
                            <p className="mt-1 font-semibold">{item.periodTitle}</p>
                            <p className="text-xs text-foreground/55">
                              {item.subject}
                              {item.classroomName ? ` · ${item.classroomName}` : ""}
                            </p>
                          </div>
                          <span className="rounded-lg border border-border px-2 py-1 text-xs font-semibold">
                            {ATTENDANCE_STATUS_LABELS[item.status]}
                          </span>
                        </div>
                        {item.note ? <p className="mt-2 text-xs text-foreground/50">{item.note}</p> : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
