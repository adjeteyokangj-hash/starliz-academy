"use client";

import Link from "next/link";
import type { ContentItem } from "./types";
import { getContentJsonSummary, getContentMeta } from "./utils";

type Props = {
  item: ContentItem;
  selected: boolean;
  onSelect: (item: ContentItem) => void;
  viewMode: "grid" | "list";
};

export default function ContentCard({ item, selected, onSelect, viewMode }: Props) {
  const summary = getContentJsonSummary(item.contentJson);
  const meta = getContentMeta(item);
  const assignDisabled = !["reviewed", "published"].includes(item.status) || !summary.valid;

  return (
    <article className={`rounded-2xl border p-4 ${selected ? "border-indigo-400 bg-indigo-500/5" : "border-slate-800 bg-slate-950/45"}`}>
      <div className={`flex ${viewMode === "list" ? "flex-row items-start justify-between gap-4" : "flex-col gap-2"}`}>
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-white">{meta.title}</p>
          <p className="mt-1 text-xs text-slate-400">{meta.subject} | {meta.topic || "General"}</p>
          <p className="text-xs text-slate-500">{meta.yearGroup || "All years"} | {meta.keyStage || "All key stages"} | {meta.ageGroup || "Any age"}</p>
          <p className="text-xs text-slate-500">Level {item.level} | Used {item.usedCount}x | {summary.itemCount} item(s)</p>
          <p className="mt-2 line-clamp-2 text-xs text-slate-400">{summary.preview}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <span className={`rounded-full px-2 py-1 text-xs font-black ${summary.valid ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"}`}>
            {summary.valid ? "Valid JSON" : "Invalid JSON"}
          </span>
          <span className="rounded-full bg-amber-500/15 px-2 py-1 text-xs font-black text-amber-200">{item.status}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/admin/content-library/${item.id}`} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800">View</Link>
        <button type="button" onClick={() => onSelect(item)} disabled={assignDisabled} className="rounded-xl bg-indigo-500 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">Assign</button>
        <button type="button" className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-300">More</button>
      </div>
    </article>
  );
}
