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

export default function StudentAttendanceHistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
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
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Unable to load attendance.");
        setItems([]);
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
          <p className="text-xs uppercase tracking-[0.14em] text-foreground/45">My attendance</p>
          <h1 className="mt-1 text-2xl font-black">Attendance history</h1>
          <p className="mt-1 text-sm text-foreground/60">Your own school-day register marks only.</p>
          <Link href="/student/today" className="mt-2 inline-block text-sm text-foreground/55 hover:text-foreground">
            ← Today’s timetable
          </Link>
        </header>

        {loading ? <p className="text-sm text-foreground/60">Loading…</p> : null}
        {error ? (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground/60">
            No attendance marks recorded yet.
          </p>
        ) : null}

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
                    <p className="text-xs text-foreground/50">{dateLabel} · {item.startsAt}–{item.endsAt}</p>
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
                {item.note ? (
                  <p className="mt-2 text-xs text-foreground/55">Note: {item.note}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
