"use client";

import type { StudentAssignmentCandidate } from "./types";

type Props = {
  title: string;
  tone: "recommended" | "eligible" | "blocked";
  candidates: StudentAssignmentCandidate[];
  selectedStudentId: string | null;
  onSelectStudent: (id: string) => void;
  onViewHistory?: (candidate: StudentAssignmentCandidate) => void;
  disabled?: boolean;
};

function formatDateShort(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export default function StudentAssignmentColumn({ title, tone, candidates, selectedStudentId, onSelectStudent, onViewHistory, disabled }: Props) {
  const toneClasses = tone === "recommended"
    ? "border-emerald-500/40"
    : tone === "eligible"
      ? "border-sky-500/30"
      : "border-rose-500/30";

  return (
    <div className={`rounded-2xl border ${toneClasses} bg-slate-950/60 p-3`}>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-300">{title}</p>
      <div className="mt-2 space-y-2">
        {candidates.length === 0 ? <p className="text-xs text-slate-500">No students</p> : null}
        {candidates.map((entry) => (
          <div
            key={entry.student.id}
            className={`rounded-xl border px-3 py-2 ${selectedStudentId === entry.student.id ? "border-indigo-400 bg-indigo-500/10" : "border-slate-800 bg-slate-900/70"}`}
          >
            {entry.student.contentAssignment?.badges?.length ? (
              <div className="mb-2 flex flex-wrap gap-1">
                {entry.student.contentAssignment.badges.map((badge) => {
                  const toneClass = badge.includes("Active")
                    ? "border-rose-400/40 bg-rose-500/10 text-rose-100"
                    : badge.includes("Completed")
                      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                      : badge.includes("Assigned Before")
                        ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
                        : "border-slate-600/60 bg-slate-800/70 text-slate-200";
                  return (
                    <span key={`${entry.student.id}-${badge}`} className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${toneClass}`}>
                      {badge}
                    </span>
                  );
                })}
              </div>
            ) : null}
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                disabled={disabled || !entry.hardEligible}
                onClick={() => onSelectStudent(entry.student.id)}
                className="flex-1 text-left disabled:cursor-not-allowed"
              >
                <p className="text-sm font-bold text-slate-100">{entry.student.name}</p>
                <p className="text-xs text-slate-400">{entry.student.yearGroup || "No year"} | {entry.student.keyStageLevel || "No key stage"}</p>
                {entry.warningReason ? (
                  <p className="mt-1 inline-flex rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-200">
                    Warning: placement override
                  </p>
                ) : null}
                {tone === "recommended" ? (
                  <p className="mt-1 text-xs text-emerald-200">{entry.recommendationReason}</p>
                ) : null}
                {tone === "eligible" ? (
                  <>
                    <p className="mt-1 text-xs text-sky-200">{entry.recommendationReason}</p>
                    <p className="text-xs text-sky-300">Manual assignment allowed</p>
                  </>
                ) : null}
                {tone === "blocked" ? (
                  <p className="mt-1 text-xs text-rose-200">{entry.hardBlockReason}</p>
                ) : null}
                {entry.student.contentAssignment ? (
                  <>
                    <p className="mt-1 text-xs text-slate-300">
                      Last assigned: {formatDateShort(entry.student.contentAssignment.lastAssignedAt)}
                    </p>
                    {entry.student.contentAssignment.hasActiveAssignment ? (
                      <p className="text-xs text-rose-200">
                        Active progress: {entry.student.contentAssignment.progressAnswered}/{entry.student.contentAssignment.totalQuestions || 0}
                      </p>
                    ) : entry.student.contentAssignment.currentStatus === "completed" ? (
                      <p className="text-xs text-emerald-200">
                        Completed: {formatDateShort(entry.student.contentAssignment.completedAt)}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => onViewHistory?.(entry)}
                className="shrink-0 rounded px-2 py-1 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                View
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
