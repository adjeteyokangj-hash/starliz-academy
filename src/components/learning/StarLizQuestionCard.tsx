"use client";

import type { QuestionVisualSupport } from "@/lib/starliz-question-formula";

export type StarLizQuestionCardProps = {
  /** Rendered subject badge element (e.g. <span className="…">Maths</span>) */
  subjectBadge: React.ReactNode;
  /** Current attempt number (1-based) */
  attemptNumber: number;
  /** Maximum allowed attempts (default 3) */
  maxAttempts?: number;
  /** Progress text shown next to attempt badge, e.g. "1/5" or "2/3 (Review)" */
  progressLabel: string;

  // ── Context labels ────────────────────────────────────────────────────────
  /** Short label above the question, e.g. "Maths — Year 4" */
  contextLabel?: string | null;
  /** Cyan banner shown when this question is being reviewed */
  reviewNotice?: string | null;

  // ── StarLiz formula scaffold ──────────────────────────────────────────────
  learningFocus?: string | null;
  keyInformation?: string[];
  /** Hint or formula shown before the student answers */
  hint?: string | null;
  /** Unit appended inside the text-input field, e.g. "A" for Amperes */
  unitReminder?: string | null;
  /** Diagram / formula card rendered from buildQuestionFormulaScaffold */
  visual?: QuestionVisualSupport | null;

  // ── Extra rendering slots ─────────────────────────────────────────────────
  /** Slot for intervention mission badges, bridge word notices, etc. */
  aboveQuestionSlot?: React.ReactNode;
  /** Rendered reading passage (with bridge word banner when present) */
  passageSlot?: React.ReactNode;
  /** Legacy visualRequired block rendered by the lesson page */
  visualRequiredSlot?: React.ReactNode;

  // ── Coach support ────────────────────────────────────────────────────────
  /** Visible coach button label for multiple-choice questions. */
  coachButtonLabel?: string;
  /** Whether the coach panel is currently expanded. */
  coachOpen?: boolean;
  /** Toggle handler for the coach panel. */
  onToggleCoach?: () => void;
  /** Panel content shown after the coach button is opened. */
  coachPanel?: React.ReactNode;

  // ── Question prompt ───────────────────────────────────────────────────────
  /** Rendered question heading (h2 text or JSX) */
  questionPrompt: React.ReactNode;
  /** Optional instruction below the heading, e.g. spelling stage guidance */
  questionInstruction?: React.ReactNode;
  /** Gentle-start notice shown for low-confidence students */
  gentleStartNotice?: React.ReactNode;

  // ── Answer area ───────────────────────────────────────────────────────────
  /**
   * Multiple-choice options. When provided the component renders tap-buttons.
   * For free-text questions leave undefined.
   */
  answerOptions?: string[];
  onSelectAnswer?: (option: string) => void;

  /** Controlled value for the free-text input */
  answerValue?: string;
  onAnswerChange?: (value: string) => void;
  onAnswerKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Label for the submit button (default "Submit") */
  actionButtonLabel?: string;
  onSubmit?: () => void;
  disabled?: boolean;
  submitting?: boolean;

  /**
   * Completely replaces the default answer area.
   * Use this for spelling speech-recognition controls.
   */
  customAnswerArea?: React.ReactNode;

  /**
   * Slot rendered below the answer area (e.g. "Repeat voice" button).
   */
  belowAnswerSlot?: React.ReactNode;

  // ── Feedback panel ────────────────────────────────────────────────────────
  feedback?: string | null;
  feedbackMode?: "none" | "continue" | "retry" | "skip_choice";
  isFinalWrong?: boolean;
  onContinue?: () => void;
  /** Label for the continue/retry button (auto-derived when omitted) */
  continueLabel?: string;
};

/**
 * StarLizQuestionCard
 *
 * Reusable question-card shell that implements the StarLiz question formula.
 * Renders: subject badge, attempt counter, learning focus, visual scaffold,
 * key information, hint, question prompt, answer area (options or text input),
 * and the tutor-feedback panel.
 *
 * Complex interactive areas (e.g. spelling speech-recognition) should be passed
 * via the `customAnswerArea` prop so the lesson-page retains its speech state.
 */
