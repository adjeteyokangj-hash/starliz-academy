"use client";

import { useEffect, useState } from "react";
import type { DaytimeStagePackExtras } from "@/lib/schools/daytime-lesson-ui";

type Props = {
  title?: string | null;
  explanation?: string | null;
  scenarioOrObservation?: string | null;
  activities?: DaytimeStagePackExtras["activities"];
  onComplete?: () => void;
};

function humanizeActivityKind(kind: string): string {
  const key = kind.trim().toLowerCase();
  const labels: Record<string, string> = {
    "teacher-explanation": "Teacher explanation",
    practical: "Practical activity",
    fluency: "Fluency practice",
    "word-sort": "Word sort",
    dictation: "Dictation",
    challenge: "Challenge",
    reflection: "Reflection",
    drill: "Drill",
    "warm-up": "Warm-up",
    warmup: "Warm-up",
  };
  if (labels[key]) return labels[key];
  return kind
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function DaytimePracticalPanel({
  title,
  explanation,
  scenarioOrObservation,
  activities,
  onComplete,
}: Props) {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <section
      data-testid="daytime-practical-panel"
      className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm"
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">PE / Practical</p>
      {title ? <h2 className="text-lg font-bold text-slate-900">{title}</h2> : null}
      {explanation ? (
        <div>
          <p className="text-xs font-semibold text-slate-500">Activity instructions</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{explanation}</p>
        </div>
      ) : null}
      {scenarioOrObservation ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2" data-testid="daytime-practical-safety">
          <p className="text-xs font-semibold text-amber-800">Safety reminders</p>
          <p className="mt-1 text-sm text-amber-950">{scenarioOrObservation}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-3 py-3">
        <p className="font-mono text-2xl font-bold tabular-nums text-slate-900" data-testid="daytime-practical-timer">
          {minutes}:{String(secs).padStart(2, "0")}
        </p>
        <button
          type="button"
          onClick={() => setRunning((value) => !value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800"
        >
          {running ? "Pause timer" : "Start timer"}
        </button>
        <button
          type="button"
          onClick={() => {
            setRunning(false);
            setSeconds(0);
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800"
        >
          Reset
        </button>
      </div>

      {activities?.length ? (
        <ol className="space-y-2" data-testid="daytime-practical-drills">
          {activities.map((activity, index) => (
            <li
              key={`${activity.kind}-${index}`}
              className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm"
            >
              <span className="font-bold text-slate-500">{index + 1}.</span>{" "}
              <span className="font-semibold text-slate-900">
                {activity.title || humanizeActivityKind(activity.kind)}
              </span>
              {activity.estimatedMinutes ? (
                <span className="ml-2 text-xs text-slate-500">~{activity.estimatedMinutes} min</span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {onComplete ? (
        <button
          type="button"
          onClick={onComplete}
          className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
        >
          Mark activity complete
        </button>
      ) : null}
    </section>
  );
}
