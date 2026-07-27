"use client";

import { useState } from "react";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";

export type DaytimeTutorIntent =
  | "explain-question"
  | "explain-word"
  | "give-hint"
  | "show-first-step"
  | "why-wrong";

type TutorTurn = {
  intent: DaytimeTutorIntent;
  message: string;
  at: string;
};

type TutorApiResponse = {
  conversationId: string;
  source: "stored-help" | "openai" | "fallback";
  intent: DaytimeTutorIntent;
  message: string;
  hintLevel: number;
  revealsAnswer: boolean;
  canAskAgain: boolean;
  nextSuggestedIntents: DaytimeTutorIntent[];
  periodEndsAt: string;
  needsTeacher?: boolean;
  error?: string;
  code?: string;
  humanSupport?: {
    state?: string;
    summary?: string;
    wording?: {
      aiAvailable?: string;
      humanMayBeOffered?: string;
      notGuaranteed?: string;
      notPrivate?: string;
    };
  };
};

type Props = {
  periodId?: string;
  shortLearningBookingId?: string;
  shortLearningSessionId?: string;
  shortLearningBlockId?: string;
  assignmentId: string;
  contentId: string;
  questionId?: string;
  questionIndex?: number;
  studentAttempt?: string;
  className?: string;
  /** Premium daytime shell uses a light classroom theme. */
  variant?: "default" | "premium";
};

const ACTIONS: Array<{ intent: DaytimeTutorIntent; label: string; needsWord?: boolean }> = [
  { intent: "explain-question", label: "Explain this question" },
  { intent: "explain-word", label: "Explain a word", needsWord: true },
  { intent: "give-hint", label: "Give me a hint" },
  { intent: "show-first-step", label: "Show me the first step" },
  { intent: "why-wrong", label: "Why was my answer wrong?" },
];

