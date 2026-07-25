"use client";

import type { ReactNode } from "react";

type FeedbackKind = "correct" | "incorrect";

type Props = {
  kind: FeedbackKind;
  explanation?: string | null;
  onContinue?: () => void;
  onTryAgain?: () => void;
  onAskTutor?: () => void;
  children?: ReactNode;
};

export default function DaytimeAnswerFeedback({
  kind,
  explanation,
  onContinue,
  onTryAgain,
  onAskTutor,
  children,
}: Props) {
  if (kind === "correct") {
    return (
      <div
        data-testid="daytime-feedback-correct"
        className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm"
      >
        <p className="text-sm font-bold text-emerald-800">Well done — that&apos;s correct</p>
        {explanation ? (
          <p className="mt-2 text-sm leading-relaxed text-emerald-900/90">{explanation}</p>
        ) : null}
        {children}
        {onContinue ? (
          <button
            type="button"
            onClick={onContinue}
            className="mt-4 inline-flex rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            Continue
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      data-testid="daytime-feedback-incorrect"
      className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 shadow-sm"
    >
      <p className="text-sm font-bold text-amber-900">Not quite — keep going</p>
      <p className="mt-2 text-sm leading-relaxed text-amber-950/80">
        Take another look. You can try again or ask the AI Tutor for a first step — we won&apos;t show the answer yet.
      </p>
      {children}
      <div className="mt-4 flex flex-wrap gap-2">
        {onTryAgain ? (
          <button
            type="button"
            onClick={onTryAgain}
            className="inline-flex rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-bold text-amber-900 transition hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
          >
            Try again
          </button>
        ) : null}
        {onAskTutor ? (
          <button
            type="button"
            onClick={onAskTutor}
            className="inline-flex rounded-xl border border-violet-300 bg-violet-50 px-4 py-2.5 text-sm font-bold text-violet-900 transition hover:bg-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
          >
            Ask AI Tutor
          </button>
        ) : null}
      </div>
    </div>
  );
}
