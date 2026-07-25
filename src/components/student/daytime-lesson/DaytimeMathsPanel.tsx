"use client";

import type { DaytimeStagePackExtras } from "@/lib/schools/daytime-lesson-ui";

type Props = {
  learningObjective?: string | null;
  explanation?: string | null;
  workedExamples?: DaytimeStagePackExtras["workedExamples"];
};

export default function DaytimeMathsPanel({ learningObjective, explanation, workedExamples }: Props) {
  return (
    <section
      data-testid="daytime-maths-panel"
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-600">Maths</p>
      {learningObjective ? (
        <div data-testid="daytime-maths-objective">
          <p className="text-xs font-semibold text-slate-500">Learning objective</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{learningObjective}</p>
        </div>
      ) : null}
      {explanation ? (
        <div data-testid="daytime-maths-explanation">
          <p className="text-xs font-semibold text-slate-500">Explanation</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{explanation}</p>
        </div>
      ) : null}
      {workedExamples?.length ? (
        <div data-testid="daytime-maths-worked-example" className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
          <p className="text-xs font-semibold text-indigo-700">Worked example</p>
          {workedExamples.slice(0, 1).map((example, index) => (
            <div key={`ex-${index}`} className="mt-2 space-y-1.5 text-sm text-slate-800">
              <p className="font-semibold">{example.question}</p>
              <ol className="list-decimal space-y-1 pl-5 text-slate-700">
                {example.steps.map((step, stepIndex) => (
                  <li key={`step-${stepIndex}`}>{step}</li>
                ))}
              </ol>
              {example.answer ? (
                <p className="pt-1 text-xs font-semibold text-indigo-800">Answer: {example.answer}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {!learningObjective && !explanation && !workedExamples?.length ? (
        <p className="text-sm text-slate-600">
          Read the question carefully, show your working, then check your answer. Ask the AI Tutor for a first step if you need help.
        </p>
      ) : null}
    </section>
  );
}
