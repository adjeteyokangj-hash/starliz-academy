"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type QuickQuestion = {
  id: string;
  subject: string;
  strand?: string | null;
  topic?: string | null;
  prompt?: string | null;
  choices?: string[];
  correctIndex?: number | null;
  difficulty?: number | null;
  yearGroup?: string | null;
  keyStage?: string | null;
};

type QuickSession = {
  sessionId: string;
  status: "in_progress" | "completed";
  answered: number;
  totalQuestions: number;
  currentQuestion: QuickQuestion | null;
  questionPreview?: QuickQuestion[];
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
  const [quickSession, setQuickSession] = useState<QuickSession | null>(null);
  const [levels, setLevels] = useState<Record<string, QuickLevel> | null>(null);

  const BLOCKED_PHRASES = [
    "Subject check",
    "Which answer is most accurate for this topic",
    "The evidence-based answer",
    "The answer with the longest sentence",
    "The answer with unusual punctuation",
    "The first answer shown",
  ];

  function questionLooksInvalid(q: QuickQuestion | null | undefined): boolean {
    if (!q) return false;
    const texts = [q.topic ?? "", q.prompt ?? "", ...(q.choices ?? [])];
    return texts.some((t) => BLOCKED_PHRASES.some((phrase) => t.toLowerCase().includes(phrase.toLowerCase())));
  }

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
      if (payload.session.status === "completed") {
        await hydrateLevels();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start Quick Level Finder.");
    } finally {
      setStarting(false);
    }
  }

  async function submitAnswer(selectedIndex: number) {
    if (!quickSession?.currentQuestion) return;
    setSubmitting(true);
    setError(null);
    const correct = selectedIndex === (quickSession.currentQuestion.correctIndex ?? 0);
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
        if (payload.levels) {
          setLevels(payload.levels);
        } else {
          await hydrateLevels();
        }
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
          We run a short Level Finder based on your year group to quickly place you at the right learning level.
        </p>

        <ol className="mt-5 space-y-2 text-sm text-slate-200">
          <li>1. Year 1-6: Maths, Reading, Spelling • Year 7-11: Maths, English, Science</li>
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
              questionLooksInvalid(quickSession.currentQuestion) ? (
                <div className="mt-4 rounded-xl border border-cyan-400/25 bg-cyan-500/5 p-4">
                  <p className="text-sm text-slate-200">We&apos;re getting your next question ready.</p>
                  <button
                    type="button"
                    onClick={() => void startLevelFinder(false)}
                    className="mt-2 rounded-lg border border-cyan-300/30 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/10"
                  >
                    Refresh
                  </button>
                </div>
              ) : (
              <div className="mt-4 rounded-xl border border-cyan-400/25 bg-cyan-500/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Current question</p>
                <p className="mt-2 text-sm text-slate-200">Subject scope: {quickSession.currentQuestion.subject}</p>
                {quickSession.currentQuestion.topic ? (
                  <p className="mt-1 text-sm font-medium text-cyan-100">Topic: {quickSession.currentQuestion.topic}</p>
                ) : null}
                {quickSession.currentQuestion.prompt ? (
                  <p className="mt-3 rounded-lg border border-white/10 bg-slate-950/40 px-4 py-3 text-sm leading-6 text-slate-100">
                    {quickSession.currentQuestion.prompt}
                  </p>
                ) : null}
                {quickSession.questionPreview && quickSession.questionPreview.length > 1 ? (
                  <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/40 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">Question set preview</p>
                    <ul className="mt-3 space-y-2 text-sm text-slate-100">
                      {quickSession.questionPreview.slice(0, 3).map((question, index) => (
                        <li key={question.id} className="rounded-md border border-white/5 bg-white/5 px-3 py-2">
                          <span className="font-semibold text-cyan-200">Q{index + 1}.</span>{" "}
                          <span>{question.topic ?? question.subject}</span>
                          {question.prompt ? <span className="block text-xs text-slate-400">{question.prompt}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Choose your answer</p>
                  {(quickSession.currentQuestion.choices && quickSession.currentQuestion.choices.length > 0
                    ? quickSession.currentQuestion.choices
                    : [
                      "This option best answers the question.",
                      "This option is partly related but incomplete.",
                      "This option is not supported by the question.",
                      "This option is incorrect for this topic.",
                    ]
                  ).map((choice, index) => (
                    <button
                      key={`${quickSession.currentQuestion?.id ?? "q"}-choice-${index}`}
                      type="button"
                      onClick={() => void submitAnswer(index)}
                      disabled={submitting}
                      className="w-full rounded-xl border border-cyan-300/30 bg-slate-900/60 px-4 py-3 text-left text-sm text-slate-100 transition hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="font-semibold text-cyan-200">{String.fromCharCode(65 + index)}.</span>{" "}
                      <span>{choice}</span>
                    </button>
                  ))}
                </div>
              </div>
              )
            ) : null}
          </div>
        ) : null}

        {levels && Object.keys(levels).length > 0 ? (
          <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-50">
            <p className="font-black">Quick Level Finder complete</p>
            <p className="mt-1 text-emerald-100">
              Review your placement results below, then continue to your dashboard when you are ready.
            </p>
            <p className="font-bold">Placement Levels</p>
            <ul className="mt-2 space-y-1">
              {Object.entries(levels).map(([subject, level]) => (
                <li key={subject}>
                  {subject}: {level.level} ({level.accuracy}%)
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => router.push("/student/dashboard?refresh=1")}
              className="mt-4 rounded-xl bg-emerald-300 px-4 py-2 font-black text-slate-950 transition hover:bg-emerald-200"
            >
              Continue to dashboard
            </button>
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
