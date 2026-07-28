"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type StagePreview = {
  id: string;
  contentType: string;
  topic: string;
  status: string;
  itemCount: number;
  estimatedMinutes: number;
  stage: string;
  stageLabel: string;
  preview: {
    headline: string | null;
    body: string | null;
    items: string[];
  };
};

type MachineHealth = {
  overall: "PASS" | "FAIL";
  checks: Array<{ id: string; label: string; passed: boolean; detail?: string }>;
  reason: string | null;
  regenerateHint: string | null;
  periodMinutes: number;
  totalEstimatedMinutes: number;
  stageCount: number;
  weekDiversity?: {
    weekStart: string;
    passage: string;
    vocabularyOverlap: string;
    questionOverlap: string;
    workedExamples: string;
    scenarios: string;
    blocked: boolean;
    blockedReason: string | null;
    comparedAgainst: string[];
  } | null;
};

export type LessonReviewModalLesson = {
  id: string;
  title: string;
  subject: string;
  startsAt: string;
  endsAt: string;
  skillFocus: string | null;
  playableSession: {
    stages: StagePreview[];
    totalEstimatedMinutes: number;
    periodMinutes: number;
  } | null;
  lessonReview: {
    reviewStatus: "draft" | "machine_failed" | "awaiting_review" | "approved";
    teacherReviewedAt: string | null;
    machineHealth: MachineHealth | null;
  } | null;
};

type Props = {
  lesson: LessonReviewModalLesson;
  busy: boolean;
  onClose: () => void;
  onApprove: () => void;
  onRegenerate: (reason: string, options?: { allowWeeklyReview?: boolean }) => void;
  /** School Portal must not deep-link into platform Content Library admin. */
  hideContentLibrary?: boolean;
};

const REGENERATE_REASONS = [
  "Missing passage",
  "Not enough work",
  "Questions too repetitive",
  "Wrong subject format",
  "Too difficult",
  "Too easy",
  "Answers incorrect",
  "Poor wording",
  "Other",
] as const;

