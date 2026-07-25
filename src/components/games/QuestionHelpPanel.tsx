"use client";

import { useMemo, useState } from "react";
import {
  buildStoredQuestionHelpSteps,
  type StoredQuestionHelp,
} from "@/lib/schools/question-help";

type Props = {
  help: StoredQuestionHelp;
  className?: string;
};

/** Pupil-facing progressive help using stored hints/breakdown (no answer on first tap). */
export default function QuestionHelpPanel({ help, className }: Props) {
  const steps = useMemo(() => buildStoredQuestionHelpSteps(help), [help]);
  const [shown, setShown] = useState(0);
  const [open, setOpen] = useState(false);
  const visible = open ? steps.slice(0, Math.max(1, shown)) : [];

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setShown((value) => (value < 1 ? 1 : value));
          }}
          className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100"
        >
          I don’t understand
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setShown((value) => Math.min(steps.length, Math.max(1, value + 1)));
          }}
          className="rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-100"
        >
          Explain this question
        </button>
      </div>
      {open && visible.length ? (
        <div className="mt-3 space-y-2 rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-100">
          {visible.map((step) => (
            <div key={`${step.level}-${step.title}`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                {step.title}
                {step.revealsAnswer ? " · full explanation" : ""}
              </p>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed">{step.body}</p>
            </div>
          ))}
          {shown < steps.length ? (
            <button
              type="button"
              onClick={() => setShown((value) => Math.min(steps.length, value + 1))}
              className="text-xs font-semibold text-sky-300 underline-offset-2 hover:underline"
            >
              Another hint
            </button>
          ) : (
            <p className="text-xs text-slate-400">Try the question again with these steps.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
