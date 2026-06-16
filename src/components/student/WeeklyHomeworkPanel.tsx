"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import type { HomeworkBatchView } from "@/lib/homework-phase1b/service";
import {
  canSaveDraft,
  computeAnsweredCount,
  extractPromptText,
  homeworkStatusLabel,
  isSubmittable,
} from "@/lib/homework-phase1c/helpers";

// ─── API payload shapes ───────────────────────────────────────────────────────

type GatePayload = {
  ok?: boolean;
  featureEnabled?: boolean;
  code?: string;
  reason?: string;
  homework?: HomeworkBatchView | null;
  error?: string;
};

type CurrentPayload = {
  ok?: boolean;
  homework?: HomeworkBatchView | null;
  error?: string;
};

type DraftPayload = {
  ok?: boolean;
  homework?: HomeworkBatchView;
  error?: string;
};

type SubmitPayload = {
  ok?: boolean;
  homework?: HomeworkBatchView;
  error?: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function WeeklyHomeworkPanel() {
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null);
  const [batch, setBatch] = useState<HomeworkBatchView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [localAnswers, setLocalAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [draftPendingId, setDraftPendingId] = useState<string | null>(null);

  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const loadHomework = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const gateRes = await fetchWithRefreshRetry(
        "/api/student/weekly-homework/gate?surface=homework",
        { credentials: "include" },
      );
      const gatePayload = (await gateRes.json()) as GatePayload;

      if (!gatePayload.featureEnabled) {
        setFeatureEnabled(false);
        return;
      }
      setFeatureEnabled(true);

      if (gatePayload.homework !== undefined) {
        setBatch(gatePayload.homework ?? null);
        return;
      }

      const currentRes = await fetchWithRefreshRetry(
        "/api/student/weekly-homework/current",
        { credentials: "include" },
      );
      const currentPayload = (await currentRes.json()) as CurrentPayload;
      setBatch(currentPayload.homework ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load weekly homework.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadHomework();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadHomework]);

  function handleAnswerChange(questionId: string, value: string) {
    setLocalAnswers((prev) => ({ ...prev, [questionId]: value }));

    if (debounceRef.current[questionId]) {
      clearTimeout(debounceRef.current[questionId]);
    }
    if (!batch) return;
    debounceRef.current[questionId] = setTimeout(() => {
      void saveDraft(batch.id, questionId, value);
    }, 800);
  }

  async function saveDraft(batchId: string, questionId: string, answer: string) {
    setDraftPendingId(questionId);
    try {
      const res = await fetchWithRefreshRetry("/api/student/weekly-homework/draft", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, questionId, answer }),
      });
      const payload = (await res.json()) as DraftPayload;
      if (payload.homework) {
        setBatch(payload.homework);
      }
    } catch {
      // Silent — draft save failure should not interrupt the user's input flow.
    } finally {
      setDraftPendingId(null);
    }
  }

  async function handleSubmit() {
    if (!batch || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetchWithRefreshRetry("/api/student/weekly-homework/submit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: batch.id }),
      });
      const payload = (await res.json()) as SubmitPayload;
      if (!res.ok) {
        throw new Error((payload as { error?: string }).error ?? "Unable to submit homework.");
      }
      if (payload.homework) {
        setBatch(payload.homework);
      }
      setJustSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Unable to submit.");
    } finally {
      setSubmitting(false);
    }
  }

  // Render nothing if flag is disabled or not yet known (avoids flash)
  if (featureEnabled === null && !loading) return null;
  if (featureEnabled === false) return null;

  if (loading) {
    return (
      <section id="weekly-homework-batch" className="mb-6 rounded-3xl border border-violet-200 bg-violet-50/70 p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Weekly Homework</p>
        <div className="mt-3 space-y-3">
          <div className="h-4 w-48 animate-pulse rounded bg-violet-200" />
          <div className="h-16 animate-pulse rounded-2xl bg-violet-100" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section id="weekly-homework-batch" className="mb-6 rounded-3xl border border-rose-200 bg-rose-50/70 p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-700">Weekly Homework</p>
        <p className="mt-2 text-sm text-rose-700">{error}</p>
        <button
          type="button"
          onClick={() => void loadHomework()}
          className="mt-3 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500"
        >
          Retry
        </button>
      </section>
    );
  }

  if (!batch) {
    return (
      <section id="weekly-homework-batch" className="mb-6 rounded-3xl border border-violet-200 bg-violet-50/70 p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Weekly Homework</p>
        <div className="mt-3 rounded-2xl border border-violet-200 bg-white/70 p-4 text-sm text-violet-900">
          No weekly homework ready yet.
        </div>
      </section>
    );
  }

  const isFinished =
    batch.status === "SUBMITTED" ||
    batch.status === "MARKED" ||
    batch.status === "COMPLETED" ||
    batch.status === "REVIEW_NEEDED";

  const isExcused =
    batch.status === "EXCUSED" ||
    batch.status === "OVERRIDDEN" ||
    batch.status === "CANCELLED";

  // Merge local textarea values into questions for display / answer-count purposes
  const mergedQuestions = batch.questions.map((q) => ({
    ...q,
    answer: {
      ...q.answer,
      draftAnswer: localAnswers[q.id] !== undefined ? localAnswers[q.id] : q.answer.draftAnswer,
    },
  }));

  const answeredCount = computeAnsweredCount(mergedQuestions);
  const canSubmit = isSubmittable(batch, localAnswers) && !submitting;

  return (
    <section id="weekly-homework-batch" className="mb-6 rounded-3xl border border-violet-200 bg-violet-50/70 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Weekly Homework</p>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
            isFinished
              ? "bg-emerald-100 text-emerald-700"
              : isExcused
                ? "bg-slate-100 text-slate-600"
                : batch.status === "OVERDUE"
                  ? "bg-rose-100 text-rose-700"
                  : "bg-violet-100 text-violet-700"
          }`}
        >
          {homeworkStatusLabel(batch.status)}
        </span>
      </div>

      <p className="mt-1 text-xs text-violet-800">
        Week of{" "}
        {new Date(batch.weekStart).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        })}
        {" — "}
        {answeredCount} / {batch.questions.length} question
        {batch.questions.length === 1 ? "" : "s"} answered
      </p>

      {justSubmitted && isFinished ? (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-semibold">Homework submitted!</p>
          <p className="mt-1">
            {batch.markingSummary?.feedback ?? (batch.status === "REVIEW_NEEDED"
              ? "Some answers need review before your full result is ready."
              : "Your result is ready below.")}
          </p>
        </div>
      ) : isExcused ? (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-700">
          {batch.excusedReason
            ? `Excused: ${batch.excusedReason}`
            : batch.overrideReason
              ? `Note: ${batch.overrideReason}`
              : "This week has been excused."}
        </div>
      ) : isFinished ? (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-white p-4 text-sm text-slate-700">
          <p className="font-semibold text-emerald-800">
            {batch.status === "SUBMITTED" ? "Submitted — awaiting marking" : "Homework result"}
          </p>
          {batch.scorePercent !== null ? (
            <p className="mt-1 text-lg font-black text-slate-900">{batch.scorePercent}% score</p>
          ) : null}
          {batch.markingSummary ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
                Outcome: {batch.markingSummary.outcomeBand.replaceAll("_", " ")}
              </p>
              <p>{batch.markingSummary.feedback}</p>
              <p className="text-xs text-slate-600">
                Correct: {batch.markingSummary.correctCount} • Incorrect: {batch.markingSummary.incorrectCount} • Review needed: {batch.markingSummary.reviewNeededCount}
              </p>
              {batch.markingSummary.weakAreas.length > 0 ? (
                <p className="text-xs text-slate-600">
                  Focus next on: {batch.markingSummary.weakAreas.slice(0, 3).join(", ")}
                </p>
              ) : null}
              {batch.recapOnly ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  Recap and catch-up are unlocked before your next normal progression step.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {mergedQuestions.map((question, idx) => {
            const localVal =
              typeof question.answer.draftAnswer === "string"
                ? question.answer.draftAnswer
                : "";
            const promptText = extractPromptText(question.prompt, `Question ${idx + 1}`);
            const isSaving = draftPendingId === question.id;
            const locked = !canSaveDraft(batch.status);

            return (
              <div key={question.id} className="rounded-2xl border border-violet-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {idx + 1}. {promptText}
                  </p>
                  {question.required ? (
                    <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                      Required
                    </span>
                  ) : null}
                </div>

                {question.subject || question.topic ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {question.subject}
                    {question.topic ? ` — ${question.topic}` : ""}
                    {question.estimatedMinutes > 0
                      ? ` • ~${question.estimatedMinutes} min`
                      : ""}
                  </p>
                ) : null}

                {locked || question.answer.isAnswered ? (
                  <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">
                    {typeof question.answer.submittedAnswer === "string"
                      ? question.answer.submittedAnswer
                      : localVal || "Answer saved"}
                  </p>
                ) : (
                  <div className="mt-2">
                    <textarea
                      rows={3}
                      value={localVal}
                      onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                      placeholder="Type your answer here..."
                      className="w-full rounded-xl border border-violet-200 bg-violet-50/40 p-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-300"
                    />
                    {isSaving ? (
                      <p className="mt-1 text-xs text-violet-500">Saving draft...</p>
                    ) : localVal ? (
                      <p className="mt-1 text-xs text-emerald-600">Draft saved</p>
                    ) : null}
                  </div>
                )}

                {question.answer.isCorrect !== null ? (
                  <div
                    className={`mt-2 rounded-lg px-2 py-1 text-xs font-bold ${
                      question.answer.isCorrect
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {question.answer.isCorrect ? "Correct" : "Incorrect"}
                    {question.answer.score !== null ? ` — ${question.answer.score} pts` : ""}
                  </div>
                ) : null}
              </div>
            );
          })}

          {submitError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {submitError}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-violet-700">
              {answeredCount} /{" "}
              {batch.questions.filter((q) => q.required).length} required answered
            </p>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void handleSubmit()}
              className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-bold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Homework"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
