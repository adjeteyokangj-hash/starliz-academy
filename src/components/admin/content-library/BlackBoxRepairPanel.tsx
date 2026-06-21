"use client";

import { useMemo, useState } from "react";
import type {
  RepairResult,
} from "@/lib/ai/content-repair";
import {
  inferBlackBoxIssueType,
  runIssueSpecificRepair,
  runIssueSpecificRepairsForItem,
} from "@/lib/ai/content-repair";

type Props = {
  currentItem: Record<string, unknown> | null;
  itemIndex: number;
  selectedLevel: number;
  selectedYearGroup: string;
  topic: string;
  reasons: string[] | undefined;
  onRepair?: (result: RepairResult) => void;
  disabled?: boolean;
};

type RepairPreview = {
  title: string;
  reasons: string[];
  result: RepairResult;
};

export default function BlackBoxRepairPanel({
  currentItem,
  itemIndex,
  selectedLevel,
  selectedYearGroup,
  topic,
  reasons,
  onRepair,
  disabled,
}: Props) {
  const [preview, setPreview] = useState<RepairPreview | null>(null);
  const [panelMessage, setPanelMessage] = useState<string | null>(null);

  const normalizedReasons = useMemo(() => {
    return (reasons ?? []).filter(Boolean);
  }, [reasons]);

  if (!currentItem || !reasons || !reasons.length) {
    return null;
  }

  async function handleFixIssue(issueText: string) {
    if (disabled || !currentItem) return;
    setPanelMessage(null);

    const result = runIssueSpecificRepair({
      item: { ...currentItem, index: itemIndex },
      itemIndex,
      issueText,
      selectedLevel,
      selectedYearGroup,
      topic,
    });

    if (!result.success) {
      setPanelMessage(result.message);
      return;
    }

    setPreview({
      title: `Fix Issue: ${inferBlackBoxIssueType(issueText).replace(/_/g, " ")}`,
      reasons: [issueText],
      result,
    });
  }

  async function handleFixAllForItem() {
    if (disabled || !currentItem || !normalizedReasons.length) return;
    setPanelMessage(null);

    const batch = runIssueSpecificRepairsForItem({
      item: { ...currentItem, index: itemIndex },
      itemIndex,
      issues: normalizedReasons,
      selectedLevel,
      selectedYearGroup,
      topic,
    });

    if (!batch.applied.length) {
      setPanelMessage("No deterministic fixes were available for this item.");
      return;
    }

    setPreview({
      title: `Fix All Issues for Item ${itemIndex + 1}`,
      reasons: batch.applied.map((entry) => entry.issueText),
      result: {
        success: true,
        itemIndex,
        actionType: batch.applied[0]?.actionType ?? "fix_topic_match",
        before: batch.before,
        after: batch.after,
        message: `Prepared ${batch.applied.length} fix${batch.applied.length === 1 ? "" : "es"} for item ${itemIndex + 1}.`,
        confidence: "needs_review",
      },
    });
  }

  function approveRepair() {
    if (!preview || !preview.result.success) return;
    onRepair?.(preview.result);
    setPreview(null);
  }

  if (preview) {
    return (
      <div className="rounded-lg border border-amber-400/20 bg-amber-500/5 p-4">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-amber-100">
          {preview.title}
        </p>
        <div className="mt-2 space-y-1 text-xs text-amber-50">
          {preview.reasons.map((reason) => (
            <p key={reason}>Issue: {reason}</p>
          ))}
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div>
            <p className="text-[10px] font-black uppercase text-amber-200">Before</p>
            <pre className="mt-1 max-h-32 overflow-auto rounded border border-slate-700 bg-slate-950 p-2 text-[10px] text-slate-300">
              {JSON.stringify(preview.result.before, null, 2).substring(0, 200)}...
            </pre>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase text-emerald-200">After</p>
            <pre className="mt-1 max-h-32 overflow-auto rounded border border-slate-700 bg-slate-950 p-2 text-[10px] text-slate-300">
              {JSON.stringify(preview.result.after, null, 2).substring(0, 200)}...
            </pre>
          </div>
        </div>
        <p className="mt-2 text-xs text-amber-100">{preview.result.message}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={approveRepair}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            Apply Repair
          </button>
          <button
            onClick={() => setPreview(null)}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-black text-slate-200 hover:bg-slate-700"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-indigo-100">
        Issue-Specific Fixes
      </p>
      <div className="mt-2 space-y-2">
        {normalizedReasons.map((reason) => (
          <div key={reason} className="rounded-lg border border-slate-700/80 bg-slate-950/60 p-2">
            <p className="text-xs text-slate-200">{reason}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded border border-indigo-400/40 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-indigo-100">
                {inferBlackBoxIssueType(reason).replace(/_/g, " ")}
              </span>
              <button
                onClick={() => handleFixIssue(reason)}
                disabled={disabled}
                className="rounded border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                Fix Issue
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => void handleFixAllForItem()}
          disabled={disabled || normalizedReasons.length === 0}
          className="rounded border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
        >
          Fix All Issues for This Item
        </button>
      </div>
      {panelMessage ? <p className="mt-2 text-xs text-amber-100">{panelMessage}</p> : null}
    </div>
  );
}