export default function LessonReviewModal({
  lesson,
  busy,
  onClose,
  onApprove,
  onRegenerate,
  hideContentLibrary = false,
}: Props) {
  const stages = lesson.playableSession?.stages ?? [];
  const [stageIndex, setStageIndex] = useState(0);
  const [regenerateReason, setRegenerateReason] = useState<string>(REGENERATE_REASONS[0]);
  const [allowWeeklyReview, setAllowWeeklyReview] = useState(false);
  const current = stages[Math.min(stageIndex, Math.max(0, stages.length - 1))] ?? null;
  const review = lesson.lessonReview;
  const health = review?.machineHealth ?? null;
  const machinePass = health?.overall === "PASS" || review?.reviewStatus === "awaiting_review" || review?.reviewStatus === "approved";
  const canApprove = Boolean(machinePass && review?.reviewStatus !== "approved" && stages.length);

  const teacherLabel = useMemo(() => {
    if (review?.reviewStatus === "approved") return "Approved";
    if (review?.reviewStatus === "machine_failed") return "Blocked — machine failed";
    if (review?.reviewStatus === "awaiting_review") return "Pending";
    return "Draft";
  }, [review?.reviewStatus]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-6">
      <button type="button" aria-label="Close lesson review" className="absolute inset-0 cursor-default" onClick={() => { if (!busy) onClose(); }} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
        <header className="border-b border-slate-800 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Lesson review</p>
          <h2 className="mt-1 text-xl font-bold text-white">
            {lesson.startsAt}–{lesson.endsAt} · {lesson.title}
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            {lesson.subject}
            {lesson.skillFocus ? ` · ${lesson.skillFocus}` : ""}
            {lesson.playableSession
              ? ` · ~${lesson.playableSession.totalEstimatedMinutes}m / ${lesson.playableSession.periodMinutes}m period`
              : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className={`rounded-md border px-2 py-1 font-semibold ${machinePass ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100" : "border-rose-500/40 bg-rose-500/15 text-rose-100"}`}>
              Machine Review · {health?.overall ?? (machinePass ? "PASS" : "FAIL")}
            </span>
            <span className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 font-semibold text-slate-200">
              Teacher Review · {teacherLabel}
            </span>
          </div>
        </header>

        <div className="grid gap-4 overflow-y-auto px-5 py-4 md:grid-cols-[14rem_1fr]">
          <aside className="space-y-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Lesson Health</p>
              {health ? (
                <ul className="mt-2 space-y-1.5 text-xs">
                  {health.checks.map((check) => (
                    <li key={check.id} className={check.passed ? "text-emerald-200" : "text-rose-200"}>
                      {check.passed ? "✔" : "✖"} {check.label}
                      {check.detail ? <span className="block pl-4 text-[10px] text-slate-400">{check.detail}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-slate-400">Generate lesson content to run Lesson Health.</p>
              )}
              {health?.overall === "FAIL" && health.reason ? (
                <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-2 text-xs text-rose-100">
                  {health.reason}
                </p>
              ) : null}
            </div>
            {health?.weekDiversity ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Week diversity</p>
                {health.weekDiversity.blocked && health.weekDiversity.blockedReason ? (
                  <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-xs text-amber-100">
                    {health.weekDiversity.blockedReason}
                  </p>
                ) : null}
                <ul className="mt-2 space-y-1 text-xs text-slate-200">
                  <li>Passage: {health.weekDiversity.passage}</li>
                  <li>Vocabulary overlap: {health.weekDiversity.vocabularyOverlap}</li>
                  <li>Question overlap: {health.weekDiversity.questionOverlap}</li>
                  <li>Worked examples: {health.weekDiversity.workedExamples}</li>
                  <li>Scenarios: {health.weekDiversity.scenarios}</li>
                </ul>
                {health.weekDiversity.comparedAgainst?.length ? (
                  <p className="mt-2 text-[10px] text-slate-400">
                    Compared with: {health.weekDiversity.comparedAgainst.join("; ")}
                  </p>
                ) : (
                  <p className="mt-2 text-[10px] text-slate-500">First pack this week for this class/subject.</p>
                )}
              </div>
            ) : null}
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Stages</p>
              <ul className="mt-2 space-y-1">
                {stages.map((stage, index) => (
                  <li key={stage.id}>
                    <button
                      type="button"
                      onClick={() => setStageIndex(index)}
                      className={`w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold ${
                        index === stageIndex
                          ? "bg-sky-500/20 text-sky-100"
                          : "text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {stage.stageLabel} · {stage.estimatedMinutes}m
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            {current ? (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {current.stageLabel}
                </p>
                <h3 className="mt-1 text-lg font-bold text-white">
                  {current.preview.headline || current.topic || current.stageLabel}
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  {current.contentType} · {current.itemCount} items · {current.estimatedMinutes} min · {current.status}
                </p>
                {current.preview.body ? (
                  <div className="mt-4 whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-950/80 p-3 text-sm leading-relaxed text-slate-200">
                    {current.preview.body}
                  </div>
                ) : (
                  <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    No passage / explanation preview for this stage yet.
                  </p>
                )}
                {current.preview.items.length ? (
                  <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-200">
                    {current.preview.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-4 text-sm text-slate-400">No skim items for this stage.</p>
                )}
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={stageIndex <= 0}
                    onClick={() => setStageIndex((value) => Math.max(0, value - 1))}
                    className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={stageIndex >= stages.length - 1}
                    onClick={() => setStageIndex((value) => Math.min(stages.length - 1, value + 1))}
                    className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 disabled:opacity-40"
                  >
                    Next stage
                  </button>
                  {stageIndex >= stages.length - 1 ? (
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-md border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-100"
                    >
                      Finish preview
                    </button>
                  ) : null}
                  {hideContentLibrary ? null : (
                    <Link
                      href={`/admin/content-library?view=${encodeURIComponent(current.id)}`}
                      className="rounded-md border border-violet-500/40 px-3 py-1.5 text-xs font-semibold text-violet-100 hover:bg-violet-500/15"
                    >
                      Edit stage in Content Library
                    </Link>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">No playable stages linked yet. Generate lesson content first.</p>
            )}
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-md border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-50"
          >
            Close
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <span className="sr-only">Regeneration reason</span>
              <select
                value={regenerateReason}
                disabled={busy}
                onChange={(event) => setRegenerateReason(event.target.value)}
                className="rounded-md border border-slate-600 bg-slate-900 px-2 py-2 text-xs text-slate-100"
              >
                {REGENERATE_REASONS.map((reason) => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={allowWeeklyReview}
                disabled={busy}
                onChange={(event) => setAllowWeeklyReview(event.target.checked)}
                className="rounded border-slate-600"
              />
              Intentional review lesson
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => onRegenerate(regenerateReason, { allowWeeklyReview })}
              className="rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-100 disabled:opacity-50"
            >
              {busy ? "Working…" : "Needs regeneration"}
            </button>
            <button
              type="button"
              disabled={busy || !canApprove}
              onClick={onApprove}
              className="rounded-md border border-emerald-400/50 bg-emerald-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
              title={!machinePass ? "Machine Lesson Health must PASS before approve" : undefined}
            >
              {review?.reviewStatus === "approved" ? "Approved" : busy ? "Approving…" : "Approve lesson"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
