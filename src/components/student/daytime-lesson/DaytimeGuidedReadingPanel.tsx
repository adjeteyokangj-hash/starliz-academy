"use client";

import { useMemo, useState } from "react";
import type { DaytimeStagePackExtras } from "@/lib/schools/daytime-lesson-ui";

type Props = {
  passageTitle?: string | null;
  passageText: string;
  paragraphs?: string[];
  vocabulary?: DaytimeStagePackExtras["vocabulary"];
  collapsedByDefault?: boolean;
};

export default function DaytimeGuidedReadingPanel({
  passageTitle,
  passageText,
  paragraphs,
  vocabulary,
  collapsedByDefault = false,
}: Props) {
  const [textScale, setTextScale] = useState<"sm" | "md" | "lg">("md");
  const [collapsed, setCollapsed] = useState(collapsedByDefault);

  const blocks = useMemo(() => {
    if (paragraphs?.length) return paragraphs;
    return passageText
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .filter(Boolean);
  }, [paragraphs, passageText]);

  const sizeClass = textScale === "sm" ? "text-base leading-7" : textScale === "lg" ? "text-xl leading-9" : "text-lg leading-8";

  return (
    <section
      data-testid="daytime-guided-reading-panel"
      className="rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600">Guided Reading</p>
          <h2 className="text-base font-bold text-slate-900">{passageTitle?.trim() || "Passage"}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="Text size">
            {(["sm", "md", "lg"] as const).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setTextScale(size)}
                className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                  textScale === size ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600"
                }`}
              >
                {size === "sm" ? "A" : size === "md" ? "A+" : "A++"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700"
            data-testid="daytime-reading-collapse"
          >
            {collapsed ? "Show passage" : "Hide passage"}
          </button>
        </div>
      </div>

      {!collapsed ? (
        <div className={`space-y-4 px-4 py-4 ${sizeClass} text-slate-800`} data-testid="daytime-reading-passage">
          {blocks.map((paragraph, index) => (
            <p key={`p-${index}`}>
              <span className="mr-2 text-xs font-bold text-slate-400">¶{index + 1}</span>
              {paragraph}
            </p>
          ))}
        </div>
      ) : (
        <p className="px-4 py-3 text-sm text-slate-500">Passage hidden — open it any time while answering.</p>
      )}

      {vocabulary?.length ? (
        <div className="border-t border-slate-100 px-4 py-3" data-testid="daytime-reading-vocabulary">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Key vocabulary</p>
          <ul className="mt-2 space-y-2">
            {vocabulary.map((entry) => (
              <li key={entry.word} className="rounded-lg bg-violet-50/70 px-3 py-2 text-sm">
                <span className="font-bold text-violet-900">{entry.word}</span>
                <span className="text-slate-700"> — {entry.childFriendlyMeaning}</span>
                {entry.example ? <p className="mt-1 text-xs text-slate-500">{entry.example}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