export default function StarLizQuestionCard({
  subjectBadge,
  attemptNumber,
  maxAttempts = 3,
  progressLabel,
  contextLabel,
  reviewNotice,
  learningFocus,
  keyInformation,
  hint,
  unitReminder,
  visual,
  aboveQuestionSlot,
  passageSlot,
  visualRequiredSlot,
  coachButtonLabel = "Coach me",
  coachOpen = false,
  onToggleCoach,
  coachPanel,
  questionPrompt,
  questionInstruction,
  gentleStartNotice,
  answerOptions,
  onSelectAnswer,
  answerValue = "",
  onAnswerChange,
  onAnswerKeyDown,
  actionButtonLabel = "Submit",
  onSubmit,
  disabled = false,
  submitting = false,
  customAnswerArea,
  belowAnswerSlot,
  feedback,
  feedbackMode,
  isFinalWrong = false,
  onContinue,
  continueLabel,
}: StarLizQuestionCardProps) {
  // Derive the continue button label when not explicitly provided.
  const resolvedContinueLabel =
    continueLabel ??
    (feedbackMode === "retry"
      ? "Try again"
      : isFinalWrong
        ? "Try a similar question"
        : "Continue");
    const submitDisabled = disabled || submitting || !onSubmit;

  return (
    <div className="rounded-3xl bg-slate-50 p-6">
      {/* ── Header row: subject badge + attempt counter ─────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {subjectBadge}
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-amber-800">
            Attempt {attemptNumber}/{maxAttempts}
          </span>
          <span className="text-sm font-bold text-slate-500">{progressLabel}</span>
        </div>
      </div>

      {/* ── Context label ───────────────────────────────────────────────── */}
      {contextLabel ? (
        <p className="mt-3 text-xs font-black uppercase tracking-[0.15em] text-indigo-700">
          {contextLabel}
        </p>
      ) : null}

      {/* ── Review notice ───────────────────────────────────────────────── */}
      {reviewNotice ? (
        <p className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm font-bold text-cyan-900">
          {reviewNotice}
        </p>
      ) : null}

      {/* ── Learning Focus ─────────────────────────────────────────────── */}
      {learningFocus ? (
        <div className="mt-4 rounded-3xl border border-sky-200 bg-sky-50 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">
            Learning Focus
          </p>
          <p className="mt-2 text-sm font-bold text-sky-950">{learningFocus}</p>
        </div>
      ) : null}

      {/* ── Extra slot (intervention badges, bridge word, etc.) ─────────── */}
      {aboveQuestionSlot}

      {/* ── Reading passage slot ────────────────────────────────────────── */}
      {passageSlot}

      {/* ── Legacy visual-required slot ─────────────────────────────────── */}
      {visualRequiredSlot}

      {/* ── Formula / diagram visual ────────────────────────────────────── */}
      {visual ? (
        <div className="mt-6 rounded-3xl border border-violet-200 bg-violet-50 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">
            {visual.title}
          </p>
          <div className="mt-3 rounded-2xl border border-violet-200 bg-white p-4">
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-sm font-bold text-violet-900">
              {visual.body.join("\n")}
            </pre>
          </div>
          <p className="mt-2 text-sm text-violet-800">{visual.altText}</p>
        </div>
      ) : null}

      {/* ── Question heading ────────────────────────────────────────────── */}
      <h2 className="mt-6 text-3xl font-black text-slate-950">{questionPrompt}</h2>

      {/* ── Optional instruction below heading ──────────────────────────── */}
      {questionInstruction ? (
        <div className="mt-3">{questionInstruction}</div>
      ) : null}

      {/* ── Gentle-start notice ─────────────────────────────────────────── */}
      {gentleStartNotice ? (
        <div className="mt-3">{gentleStartNotice}</div>
      ) : null}

      {/* ── Key information ─────────────────────────────────────────────── */}
      {keyInformation && keyInformation.length > 0 ? (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
            Key Information
          </p>
          <div className="mt-2 space-y-1 text-sm font-bold text-emerald-950">
            {keyInformation.map((line, lineIndex) => (
              <p key={`ki-${lineIndex}`}>{line}</p>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Hint / formula reminder ──────────────────────────────────────── */}
      {hint ? (
        <p className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">
          {hint}
        </p>
      ) : null}

      {onToggleCoach ? (
        <div className="mt-4 space-y-3">
          <button
            type="button"
            onClick={onToggleCoach}
            className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-black text-cyan-800 hover:bg-cyan-100"
          >
            {coachOpen ? "Hide coach steps" : coachButtonLabel}
          </button>
          {coachOpen && coachPanel ? coachPanel : null}
        </div>
      ) : null}

      {/* ── Answer area ─────────────────────────────────────────────────── */}
      {!feedback ? (
        <div className="mt-6 space-y-4">
          {customAnswerArea ? (
            customAnswerArea
          ) : answerOptions && answerOptions.length > 0 ? (
            /* Multiple-choice tap buttons */
            <div className="grid gap-3">
              {answerOptions.map((option, optionIndex) => (
                <button
                  key={`opt-${optionIndex}`}
                  type="button"
                  disabled={disabled || submitting}
                  onClick={() => onSelectAnswer?.(option)}
                  className="rounded-2xl bg-cyan-500 px-5 py-4 text-left font-black text-white hover:bg-cyan-400 disabled:opacity-60"
                >
                  {option}
                </button>
              ))}
            </div>
          ) : (
            /* Free-text input + submit */
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex min-w-0 flex-1 items-center rounded-2xl border border-slate-200 bg-white pr-4 focus-within:border-indigo-400">
                <input
                  value={answerValue}
                  onChange={(e) => onAnswerChange?.(e.target.value)}
                  onKeyDown={onAnswerKeyDown}
                  disabled={disabled || submitting}
                  className="min-w-0 flex-1 rounded-2xl px-5 py-4 text-lg outline-none disabled:bg-white"
                  placeholder="Type your answer"
                />
                {unitReminder ? (
                  <span className="text-sm font-black text-slate-500">{unitReminder}</span>
                ) : null}
              </div>
              <button
                type="button"
                disabled={submitDisabled}
                title={!onSubmit ? "Preview only - no submission action available" : undefined}
                onClick={onSubmit}
                className="rounded-2xl bg-indigo-600 px-6 py-4 font-black text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {submitting ? "Checking…" : actionButtonLabel}
              </button>
            </div>
          )}

          {/* Slot for "Repeat voice" button etc. */}
          {belowAnswerSlot}
        </div>
      ) : (
        /* ── Tutor feedback panel ─────────────────────────────────────── */
        <div className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-700">
            Tutor Feedback
          </p>
          <p className="whitespace-pre-line text-lg font-black">{feedback}</p>
          {onContinue ? (
            <button
              type="button"
              onClick={onContinue}
              className="mt-4 rounded-2xl bg-indigo-600 px-6 py-4 font-black text-white hover:bg-indigo-500"
            >
              {resolvedContinueLabel}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
