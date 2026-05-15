"use client";

import { useEffect, useRef, useState } from "react";
import type { CoachResponse, CoachSubject } from "@/lib/coach/types";
import { getSessionSummary } from "@/lib/coach/session-memory";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export type SmartCoachPanelProps = {
  subject: CoachSubject;
  question: string;
  correctAnswer: string;
  studentAnswer?: string;
  passageText?: string;
  /** Number of hints already used on this question before opening the panel. */
  hintCount: number;
  mathDifficulty?: number;
  ageRange?: string;
  yearGroup?: number;
  skillFocus?: string;
  /** 0–1 from coaching memory. Defaults to 0.5. */
  confidenceScore?: number;
  /**
   * Time the student spent on the question before opening the coach, in ms.
   * Used for emotional state detection and wait-phase skip logic.
   */
  responseTimeMs?: number;
  /** Called each time the student consumes a hint level. */
  onHintUsed: (newHintCount: number) => void;
  onClose: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function SmartCoachPanel({
  subject,
  question,
  correctAnswer,
  studentAnswer,
  passageText,
  hintCount,
  mathDifficulty,
  ageRange,
  yearGroup,
  skillFocus,
  confidenceScore = 0.5,
    responseTimeMs,
  onHintUsed,
  onClose,
}: SmartCoachPanelProps) {
  const [response, setResponse] = useState<CoachResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Follow-up tracking
  const [followUpSelectedIndex, setFollowUpSelectedIndex] = useState<number | null>(null);
  const [followUpMessage, setFollowUpMessage] = useState<string | null>(null);
  const [followUpAnswered, setFollowUpAnswered] = useState(false);

  // Internal hint level (starts at hintCount, advances on "Next hint" clicks)
  const [localHintCount, setLocalHintCount] = useState(hintCount);
  const fetchedForRef = useRef<number | null>(null);

  // Wait-phase: 3 seconds on first hint, skipped if student spent > 30s
  const skipWait = (responseTimeMs ?? 0) > 30_000;
  const isFirstHint = hintCount === 0;
  const [waitPhase, setWaitPhase] = useState(isFirstHint && !skipWait);
  const [waitCountdown, setWaitCountdown] = useState(3);

  // Session summary (client-side, resets on page reload)
  const sessionSummary = getSessionSummary(subject, skillFocus);

  // ── Fetch coach response ──────────────────────────────────────────────────

  useEffect(() => {
    if (waitPhase) return; // hold during wait
    if (fetchedForRef.current === localHintCount) return;
    fetchedForRef.current = localHintCount;

    setLoading(true);
    setError(null);
    setFollowUpSelectedIndex(null);
    setFollowUpMessage(null);
    setFollowUpAnswered(false);

    const body = {
      subject,
      question,
      correctAnswer,
      studentAnswer,
      passageText,
      hintCount: localHintCount,
      mathDifficulty,
      ageRange,
      yearGroup,
      skillFocus,
      confidenceScore,
      responseTimeMs,
    };

    fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Coach unavailable");
        return res.json() as Promise<CoachResponse>;
      })
      .then((data) => {
        setResponse(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Coach is temporarily unavailable. Try again.");
        setLoading(false);
      });
  }, [
    waitPhase,
    localHintCount,
    subject,
    question,
    correctAnswer,
    studentAnswer,
    passageText,
    mathDifficulty,
    ageRange,
    yearGroup,
    skillFocus,
    confidenceScore,
    responseTimeMs,
  ]);

  // ── Wait-phase countdown ──────────────────────────────────────────────────

  useEffect(() => {
    if (!waitPhase) return;
    if (waitCountdown <= 0) { setWaitPhase(false); return; }
    const t = setTimeout(() => setWaitCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [waitPhase, waitCountdown]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleFollowUpSelect(index: number) {
    if (followUpAnswered || !response?.followUp) return;
    setFollowUpSelectedIndex(index);
    setFollowUpAnswered(true);
    const fu = response.followUp;
    if (index === fu.correctIndex) {
      setFollowUpMessage(fu.onCorrect);
    } else {
      setFollowUpMessage(fu.onWrong);
    }
  }

  function handleNextHint() {
    const newCount = localHintCount + 1;
    setLocalHintCount(newCount);
    onHintUsed(newCount);

    function handleSkipWait() {
      setWaitCountdown(0);
      setWaitPhase(false);
    }
  }

  // Can progress to next hint if:
  // - follow-up has been answered (or there is no follow-up)
  // - not already at shouldReveal
  const canNextHint =
    !loading &&
    !error &&
    response !== null &&
    !response.shouldReveal &&
    (followUpAnswered || !response.followUp);

  // ── Render helpers ────────────────────────────────────────────────────────

  const hintDots = response ? Array.from({ length: 4 }, (_, i) => i < response.hintLevel) : [];

  // ── Render: wait phase ────────────────────────────────────────────────────

  if (waitPhase) {
    return (
      <CoachShell>
        <div className="flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">Smart Coach</p>
          <CloseButton onClick={onClose} />
        </div>
        <div className="mt-4 text-center">
          <p className="text-2xl">🤔</p>
          <p className="mt-2 text-sm font-semibold text-cyan-900">
            Take a moment to think before I help you…
          </p>
          <p className="mt-1 text-xs text-slate-400">Hint in {waitCountdown}s</p>
          <button
            onClick={handleSkipWait}
            className="mt-3 text-xs font-medium text-slate-400 underline hover:text-slate-600"
          >
            Skip
          </button>
        </div>
      </CoachShell>
    );
  }

  if (loading) {
    return (
      <CoachShell>
        <div className="flex items-center gap-2 py-4 text-sm text-cyan-700">
          <Spinner />
          <span>Thinking…</span>
        </div>
      </CoachShell>
    );
  }

  if (error || !response) {
    return (
      <CoachShell>
        <p className="text-sm text-red-600">{error ?? "Something went wrong."}</p>
        <button
          onClick={onClose}
          className="mt-3 text-xs font-bold text-slate-500 underline"
        >
          Close
        </button>
      </CoachShell>
    );
  }

  const { followUp, steps, shouldReveal, reinforcementNote, tryAgainPrompt } = response;

  return (
    <CoachShell>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">
            Smart Coach
            {response.ageBand === "gcse" || response.ageBand === "secondary" ? " · AI-enhanced" : ""}
          </p>
          {/* Hint progress dots */}
          <div className="mt-1 flex gap-1">
            {hintDots.map((filled, i) => (
              <span
                key={i}
                className={`inline-block h-2 w-2 rounded-full ${filled ? "bg-cyan-500" : "bg-slate-200"}`}
              />
            ))}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close coach"
          className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
          </svg>
        </button>
      </div>

      {/* Emotional tone — empathetic opening line */}
      {response.emotionalTone && (
        <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2">
          <p className="text-sm font-medium text-indigo-800">{response.emotionalTone}</p>
        </div>
      )}

      {/* Session continuity note */}
      {sessionSummary.continuityNote && (
        <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
          <p className="text-xs text-amber-800">
            <span className="font-bold">From earlier: </span>
            {sessionSummary.continuityNote}
          </p>
        </div>
      )}

      {/* Main coaching message */}
      <p className="mt-3 text-sm leading-6 text-cyan-950">{response.message}</p>

      {/* Visual steps */}
      {steps.length > 0 && (
        <div className="mt-3 space-y-2">
          {steps.map((step, i) => (
            <div
              key={i}
              className="rounded-xl border border-cyan-100 bg-white px-3 py-2 shadow-sm"
            >
              <p className="font-mono text-sm font-bold text-slate-800">{step.expression}</p>
              <p className="mt-0.5 text-xs text-slate-500">{step.explanation}</p>
            </div>
          ))}
        </div>
      )}

      {/* Follow-up interactive question */}
      {followUp && !followUpAnswered && (
        <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50 p-3">
          <p className="text-sm font-bold text-violet-900">{followUp.question}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {followUp.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleFollowUpSelect(i)}
                className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-left text-sm font-medium text-violet-800 transition hover:bg-violet-100 hover:border-violet-400"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Follow-up result */}
      {followUpMessage && (
        <div
          className={`mt-3 rounded-xl border px-3 py-2 text-sm ${
            followUpSelectedIndex === followUp?.correctIndex
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {followUpSelectedIndex === followUp?.correctIndex ? "✓ " : "↺ "}
          {followUpMessage}
        </div>
      )}

      {/* Full reveal answer */}
      {shouldReveal && (
        <div className="mt-4 rounded-xl border-2 border-cyan-300 bg-cyan-50 px-4 py-3">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">Answer</p>
          <p className="mt-1 text-lg font-black text-cyan-900">{correctAnswer}</p>
        </div>
      )}

      {/* Try-again prompt after reveal */}
      {shouldReveal && tryAgainPrompt && (
        <p className="mt-2 text-xs italic text-slate-500">{tryAgainPrompt}</p>
      )}

      {/* Similar question — mastery check after reveal */}
      {shouldReveal && response.similarQuestion && (
        <div className="mt-4 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">
            Now prove it — try this:
          </p>
          <p className="mt-1 text-sm font-semibold text-emerald-900">{response.similarQuestion.prompt}</p>
          {response.similarQuestion.answer && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium text-emerald-600 hover:text-emerald-800">
                Check answer
              </summary>
              <p className="mt-1 font-mono text-sm font-bold text-emerald-900">{response.similarQuestion.answer}</p>
            </details>
          )}
        </div>
      )}

      {/* Reinforcement note */}
      {reinforcementNote && (
        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-xs font-bold text-slate-500">Tip</p>
          <p className="text-xs text-slate-600">{reinforcementNote}</p>
        </div>
      )}

      {/* Footer actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        {!shouldReveal && (
          <button
            disabled={!canNextHint}
            onClick={handleNextHint}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              canNextHint
                ? "bg-cyan-500 text-white hover:bg-cyan-600"
                : "cursor-not-allowed bg-slate-200 text-slate-400"
            }`}
          >
            {!followUpAnswered && followUp ? "Answer the question first ↑" : "Next hint →"}
          </button>
        )}
        {shouldReveal && (
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-900"
          >
            Close coach
          </button>
        )}
      </div>
    </CoachShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function CoachShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[1.75rem] border border-cyan-200 bg-cyan-50/80 p-4 shadow-sm">
      {children}
    </div>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Close coach"
      className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
    >
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
      </svg>
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-cyan-500"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 12 0 12 0v4a8 8 0 00-8 8H4z"
      />
    </svg>
  );
}
