"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { TeacherSupportDashboard } from "@/lib/schools/teacher-support-dashboard";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";

function presenceLabel(status: string): string {
  switch (status) {
    case "available":
      return "Available";
    case "busy":
      return "Busy";
    case "paused":
      return "Paused";
    default:
      return "Offline";
  }
}

function presenceClass(status: string): string {
  switch (status) {
    case "available":
      return "border-emerald-300 bg-emerald-50 text-emerald-800";
    case "busy":
      return "border-amber-300 bg-amber-50 text-amber-900";
    case "paused":
      return "border-slate-300 bg-slate-100 text-slate-700";
    default:
      return "border-border bg-muted/40 text-foreground/60";
  }
}

export default function TeacherSupportPage() {
  const [dashboard, setDashboard] = useState<TeacherSupportDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithRefreshRetry("/api/teacher/support", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Unable to load support dashboard.");
      }
      setDashboard(data.dashboard as TeacherSupportDashboard);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load support dashboard.");
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      void load();
    }, 0);
    const timer = window.setInterval(() => void load(), 20_000);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(timer);
    };
  }, [load]);

  async function release(queueEntryId: string) {
    setBusyId(queueEntryId);
    setMessage(null);
    try {
      const response = await fetchWithRefreshRetry("/api/teacher/support/release", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueEntryId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Unable to release assignment.");
      }
      setMessage(typeof data.message === "string" ? data.message : "Assignment released.");
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to release assignment.");
    } finally {
      setBusyId(null);
    }
  }

  async function accept(queueEntryId: string) {
    setBusyId(queueEntryId);
    setMessage(null);
    try {
      const response = await fetchWithRefreshRetry("/api/teacher/support/accept", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueEntryId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Unable to accept support request.");
      }
      setMessage(typeof data.message === "string" ? data.message : "Support session started.");
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to accept support request.");
    } finally {
      setBusyId(null);
    }
  }

  const currentPeriod = dashboard?.today.periods.find((row) => row.isNow) ?? null;

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-foreground/45">Human support</p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">Support</h1>
          <p className="mt-1 text-sm text-foreground/60">
            AI stays first. Claim and accept only when a student needs a human tutor.
          </p>
        </div>
        {dashboard ? (
          <span className={`rounded-full border px-3 py-1.5 text-xs font-bold ${presenceClass(dashboard.presence.status)}`}>
            {presenceLabel(dashboard.presence.status)}
          </span>
        ) : null}
      </header>

      {loading && !dashboard ? <p className="text-sm text-foreground/60">Loading support…</p> : null}
      {error ? (
        <p className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-800">{error}</p>
      ) : null}
      {message ? (
        <p className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground/80">{message}</p>
      ) : null}

      {dashboard ? (
        <>
          <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Waiting" value={dashboard.counts.waiting} />
            <Stat label="Assigned to me" value={dashboard.counts.assignedToMe} />
            <Stat label="Active session" value={dashboard.counts.activeMine} />
            <Stat label="Completed today" value={dashboard.counts.completedToday} />
          </section>

          <section className="mb-6 rounded-2xl border border-sky-200 bg-sky-50/80 p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-700">Now</p>
            {dashboard.activeSession ? (
              <div className="mt-2">
                <p className="text-lg font-black text-slate-900">
                  Active with {dashboard.activeSession.studentName}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {dashboard.activeSession.supportMode === "SHORT_LEARNING" ? "Short Learning · " : ""}
                  {dashboard.activeSession.subject ?? "Support"}
                  {dashboard.activeSession.yearGroup ? ` · ${dashboard.activeSession.yearGroup}` : ""}
                  {" · "}Budget {dashboard.activeSession.budgetMinutes} min
                  {dashboard.activeSession.plannedEndsAt
                    ? ` · ends ${new Date(dashboard.activeSession.plannedEndsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : ""}
                </p>
                {dashboard.activeSession.supportMode === "SHORT_LEARNING" ? (
                  <p className="mt-2 text-xs text-slate-600">
                    AI was exhausted first. Human support is not guaranteed and is not private one-to-one tutoring.
                    Return the student to the same Short Learning block when finished.
                  </p>
                ) : null}
                {dashboard.activeSession.liveHref && dashboard.activeSession.supportMode !== "SHORT_LEARNING" ? (
                  <Link
                    href={dashboard.activeSession.liveHref}
                    className="mt-3 inline-flex rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-500"
                  >
                    Open Live Classroom
                  </Link>
                ) : null}
              </div>
            ) : currentPeriod ? (
              <div className="mt-2">
                <p className="text-lg font-black text-slate-900">
                  {currentPeriod.subject} · {currentPeriod.title}
                </p>
                <p className="mt-1 font-mono text-sm text-slate-600">
                  {currentPeriod.startsAt}–{currentPeriod.endsAt}
                </p>
                <Link
                  href={currentPeriod.liveHref}
                  className="mt-3 inline-flex rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-500"
                >
                  Open Live Classroom
                </Link>
                <p className="mt-2 text-xs text-slate-600">
                  Availability starts when Live Classroom is open — not from this page alone.
                </p>
              </div>
            ) : (
              <div className="mt-2">
                <p className="text-sm text-slate-700">
                  No active Day School period. Short Learning requests can still be accepted from the waiting list when you are available on shift.
                </p>
              </div>
            )}
          </section>

          <section className="mb-6 rounded-2xl border border-border bg-card p-5" data-testid="teacher-support-waiting">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Waiting</h2>
              <span className="text-xs text-foreground/50">{dashboard.counts.waiting}</span>
            </div>
            {dashboard.waiting.length === 0 ? (
              <p className="text-sm text-foreground/55">
                No students waiting. AI stays first — requests appear only after AI support is exhausted and a tutor is available.
              </p>
            ) : (
              <ul className="space-y-3">
                {dashboard.waiting.map((row) => (
                  <li key={row.queueEntryId} className="rounded-xl border border-border px-4 py-3" data-support-mode={row.supportMode}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-700">
                          {row.supportMode === "SHORT_LEARNING" ? "Short Learning" : "Day School"}
                        </p>
                        <p className="mt-1 font-semibold text-foreground">{row.studentName}</p>
                        <p className="mt-0.5 text-xs text-foreground/55">
                          {row.subject ?? "Lesson"}
                          {row.yearGroup ? ` · ${row.yearGroup}` : ""}
                          {row.budgetMinutes != null ? ` · ~${row.budgetMinutes} min budget` : ""}
                        </p>
                        {row.supportMode === "SHORT_LEARNING" ? (
                          <p className="mt-1 text-xs text-foreground/45">
                            {row.currentBlockLabel ?? "Current Short Learning block"}
                            {" · "}
                            {row.bookingWindowLabel ?? "Short Learning booking window"}
                            {row.questionKey ? ` · question ${row.questionKey}` : ""}
                            . AI already attempted. Human support is not guaranteed.
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-foreground/45">
                            AI support exhausted — accept to start timed support.
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busyId === row.queueEntryId || dashboard.presence.status === "busy"}
                          onClick={() => void accept(row.queueEntryId)}
                          className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-600 disabled:opacity-50"
                        >
                          {busyId === row.queueEntryId ? "Accepting…" : "Accept"}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-6 rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Assigned</h2>
              <span className="text-xs text-foreground/50">{dashboard.counts.assignedToMe}</span>
            </div>
            {dashboard.assigned.length === 0 ? (
              <p className="text-sm text-foreground/55">
                No claimed assignments waiting for accept.
              </p>
            ) : (
              <ul className="space-y-3">
                {dashboard.assigned.map((row) => (
                  <li key={row.queueEntryId} className="rounded-xl border border-border px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-700">
                          {row.supportMode === "SHORT_LEARNING" ? "Short Learning" : "Day School"}
                        </p>
                        <p className="mt-1 font-semibold text-foreground">{row.studentName}</p>
                        <p className="mt-0.5 text-xs text-foreground/55">
                          {row.subject ?? "Lesson"}
                          {row.yearGroup ? ` · ${row.yearGroup}` : ""}
                          {row.budgetMinutes != null ? ` · ~${row.budgetMinutes} min budget` : ""}
                        </p>
                        <p className="mt-1 text-xs text-foreground/45">
                          AI support exhausted — accept to freeze the snapshot and start timed support.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busyId === row.queueEntryId}
                          onClick={() => void accept(row.queueEntryId)}
                          className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-50"
                        >
                          {busyId === row.queueEntryId ? "Accepting…" : "Accept"}
                        </button>
                        {row.liveHref ? (
                          <Link
                            href={row.liveHref}
                            className="rounded-lg border border-sky-300 px-3 py-1.5 text-xs font-bold text-sky-800 hover:bg-sky-50"
                          >
                            Open Live Classroom
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          disabled={busyId === row.queueEntryId}
                          onClick={() => void release(row.queueEntryId)}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground/70 hover:bg-muted/40 disabled:opacity-50"
                        >
                          {busyId === row.queueEntryId ? "Releasing…" : "Decline"}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-6 grid gap-4 sm:grid-cols-2">
            <article className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/45">Waiting</p>
              <p className="mt-2 text-3xl font-black">{dashboard.counts.waiting}</p>
              <p className="mt-1 text-xs text-foreground/55">
                Students eligible after AI exhaustion. Accept only when online and available.
              </p>
            </article>
            <article className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/45">Needs follow-up</p>
              <p className="mt-2 text-3xl font-black">{dashboard.counts.unresolvedNeeded}</p>
              <p className="mt-1 text-xs text-foreground/55">
                Unresolved outcomes still needing a report today.
              </p>
            </article>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Recent history</h2>
              <Link href="/teacher/support/history" className="text-sm text-primary hover:underline">
                View all →
              </Link>
            </div>
            {dashboard.recentHistory.length === 0 ? (
              <p className="text-sm text-foreground/55">No completed sessions yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {dashboard.recentHistory.slice(0, 6).map((row) => (
                  <li key={row.sessionId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span className="font-medium">{row.studentName}</span>
                    <span className="text-foreground/55">
                      {row.outcome?.replaceAll("_", " ") ?? row.status}
                      {row.exceededBudget ? " · over budget" : ""}
                      {row.hasUnresolvedReport ? " · report filed" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/45">{label}</p>
      <p className="mt-1 text-2xl font-black text-foreground">{value}</p>
    </div>
  );
}
