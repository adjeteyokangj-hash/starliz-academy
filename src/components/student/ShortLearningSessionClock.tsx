"use client";

import { useEffect, useRef, useState } from "react";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import {
  formatSessionCountdown,
  remainingMsUntilIso,
  shortLearningClockCopy,
  shortLearningClockPhase,
} from "@/lib/schools/short-learning-session-clock";

type Props = {
  bookingId?: string | null;
  assignmentId?: string | null;
  contentId?: string | null;
  endsAtIso?: string | null;
  durationMinutes?: number | null;
  onEnded?: () => void;
};

export default function ShortLearningSessionClock({
  bookingId,
  assignmentId,
  contentId,
  endsAtIso,
  durationMinutes,
  onEnded,
}: Props) {
  const [fetchedEndsAt, setFetchedEndsAt] = useState("");
  const [fetchedDuration, setFetchedDuration] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const endedRef = useRef(false);
  const resolvedEndsAt = endsAtIso || fetchedEndsAt;
  const resolvedDuration = durationMinutes ?? fetchedDuration;

  useEffect(() => {
    if (endsAtIso || !bookingId) return;
    let cancelled = false;
    void (async () => {
      const qs = new URLSearchParams();
      if (assignmentId) qs.set("assignmentId", assignmentId);
      if (contentId) qs.set("contentId", contentId);
      const response = await fetchWithRefreshRetry(
        `/api/student/short-learning/${encodeURIComponent(bookingId)}/support-context${qs.size ? `?${qs.toString()}` : ""}`,
        { credentials: "include" },
      );
      const payload = await response.json().catch(() => ({})) as {
        booking?: { endsAt?: string; durationMinutes?: number };
      };
      if (cancelled || !response.ok) return;
      if (payload.booking?.endsAt) setFetchedEndsAt(payload.booking.endsAt);
      if (typeof payload.booking?.durationMinutes === "number") {
        setFetchedDuration(payload.booking.durationMinutes);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assignmentId, bookingId, contentId, endsAtIso]);

  useEffect(() => {
    if (!resolvedEndsAt) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [resolvedEndsAt]);

  const remainingMs = resolvedEndsAt ? remainingMsUntilIso(resolvedEndsAt, nowMs) : Number.NaN;
  const hasClock = Number.isFinite(remainingMs);
  const phase = hasClock ? shortLearningClockPhase(remainingMs) : "ok";
  const copy = hasClock
    ? shortLearningClockCopy({ remainingMs, durationMinutes: resolvedDuration })
    : null;

  useEffect(() => {
    if (phase !== "ended" || endedRef.current) return;
    endedRef.current = true;
    onEnded?.();
  }, [onEnded, phase]);

  if (!copy) return null;

  const tone = phase === "ended"
    ? "border-rose-200 bg-rose-50 text-rose-950"
    : phase === "final"
      ? "border-amber-300 bg-amber-50 text-amber-950"
      : phase === "warning"
        ? "border-orange-200 bg-orange-50 text-orange-950"
        : "border-indigo-200 bg-indigo-50 text-indigo-950";

  return (
    <div
      data-testid="short-learning-session-clock"
      data-clock-phase={phase}
      className={`rounded-2xl border px-4 py-3 ${tone}`}
      role="status"
      aria-live="polite"
    >
      <p className="text-[11px] font-black uppercase tracking-[0.16em]">{copy.headline}</p>
      {phase === "ended" ? null : (
        <p className="mt-1 font-mono text-2xl font-black tabular-nums">{formatSessionCountdown(remainingMs)}</p>
      )}
      <p className="mt-1 text-sm font-semibold">{copy.detail}</p>
    </div>
  );
}
