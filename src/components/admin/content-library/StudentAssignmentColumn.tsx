"use client";

import Link from "next/link";
import type { StudentAssignmentCandidate } from "./types";

type Props = {
  title: string;
  tone: "recommended" | "eligible" | "blocked";
  candidates: StudentAssignmentCandidate[];
  selectedStudentId: string | null;
  onSelectStudent: (id: string) => void;
  disabled?: boolean;
};

export default function StudentAssignmentColumn({ title, tone, candidates, selectedStudentId, onSelectStudent, disabled }: Props) {
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
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                disabled={disabled || !entry.hardEligible}
                onClick={() => onSelectStudent(entry.student.id)}
                className="flex-1 text-left disabled:cursor-not-allowed"
              >
                <p className="text-sm font-bold text-slate-100">{entry.student.name}</p>
                <p className="text-xs text-slate-400">{entry.student.yearGroup || "No year"} | {entry.student.keyStageLevel || "No key stage"}</p>
                {tone === "recommended" ? (
                  <p className="mt-1 text-xs text-emerald-200">{entry.recommendationReason}</p>
                ) : null}
                {tone === "eligible" ? (
                  <>
                    <p className="mt-1 text-xs text-sky-200">No matching weak area detected, but eligible</p>
                    <p className="text-xs text-sky-300">Manual assignment allowed</p>
                  </>
                ) : null}
                {tone === "blocked" ? (
                  <p className="mt-1 text-xs text-rose-200">{entry.hardBlockReason}</p>
                ) : null}
              </button>
              <Link
                href={`/admin/students/${entry.student.id}`}
                className="shrink-0 rounded px-2 py-1 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                View
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