function DaytimeTutorPanelInner({
  periodId,
  shortLearningBookingId,
  shortLearningSessionId,
  shortLearningBlockId,
  assignmentId,
  contentId,
  questionId,
  questionIndex,
  studentAttempt,
  variant = "default",
}: Omit<Props, "className">) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsTeacher, setNeedsTeacher] = useState(false);
  const [humanSupportSummary, setHumanSupportSummary] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [history, setHistory] = useState<TutorTurn[]>([]);
  const [word, setWord] = useState("");
  const [wordPromptOpen, setWordPromptOpen] = useState(false);
  const premium = variant === "premium";
  const isShortLearning = Boolean(shortLearningBookingId);

  async function ask(intent: DaytimeTutorIntent, wordValue?: string) {
    if (loading) return;
    if (!isShortLearning && !periodId) {
      setError("Tutor context is missing.");
      return;
    }
    setLoading(true);
    setError(null);
    setOpen(true);
    try {
      const response = await fetchWithRefreshRetry("/api/student/daytime-tutor", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isShortLearning
            ? {
                aiTutorScope: "short-learning",
                shortLearningBookingId,
                shortLearningSessionId,
                shortLearningBlockId,
                assignmentId,
                contentId,
                questionId,
                questionIndex,
                intent,
                word: wordValue?.trim() || undefined,
                studentAttempt: studentAttempt?.trim() || undefined,
                conversationId,
              }
            : {
                aiTutorScope: "daytime-school",
                periodId,
                assignmentId,
                contentId,
                questionId,
                questionIndex,
                intent,
                word: wordValue?.trim() || undefined,
                studentAttempt: studentAttempt?.trim() || undefined,
                conversationId,
              },
        ),
      });
      const payload = (await response.json().catch(() => ({}))) as TutorApiResponse;
      if (!response.ok) {
        setError(
          typeof payload.error === "string"
            ? payload.error
            : "I’m not able to explain this clearly enough. Please ask your teacher.",
        );
        if (payload.code === "PERIOD_ENDED" || payload.code === "BOOKING_WINDOW_CLOSED") {
          setNeedsTeacher(true);
        }
        return;
      }

      setConversationId(payload.conversationId);
      setHistory((current) => [
        ...current,
        {
          intent: payload.intent,
          message: payload.message,
          at: new Date().toISOString(),
        },
      ]);
      if (payload.needsTeacher) {
        setNeedsTeacher(true);
        setHumanSupportSummary(payload.humanSupport?.summary ?? payload.humanSupport?.state ?? null);
      }
    } catch {
      setError("I’m not able to explain this clearly enough. Please ask your teacher.");
      setNeedsTeacher(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div data-testid="daytime-tutor-panel" data-variant={variant} data-support-mode={isShortLearning ? "SHORT_LEARNING" : "DAY_SCHOOL"}>
      {!premium ? (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          {isShortLearning ? "Short Learning AI Tutor" : "School AI Tutor"}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((action) => (
          <button
            key={action.intent}
            type="button"
            disabled={loading || needsTeacher}
            onClick={() => {
              if (action.needsWord) {
                setWordPromptOpen(true);
                setOpen(true);
                return;
              }
              void ask(action.intent);
            }}
            className={
              premium
                ? "rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                : "rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
            }
          >
            {action.label}
          </button>
        ))}
      </div>

      {wordPromptOpen ? (
        <div
          className={
            premium
              ? "mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
              : "mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-slate-700 bg-slate-950/70 p-3"
          }
        >
          <label className={`min-w-[12rem] flex-1 text-xs ${premium ? "text-slate-600" : "text-slate-300"}`}>
            Which word should I explain?
            <input
              value={word}
              onChange={(event) => setWord(event.target.value)}
              className={
                premium
                  ? "mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
                  : "mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white"
              }
              placeholder="Type a word from the question or passage"
            />
          </label>
          <button
            type="button"
            disabled={loading || !word.trim()}
            onClick={() => {
              void ask("explain-word", word);
              setWordPromptOpen(false);
            }}
            className={
              premium
                ? "rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 disabled:opacity-50"
                : "rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100 disabled:opacity-50"
            }
          >
            Explain word
          </button>
        </div>
      ) : null}

      {open ? (
        <div
          className={
            premium
              ? "mt-3 space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800"
              : "mt-3 space-y-2 rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-100"
          }
        >
          {loading ? (
            <p className={`text-xs ${premium ? "text-slate-500" : "text-slate-400"}`} data-testid="daytime-tutor-loading">
              Thinking of a helpful next step…
            </p>
          ) : null}
          {history.map((turn, index) => (
            <div key={`${turn.at}-${index}`}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${premium ? "text-slate-500" : "text-slate-400"}`}>
                {ACTIONS.find((row) => row.intent === turn.intent)?.label ?? "Help"}
              </p>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed">{turn.message}</p>
            </div>
          ))}
          {error ? <p className={`text-sm ${premium ? "text-rose-700" : "text-rose-200"}`}>{error}</p> : null}
          {needsTeacher && !error ? (
            <div className={`space-y-1 text-xs ${premium ? "text-amber-800" : "text-amber-200"}`}>
              <p>You may need extra help with this question.</p>
              {isShortLearning ? (
                <>
                  <p>AI support is available throughout.</p>
                  <p>Human support may be offered when available. Human support is not guaranteed.</p>
                  <p>This is not a private one-to-one tutor booking.</p>
                  {humanSupportSummary === "ai-only" ? (
                    <p data-testid="short-learning-ai-only">Human support: AI only — continue with AI help.</p>
                  ) : null}
                </>
              ) : (
                <p>You may need help from your teacher with this question.</p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function DaytimeTutorPanel({
  periodId,
  shortLearningBookingId,
  shortLearningSessionId,
  shortLearningBlockId,
  assignmentId,
  contentId,
  questionId,
  questionIndex,
  studentAttempt,
  className,
  variant = "default",
}: Props) {
  const questionKey = `${shortLearningBookingId ?? periodId ?? ""}:${assignmentId}:${contentId}:${questionId ?? ""}:${questionIndex ?? ""}`;
  return (
    <div className={className}>
      <DaytimeTutorPanelInner
        key={questionKey}
        periodId={periodId}
        shortLearningBookingId={shortLearningBookingId}
        shortLearningSessionId={shortLearningSessionId}
        shortLearningBlockId={shortLearningBlockId}
        assignmentId={assignmentId}
        contentId={contentId}
        questionId={questionId}
        questionIndex={questionIndex}
        studentAttempt={studentAttempt}
        variant={variant}
      />
    </div>
  );
}
