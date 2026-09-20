"use client";

import type { ShortLearningTeachingMoment } from "@/lib/schools/short-learning-classroom";

type Props = {
  subjectLabel?: string | null;
  title?: string | null;
  teaching: ShortLearningTeachingMoment;
  onStartPractice: () => void;
};

export default function ShortLearningTeachMoment({
  subjectLabel,
  title,
  teaching,
  onStartPractice,
}: Props) {
  return (
    <section
      data-testid="short-learning-teach-moment"
      className="space-y-5 rounded-3xl border border-violet-200 bg-white p-6 shadow-sm"
    >
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700">Teach first</p>
        <h2 className="mt-1 text-2xl font-black text-slate-900">
          {title?.trim() || "Today's lesson"}
        </h2>
        {subjectLabel ? (
          <p className="mt-1 text-sm font-semibold text-violet-800">{subjectLabel}</p>
        ) : null}
      </div>

      {teaching.learningObjective ? (
        <div data-testid="short-learning-teach-objective" className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-indigo-700">Learning aim</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{teaching.learningObjective}</p>
        </div>
      ) : null}

      {teaching.priorLearning ? (
        <div data-testid="short-learning-teach-warmup">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Warm up</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{teaching.priorLearning}</p>
        </div>
      ) : null}

      {teaching.explanation ? (
        <div data-testid="short-learning-teach-explanation">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Explanation</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-800">{teaching.explanation}</p>
        </div>
      ) : null}

      {teaching.workedExamples.length ? (
        <div className="space-y-3" data-testid="short-learning-teach-examples">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-indigo-700">Worked example</p>
          {teaching.workedExamples.slice(0, 2).map((example, index) => (
            <div
              key={`example-${index}`}
              className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4"
              data-testid="short-learning-worked-example"
            >
              <p className="font-semibold text-slate-900">{example.question}</p>
              {example.steps.length ? (
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
                  {example.steps.map((step, stepIndex) => (
                    <li key={`step-${index}-${stepIndex}`}>{step}</li>
                  ))}
                </ol>
              ) : null}
              {example.answer ? (
                <p className="mt-2 text-sm font-semibold text-indigo-900">Answer: {example.answer}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {teaching.misconceptions.length ? (
        <div data-testid="short-learning-teach-misconceptions" className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-800">Watch out</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-950">
            {teaching.misconceptions.slice(0, 3).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {teaching.reflectionCheck ? (
        <p className="text-sm italic text-slate-600">{teaching.reflectionCheck}</p>
      ) : null}

      <button
        type="button"
        data-testid="short-learning-start-practice"
        onClick={onStartPractice}
        className="w-full rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white hover:bg-violet-600"
      >
        Start practice
      </button>
    </section>
  );
}
