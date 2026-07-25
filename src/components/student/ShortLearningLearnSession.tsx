"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import Navbar from "@/components/layout/Navbar";
import { SHORT_LEARNING_PROMISE } from "@/lib/schools/short-learning-bookings";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";

type Props = {
  bookingId: string;
  subject: string;
  schoolName: string;
  startsAtIso: string;
  endsAtIso: string;
  durationMinutes: number;
  learningFocus: string | null;
};

type AssignmentRow = {
  id: string;
  subject: string;
  status: string;
  title: string;
};

function normalizeSubject(value: string): string {
  return value.trim().toLowerCase();
}

function formatRemainingMs(ms: number): string {
  if (ms <= 0) return "Session ended";
  const totalMinutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min remaining`;
  return `${hours}h ${minutes}m remaining`;
}

export default function ShortLearningLearnSession(props: Props) {
  const router = useRouter();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startsAtMs = useMemo(() => new Date(props.startsAtIso).getTime(), [props.startsAtIso]);
  const endsAtMs = useMemo(() => new Date(props.endsAtIso).getTime(), [props.endsAtIso]);

  useEffect(() => {
    const tick = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(tick);
  }, []);

  const windowOpen = nowMs >= startsAtMs - 10 * 60_000 && nowMs <= endsAtMs;
  const remainingLabel = formatRemainingMs(endsAtMs - nowMs);

  const startAiSession = useCallback(async () => {
    if (starting || !windowOpen) return;
    setStarting(true);
    setError(null);
    try {
      const summaryRes = await fetchWithRefreshRetry("/api/student/dashboard-summary", {
        credentials: "include",
        cache: "no-store",
      });
      const summary = await summaryRes.json().catch(() => ({}));
      if (!summaryRes.ok) {
        throw new Error(typeof summary.error === "string" ? summary.error : "Unable to load your learning assignments.");
      }

      const assignments = (Array.isArray(summary.assignments) ? summary.assignments : []) as AssignmentRow[];
      const subjectNeedle = normalizeSubject(props.subject);
      const match =
        assignments.find(
          (row) =>
            row.status !== "completed" &&
            (normalizeSubject(row.subject).includes(subjectNeedle) ||
              subjectNeedle.includes(normalizeSubject(row.subject))),
        ) ?? assignments.find((row) => row.status !== "completed");

      if (match?.id) {
        const params = new URLSearchParams({
          assignmentId: match.id,
          shortLearningBookingId: props.bookingId,
        });
        router.push(`/games/lesson?${params.toString()}`);
        return;
      }

      const journeyRes = await fetchWithRefreshRetry("/api/student/daily-journey?quick=1", {
        credentials: "include",
        cache: "no-store",
      });
      const journey = await journeyRes.json().catch(() => ({}));
      if (!journeyRes.ok) {
        throw new Error(typeof journey.error === "string" ? journey.error : "No lesson is ready for this Short Learning session yet.");
      }
      const assignmentId = journey.lesson?.assignmentId;
      if (typeof assignmentId !== "string" || !assignmentId) {
        throw new Error("No lesson assigned yet. Ask your parent or teacher to assign work, then try again.");
      }

      const params = new URLSearchParams({
        assignmentId,
        shortLearningBookingId: props.bookingId,
      });
      router.push(`/games/lesson?${params.toString()}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start AI tutoring.");
      setStarting(false);
    }
  }, [props.bookingId, props.subject, router, starting, windowOpen]);

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link
          href={`/student/short-learning/${encodeURIComponent(props.bookingId)}`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          ← Session details
        </Link>

        <div className="mt-6 rounded-2xl border border-violet-200 bg-violet-50/80 p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700">Short Learning · AI-led</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Your AI tutoring session</h1>
          <p className="mt-2 text-sm text-foreground/70">
            This is not Day School. Day School follows your school timetable and classroom attendance. Short Learning is
            parent-booked, after-hours, and led by AI coaching.
          </p>
          <p className="mt-3 text-sm font-medium text-violet-950">{SHORT_LEARNING_PROMISE}</p>
        </div>

        <section className="mt-8 rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold capitalize text-foreground">{props.subject}</h2>
              <p className="mt-1 text-sm text-foreground/60">
                {props.schoolName} · {new Date(props.startsAtIso).toLocaleString()} · {props.durationMinutes} minutes
              </p>
              {props.learningFocus ? (
                <p className="mt-2 text-sm text-foreground/80">Focus: {props.learningFocus}</p>
              ) : null}
            </div>
            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800">{remainingLabel}</span>
          </div>

          <div className="mt-5 space-y-3 rounded-xl bg-muted/40 p-4 text-sm text-foreground/80">
            <p>
              Your AI coach leads this session. A human tutor may join only if they are on a published support shift and
              available — they are a safety net, not a private booking.
            </p>
            <p>If no tutor is eligible, AI tutoring continues. You will not wait on an empty queue.</p>
          </div>

          {!windowOpen ? (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              {nowMs < startsAtMs ? (
                <p>
                  You can enter from 10 minutes before the start (
                  {new Date(startsAtMs - 10 * 60_000).toLocaleString()}).
                </p>
              ) : (
                <p>This Short Learning window has ended.</p>
              )}
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {error ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void startAiSession()}
                disabled={starting}
                className="inline-flex rounded-xl bg-violet-700 px-5 py-3 text-sm font-bold text-white hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {starting ? "Starting AI tutor…" : "Continue with AI Tutor"}
              </button>
            </div>
          )}

          <p className="mt-6 text-sm text-foreground/60">
            Prefer Day School? Return to your{" "}
            <Link href="/student/today" className="font-semibold text-primary underline">
              school day timetable
            </Link>{" "}
            for classroom periods and attendance.
          </p>
        </section>
      </div>
    </main>
  );
}
