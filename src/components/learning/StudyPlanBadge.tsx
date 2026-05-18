"use client";

import type { StudyPlanProgress } from "@/lib/study-plan";

type StudyPlanBadgeProps = {
  progress: StudyPlanProgress;
  /** When true, renders a compact single-line badge. Default false. */
  compact?: boolean;
};

/**
 * StudyPlanBadge
 *
 * Shows the student's current position in the nine-stage StarLiz study plan.
 * Used on the student dashboard and in the lesson player.
 */
export default function StudyPlanBadge({ progress, compact = false }: StudyPlanBadgeProps) {
  const { currentStageLabel, currentPosition, totalStages, progressPercent, complete } = progress;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${
          complete
            ? "bg-emerald-100 text-emerald-700"
            : "bg-indigo-100 text-indigo-700"
        }`}
      >
        <span>
          {complete ? "✓" : `${currentPosition}/${totalStages}`}
        </span>
        <span>{currentStageLabel}</span>
      </span>
    );
  }

  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-600">
            Study Plan
          </p>
          <p className="mt-1 text-sm font-black text-indigo-950">
            Stage {currentPosition} of {totalStages} — {currentStageLabel}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${
            complete
              ? "bg-emerald-100 text-emerald-700"
              : progressPercent >= 66
                ? "bg-amber-100 text-amber-700"
                : "bg-indigo-100 text-indigo-700"
          }`}
        >
          {complete ? "Complete" : `${progressPercent}%`}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-indigo-100">
        <div
          className={`h-full rounded-full transition-all ${
            complete ? "bg-emerald-500" : "bg-indigo-500"
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Stage dots */}
      <div className="mt-3 flex justify-between">
        {Array.from({ length: totalStages }).map((_, index) => {
          const position = index + 1;
          const isDone = position < currentPosition;
          const isActive = position === currentPosition;
          return (
            <div
              key={position}
              className={`h-2 w-2 rounded-full ${
                isDone
                  ? "bg-indigo-400"
                  : isActive
                    ? "bg-indigo-700 ring-2 ring-indigo-300"
                    : "bg-indigo-100"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}
