"use client";

import { useMemo, useState } from "react";
import type {
  RepairActionType,
  RepairResult,
} from "@/lib/ai/content-repair";
import {
  repairMissingCorrectAnswer,
  repairDuplicateChoices,
  improveReadability,
  strengthenExplanation,
  increaseDifficulty,
  fixTopicMatch,
  isSafeRepair,
} from "@/lib/ai/content-repair";

type Props = {
  currentItem: Record<string, unknown> | null;
  itemIndex: number;
  currentItemLevel: number;
  correctAnswer: string;
  topic: string;
  reasons: string[] | undefined;
  onRepair?: (result: RepairResult) => void;
  disabled?: boolean;
};

type RepairPreview = {
  action: RepairActionType;
  result: RepairResult;
  isApproved: boolean;
};

export default function BlackBoxRepairPanel({
  currentItem,
  itemIndex,
  currentItemLevel,
  correctAnswer,
  topic,
  reasons,
  onRepair,
  disabled,
}: Props) {
  const [preview, setPreview] = useState<RepairPreview | null>(null);

  const issueGroups = useMemo(() => {
    const grouped: Record<string, string[]> = {};
    for (const reason of reasons ?? []) {
      const normalizedReason = String(reason).toLowerCase();

      if (normalizedReason.includes("correct answer is not present")) {
        grouped.fix_choices = grouped.fix_choices || [];
        grouped.fix_choices.push(reason);
      } else if (normalizedReason.includes("duplicate")) {
        grouped.fix_choices = grouped.fix_choices || [];
        grouped.fix_choices.push(reason);
      } else if (/readability appears too (simple|advanced)/i.test(reason)) {
        grouped.improve_readability = grouped.improve_readability || [];
        grouped.improve_readability.push(reason);
      } else if (/too (easy|hard) for/i.test(reason) || /declared level .* does not match expected/i.test(reason)) {
        grouped.increase_difficulty = grouped.increase_difficulty || [];
        grouped.increase_difficulty.push(reason);
      } else if (normalizedReason.includes("thin") || normalizedReason.includes("depth")) {
        grouped.strengthen_explanation = grouped.strengthen_explanation || [];
        grouped.strengthen_explanation.push(reason);
      } else if (normalizedReason.includes("topic") || normalizedReason.includes("match")) {
        grouped.fix_topic_match = grouped.fix_topic_match || [];
        grouped.fix_topic_match.push(reason);
      }
    }
    return grouped;
  }, [reasons]);

  if (!currentItem || !reasons || !reasons.length) {
    return null;
  }

  async function handleRepair(actionType: RepairActionType) {
    if (disabled || !currentItem) return;

    let result: RepairResult | null = null;

    try {
      if (actionType === "fix_choices") {
        const hasCorrectAnswer = Array.isArray(currentItem.choices)
          ? (currentItem.choices as unknown[]).some((c) =>
              String(c).toLowerCase().trim() === correctAnswer.toLowerCase().trim()
            )
          : false;

        if (!hasCorrectAnswer && correctAnswer) {
          result = repairMissingCorrectAnswer({
            item: { ...currentItem, index: itemIndex },
            correctAnswer,
          });
        } else {
          result = repairDuplicateChoices({
            item: { ...currentItem, index: itemIndex },
          });
        }
      } else if (actionType === "improve_readability") {
        result = improveReadability({
          item: { ...currentItem, index: itemIndex },
          targetLevel: currentItemLevel,
        });
      } else if (actionType === "strengthen_explanation") {
        result = strengthenExplanation({
          item: { ...currentItem, index: itemIndex },
        });
      } else if (actionType === "increase_difficulty") {
        const recommendedLevel = Math.min(10, currentItemLevel + 2);
        result = increaseDifficulty({
          item: { ...currentItem, index: itemIndex },
          currentLevel: currentItemLevel,
          targetLevel: recommendedLevel,
        });
      } else if (actionType === "fix_topic_match" && topic) {
        result = fixTopicMatch({
          item: { ...currentItem, index: itemIndex },
          targetTopic: topic,
        });
      }

      if (result) {
        setPreview({
          action: actionType,
          result,
          isApproved: isSafeRepair(actionType), // Auto-approve safe repairs
        });
      }
    } catch (err) {
      console.error(`Repair ${actionType} failed:`, err);
    }
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
          Repair Preview
        </p>
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
        Available Fixes
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(Object.entries(issueGroups) as Array<[RepairActionType, string[]]>).map(
          ([actionType]) => (
            <button
              key={actionType}
              onClick={() => handleRepair(actionType)}
              disabled={disabled}
              className={`rounded px-2 py-1 text-[10px] font-black uppercase tracking-wide ${
                isSafeRepair(actionType)
                  ? "border border-emerald-400/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
                  : "border border-amber-400/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
              }`}
            >
              {actionType.replace(/_/g, " ")}
            </button>
          )
        )}
      </div>
    </div>
  );
}
