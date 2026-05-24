"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type QuickQuestion = {
  id: string;
  subject: string;
};

type QuickSession = {
  sessionId: string;
  status: "in_progress" | "completed";
  answered: number;
  totalQuestions: number;
  currentQuestion: QuickQuestion | null;
  progressPercent?: number;
};

type QuickLevel = {
  accuracy: number;
  level: "below" | "secure" | "advanced";
};

type StartPayload = {
  ok?: boolean;
  error?: string;
  resumed?: boolean;
  testDesign?: {
    questionCountMin: number;
    questionCountMax: number;
  };
  session?: QuickSession;
};

type AnswerPayload = {
  ok?: boolean;
  error?: string;
  completed?: boolean;
  session?: QuickSession;
  levels?: Record<string, QuickLevel> | null;
};

type CompletePayload = {
  ok?: boolean;
  error?: string;
  completed?: boolean;
  levels?: Record<string, QuickLevel>;
};

type LevelsPayload = {
  ok?: boolean;
  error?: string;
  levels?: Record<string, QuickLevel>;
};

export default function StudentOnboardingPage() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [quickSession, setQuickSession] = useState<QuickSession | null>(null);
  const [levels, setLevels] = useState<Record<string, QuickLevel> | null>(null);

  async function hydrateLevels() {
    const response = await fetch("/api/student/quick-level-finder/levels", {
      credentials: "include",
    });
    const payload = (await response.json()) as LevelsPayload;
    if (response.ok && payload.ok && payload.levels) {
      setLevels(payload.levels);
    }
  }

  async function startLevelFinder(restart = false) {
    setStarting(true);
    setError(null);
    setSummary(null);
    setLevels(null);
    try {
      const response = await fetch("/api/student/quick-level-finder/start", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restart }),
      });
      const payload = (await response.json()) as StartPayload;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Unable to start Quick Level Finder.");
      }
      if (!payload.session) {
        throw new Error("Quick Level Finder session was not returned.");
      }
      setQuickSession(payload.session);
      setSummary(
        payload.resumed
          ? "Resumed your Quick Level Finder session."
          : `Quick Level Finder ready: ${payload.testDesign?.questionCountMin ?? 0}-${payload.testDesign?.questionCountMax ?? 0} questions.`,
      );
      if (payload.session.status === "completed") {
        await hydrateLevels();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start Quick Level Finder.");
    } finally {
      setStarting(false);
    }
  }

  async function submitAnswer(correct: boolean) {
    if (!quickSession?.currentQuestion) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/student/quick-level-finder/answer", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: quickSession.sessionId,
          questionId: quickSession.currentQuestion.id,
          correct,
          timeSpentMs: 6000,
        }),
      });
      const payload = (await response.json()) as AnswerPayload;
      if (!response.ok || !payload.ok || !payload.session) {
        throw new Error(payload.error ?? "Unable to save answer.");
      }
      setQuickSession(payload.session);
      if (payload.completed) {
        setSummary("Quick Level Finder completed. Your personalised learning path is now unlocking.");
        if (payload.levels) {
          setLevels(payload.levels);
        } else {
          await hydrateLevels();
        }
        window.setTimeout(() => {
          router.push("/student/dashboard");
        }, 1200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit answer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function completeNow() {
    if (!quickSession) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/student/quick-level-finder/complete", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: quickSession.sessionId }),
      });
      const payload = (await response.json()) as CompletePayload;
      if (!response.ok || !payload.ok || !payload.completed) {
        throw new Error(payload.error ?? "Unable to complete Quick Level Finder.");
      }
      setQuickSession((prev) => prev ? { ...prev, status: "completed", currentQuestion: null } : prev);
      setLevels(payload.levels ?? null);
      setSummary("Quick Level Finder completed. Your dashboard journey is now available.");
      window.setTimeout(() => {
        router.push("/student/dashboard");
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete Quick Level Finder.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <section className="mx-auto max-w-3xl rounded-3xl border border-cyan-400/30 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-8 shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Student onboarding</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">Welcome to StarLiz Academy</h1>
        <p className="mt-3 text-slate-300">
          We need to learn your level before we build your personalised learning journey.
        </p>

        <ol className="mt-5 space-y-2 text-sm text-slate-200">
          <li>1. Choose your subjects</li>
          <li>2. Complete your Quick Level Finder</li>
          <li>3. AI builds your learning path</li>
          <li>4. Lessons unlock automatically</li>
        </ol>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void startLevelFinder(false)}
            disabled={starting}
            className="rounded-2xl bg-cyan-400 px-5 py-3 font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {starting ? "Starting..." : quickSession ? "Resume My Level Finder" : "Start My Level Finder"}
          </button>
          <button
            type="button"
            onClick={() => void startLevelFinder(true)}
            disabled={starting}
            className="rounded-2xl border border-cyan-300/40 px-5 py-3 font-bold text-cyan-100 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Restart Finder
          </button>
          <button
            type="button"
            onClick={() => router.push("/student/dashboard")}
            className="rounded-2xl border border-white/20 px-5 py-3 font-bold text-slate-200 transition hover:bg-white/10"
          >
            Back to Dashboard
          </button>
          {quickSession && quickSession.status === "in_progress" ? (
            <button
              type="button"
              onClick={() => void completeNow()}
              disabled={submitting}
              className="rounded-2xl border border-emerald-300/40 px-5 py-3 font-bold text-emerald-100 transition hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Complete Now
            </button>
          ) : null}
        </div>

        {quickSession ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <p className="text-sm font-semibold text-slate-200">Quick Level Finder Progress</p>
            <p className="mt-1 text-xs text-slate-400">
              {quickSession.answered} of {quickSession.totalQuestions} answered
            </p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-cyan-400 transition-all"
                style={{
                  width: `${quickSession.totalQuestions > 0
                    ? Math.round((quickSession.answered / quickSession.totalQuestions) * 100)
                    : 0}%`,
                }}
              />
            </div>

            {quickSession.status === "in_progress" && quickSession.currentQuestion ? (
              <div className="mt-4 rounded-xl border border-cyan-400/25 bg-cyan-500/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Current question</p>
                <p className="mt-2 text-sm text-slate-200">Subject scope: {quickSession.currentQuestion.subject}</p>
                <p className="mt-1 text-xs text-slate-400">Question ID: {quickSession.currentQuestion.id}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void submitAnswer(true)}
                    disabled={submitting}
                    className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Mark Correct
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitAnswer(false)}
                    disabled={submitting}
                    className="rounded-xl bg-amber-300 px-4 py-2 text-sm font-bold text-amber-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Mark Incorrect
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {levels && Object.keys(levels).length > 0 ? (
          <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-50">
            <p className="font-bold">Placement Levels</p>
            <ul className="mt-2 space-y-1">
              {Object.entries(levels).map(([subject, level]) => (
                <li key={subject}>
                  {subject}: {level.level} ({level.accuracy}%)
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {summary ? (
          <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {summary}
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}
      </section>
    </main>
  );
}
