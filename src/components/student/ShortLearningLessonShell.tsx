"use client";

import { useEffect, useState, type ReactNode } from "react";
import DaytimeTutorPanel from "@/components/games/DaytimeTutorPanel";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";

type Props = {
  bookingId: string;
  sessionId?: string;
  blockId?: string;
  assignmentId: string;
  contentId: string;
  questionId?: string;
  questionIndex?: number;
  studentAttempt?: string;
  children: ReactNode;
};

type SupportPayload = {
  bookingActive?: boolean;
  humanSupport?: { state: string; label: string };
  wording?: {
    aiAvailable?: string;
    humanMayBeOffered?: string;
    notGuaranteed?: string;
    notPrivate?: string;
  };
  supportContext?: {
    sessionId?: string;
    blockId?: string;
    subject?: string;
    yearGroup?: string;
    learningObjective?: string | null;
  } | null;
};

export default function ShortLearningLessonShell({
  bookingId,
  sessionId,
  blockId,
  assignmentId,
  contentId,
  questionId,
  questionIndex,
  studentAttempt,
  children,
}: Props) {
  const [support, setSupport] = useState<SupportPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const qs = new URLSearchParams({ assignmentId, contentId });
      const res = await fetchWithRefreshRetry(
        `/api/student/short-learning/${encodeURIComponent(bookingId)}/support-context?${qs.toString()}`,
        { credentials: "include" },
      );
      const json = (await res.json().catch(() => ({}))) as SupportPayload;
      if (!cancelled && res.ok) setSupport(json);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId, assignmentId, contentId]);

  const resolvedSessionId = sessionId ?? support?.supportContext?.sessionId;
  const resolvedBlockId = blockId ?? support?.supportContext?.blockId;

  return (
    <div data-testid="short-learning-lesson-shell" className="min-h-screen bg-linear-to-b from-slate-50 via-[#f7f8fc] to-violet-50/40 text-slate-900">
      <div className="border-b border-violet-100 bg-violet-50/80 px-4 py-3 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700">Short Learning · AI-led</p>
        <p className="mt-1 text-sm text-violet-950">
          {support?.supportContext?.subject
            ? `${support.supportContext.subject}${support.supportContext.yearGroup ? ` · ${support.supportContext.yearGroup}` : ""}`
            : "AI support throughout this booking"}
        </p>
        {support?.supportContext?.learningObjective ? (
          <p className="mt-1 text-xs text-violet-800/80">{support.supportContext.learningObjective}</p>
        ) : null}
      </div>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,34%)] lg:items-start">
        <main className="min-w-0 space-y-4 pb-8">{children}</main>
        <aside
          data-testid="short-learning-lesson-sidebar"
          className="flex h-full flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.06)] lg:sticky lg:top-4"
        >
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600">Need help?</p>
            <h2 className="mt-1 text-base font-bold text-slate-900">AI Tutor</h2>
          </div>
          <DaytimeTutorPanel
            shortLearningBookingId={bookingId}
            shortLearningSessionId={resolvedSessionId}
            shortLearningBlockId={resolvedBlockId}
            assignmentId={assignmentId}
            contentId={contentId}
            questionId={questionId}
            questionIndex={questionIndex}
            studentAttempt={studentAttempt}
            variant="premium"
            className="rounded-xl border border-violet-100 bg-violet-50/50 p-3"
          />
          <section
            data-testid="short-learning-human-support"
            data-support-state={support?.humanSupport?.state ?? "ai-only"}
            className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-700"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Support</p>
            <p className="mt-2 font-semibold text-slate-800">
              {support?.humanSupport?.label ?? "AI support available"}
            </p>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              <li>{support?.wording?.aiAvailable ?? "AI support is available throughout."}</li>
              <li>{support?.wording?.humanMayBeOffered ?? "Human support may be offered when available."}</li>
              <li>{support?.wording?.notGuaranteed ?? "Human support is not guaranteed."}</li>
              <li>{support?.wording?.notPrivate ?? "This is not a private one-to-one tutor booking."}</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
