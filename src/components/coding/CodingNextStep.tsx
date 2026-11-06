"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import type { CodingNextStep as NextStep } from "@/lib/coding/next-step";

export default function CodingNextStep({ lessonId, bookingId, showReturnLink = true }: { lessonId: string; bookingId?: string; showReturnLink?: boolean }) {
  const [step, setStep] = useState<NextStep | null>(null);
  const [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => { setError(true); controller.abort(); }, 15000);
    const query = new URLSearchParams({ completedLessonId: lessonId });
    if (bookingId) query.set("bookingId", bookingId);
    void (async () => {
      try {
        const response = await fetchWithRefreshRetry(`/api/student/coding/next?${query}`, { signal: controller.signal, credentials: "same-origin", cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !["next", "caught-up", "prerequisites"].includes(data.state) || data.state === "next" && (typeof data.activity?.title !== "string" || typeof data.activity?.href !== "string" || !data.activity.href.startsWith("/student/coding/"))) throw new Error("Next activity unavailable");
        if (!controller.signal.aborted) setStep(data as NextStep);
      } catch { if (!controller.signal.aborted) setError(true); }
      finally { window.clearTimeout(timeout); }
    })();
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [lessonId, bookingId, attempt]);
  const home = bookingId ? `/student/coding?bookingId=${encodeURIComponent(bookingId)}` : "/student/coding";
  return <section aria-label="What happens next" className="mt-4 space-y-3 rounded-xl border border-emerald-300 bg-white p-4">
    <h3 className="text-base font-bold text-emerald-950">What happens next?</h3>
    <div role="status" aria-live="polite">
      {error ? <><p className="text-sm text-slate-700">Your lesson is mastered. We could not check your next activity just now.</p><button type="button" className="mt-2 min-h-11 rounded-xl border border-emerald-700 px-4 py-2 font-bold text-emerald-900" onClick={() => { setError(false); setStep(null); setAttempt(value => value + 1); }}>Check again</button></> : !step ? <p className="text-sm text-slate-700">Checking your next available activity…</p> : step.state === "next" ? <><p className="text-sm text-slate-700">Ready to continue: <strong>{step.activity.title}</strong></p><Link className="mt-3 inline-flex min-h-12 items-center rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white" href={bookingId ? `${step.activity.href}?bookingId=${encodeURIComponent(bookingId)}` : step.activity.href}>Continue to next activity →</Link></> : step.state === "prerequisites" ? <p className="text-sm text-slate-700">You’ve mastered this lesson. Other published activities still need prerequisite evidence. Return to your learning journey to see what to complete.</p> : <><p className="font-bold text-emerald-950">You’ve completed all currently available lessons.</p><p className="mt-2 text-sm text-slate-700">Your achievement is saved. You can revisit your projects and practise from your learning journey.</p></>}
    </div>
    {showReturnLink && <Link href={home} className="inline-flex min-h-11 items-center font-bold text-emerald-900 underline underline-offset-4">Return to Coding learning →</Link>}
  </section>;
}
