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

type SessionBlock = {
  id: string;
  order: number;
  title: string;
  blockType: string;
  estimatedMinutes: number;
  contentId: string | null;
  learningObjective: string | null;
  status: string;
};

type SessionPayload = {
  id: string;
  status: string;
  currentBlockOrder: number;
  blocks: SessionBlock[];
};

function formatRemainingMs(ms: number): string {
  if (ms <= 0) return "Session ended";
  const totalMinutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min remaining`;
  return `${hours}h ${minutes}m remaining`;
}

function blockTone(blockType: string): string {
  if (blockType === "break") return "border-amber-200 bg-amber-50 text-amber-950";
  if (blockType === "tutor_support") return "border-sky-200 bg-sky-50 text-sky-950";
  if (blockType === "progress_report") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  return "border-violet-200 bg-violet-50/70 text-violet-950";
}

export default function ShortLearningLearnSession(props: Props) {
  const router = useRouter();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [starting, setStarting] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionPayload | null>(null);

  const startsAtMs = useMemo(() => new Date(props.startsAtIso).getTime(), [props.startsAtIso]);
  const endsAtMs = useMemo(() => new Date(props.endsAtIso).getTime(), [props.endsAtIso]);

  useEffect(() => {
    const tick = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetchWithRefreshRetry(
          `/api/student/short-learning/${encodeURIComponent(props.bookingId)}/session`,
          { credentials: "include", cache: "no-store", signal: controller.signal },
        );
        const payload = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(typeof payload.error === "string" ? payload.error : "Unable to load session plan.");
        }
        setSession(payload.session ?? null);
        setError(null);
      } catch (cause) {
        if (cancelled || controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Unable to load session plan.");
      } finally {
        if (!cancelled) setLoadingPlan(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [props.bookingId]);

  const windowOpen = nowMs >= startsAtMs - 10 * 60_000 && nowMs <= endsAtMs;
  const remainingLabel = formatRemainingMs(endsAtMs - nowMs);
  const readyBlocks = (session?.blocks ?? []).filter((b) => b.contentId).length;
  const generativeBlocks = (session?.blocks ?? []).filter((b) =>
    ["welcome", "lesson", "recap", "challenge", "review"].includes(b.blockType),
  ).length;

  const startAiSession = useCallback(async (blockOrder?: number) => {
    if (starting || !windowOpen) return;
    setStarting(true);
    setError(null);
    try {
      const res = await fetchWithRefreshRetry(
        `/api/student/short-learning/${encodeURIComponent(props.bookingId)}/session`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blockOrder }),
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Unable to start this learning block.");
      }
      if (typeof payload.lessonHref === "string" && payload.lessonHref.startsWith("/")) {
        router.push(payload.lessonHref);
        return;
      }
      throw new Error("Session started but no lesson link was returned.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start AI tutoring.");
      setStarting(false);
    }
  }, [props.bookingId, router, starting, windowOpen]);

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
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700">Short Learning · AI-led journey</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Your guided learning session</h1>
          <p className="mt-2 text-sm text-foreground/70">
            Same Daytime AI engine — sequenced into a {props.durationMinutes}-minute journey with lessons, recaps,
            challenge, and AI Tutor support.
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

          <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">Session plan</p>
              <p className="text-xs font-medium text-foreground/60">
                {loadingPlan
                  ? "Preparing…"
                  : session
                    ? `${readyBlocks}/${Math.max(generativeBlocks, readyBlocks)} content blocks ready · status ${session.status}`
                    : "Not generated yet"}
              </p>
            </div>
            {loadingPlan ? (
              <div className="mt-3 space-y-2">
                <div className="h-10 animate-pulse rounded-lg bg-slate-200/80" />
                <div className="h-10 animate-pulse rounded-lg bg-slate-200/80" />
                <div className="h-10 animate-pulse rounded-lg bg-slate-200/80" />
              </div>
            ) : session?.blocks?.length ? (
              <ol className="mt-3 space-y-2">
                {session.blocks.map((block) => (
                  <li
                    key={block.id}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${blockTone(block.blockType)}`}
                  >
                    <div>
                      <p className="font-semibold">
                        {block.order + 1}. {block.title}
                      </p>
                      <p className="text-xs opacity-80">
                        {block.estimatedMinutes > 0 ? `${block.estimatedMinutes} min` : "Wrap-up"}
                        {block.learningObjective ? ` · ${block.learningObjective}` : ""}
                        {block.contentId ? " · content ready" : block.blockType === "break" || block.blockType === "tutor_support" || block.blockType === "progress_report" ? "" : " · waiting"}
                      </p>
                    </div>
                    {block.contentId && windowOpen ? (
                      <button
                        type="button"
                        disabled={starting}
                        onClick={() => void startAiSession(block.order)}
                        className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-600 disabled:opacity-60"
                      >
                        Open
                      </button>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-foreground/70">
                No session plan yet. Starting will build the journey from the Daytime AI engine.
              </p>
            )}
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
                {starting ? "Starting learning block…" : "Continue with next learning block"}
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
