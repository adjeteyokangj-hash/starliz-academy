"use client";

import type { ContentItem, StudentAssignmentCandidate } from "./types";
import { getContentJsonSummary, getContentMeta } from "./utils";

type Props = {
  open: boolean;
  content: ContentItem | null;
  candidate: StudentAssignmentCandidate | null;
  onClose: () => void;
  onConfirm: () => void;
  confirming: boolean;
};

export default function AssignmentConfirmModal({ open, content, candidate, onClose, onConfirm, confirming }: Props) {
  if (!open || !content || !candidate) return null;
  const meta = getContentMeta(content);
  const summary = getContentJsonSummary(content.contentJson);
  const weakAreas = (candidate.student.weakPatterns ?? []).join(", ") || "None detected";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5">
        <h3 className="text-lg font-black text-white">Assign &quot;{meta.title}&quot; to &quot;{candidate.student.name}&quot;?</h3>
        <div className="mt-3 space-y-1 text-sm text-slate-300">
          <p>Year group: {meta.yearGroup || "All years"}</p>
          <p>Key stage: {meta.keyStage || "All key stages"}</p>
          <p>Subject: {meta.subject}</p>
          <p>Difficulty: {content.level}</p>
          <p>Item count: {summary.itemCount}</p>
          <p>Student weak areas: {weakAreas}</p>
          <p>{candidate.recommendationReason}</p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-black text-slate-200">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={confirming} className="rounded-xl bg-indigo-500 px-3 py-2 text-sm font-black text-white disabled:opacity-60">
            {confirming ? "Assigning..." : "Confirm assignment"}
          </button>
        </div>
      </div>
    </div>
  );
}
