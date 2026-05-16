"use client";

import { useState } from "react";
import type { ContentItem } from "./types";
import { getContentJsonSummary, getContentMeta } from "./utils";

type Props = {
  item: ContentItem;
  selected: boolean;
  onSelect: (item: ContentItem) => void;
  onView: (item: ContentItem) => void;
  onDuplicate: (item: ContentItem) => void;
  onArchive: (item: ContentItem) => void;
  onPublish: (item: ContentItem) => void;
  onReview: (item: ContentItem) => void;
  viewMode: "grid" | "list";
};

export default function ContentCard({
  item,
  selected,
  onSelect,
  onView,
  onDuplicate,
  onArchive,
  onPublish,
  onReview,
  viewMode,
}: Props) {
  const [showMenu, setShowMenu] = useState(false);
  const summary = getContentJsonSummary(item.contentJson);
  const meta = getContentMeta(item);
  const isDraftOrGenerated = ["draft", "generated"].includes(item.status);
  const assignDisabled = !["reviewed", "published"].includes(item.status) || !summary.valid;
  const canPublish = ["reviewed", "published"].includes(item.status);
  const assignTitle = isDraftOrGenerated
    ? "Review or publish this content before assigning."
    : !summary.valid
      ? "Content JSON is invalid and cannot be assigned."
      : undefined;

  return (
    <article className={`rounded-2xl border p-4 ${selected ? "border-indigo-400 bg-indigo-500/5" : "border-slate-800 bg-slate-950/45"}`}>
      <div className={`flex ${viewMode === "list" ? "flex-row items-start justify-between gap-4" : "flex-col gap-2"}`}>
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-white">{meta.title}</p>
          <p className="mt-1 text-xs text-slate-400">{meta.subject} | {meta.topic || "General"}</p>
          <p className="text-xs text-slate-500">{meta.yearGroup || "All years"} | {meta.keyStage || "All key stages"} | {meta.ageGroup || "Any age"}</p>
          <p className="text-xs text-slate-500">Pathway: {meta.curriculumPathway ? meta.curriculumPathway.toUpperCase() : "N/A"} | Exam board: {meta.examBoard ?? "None"}</p>
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
        <button
          type="button"
          onClick={() => onView(item)}
          className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800"
        >
          View
        </button>
        {isDraftOrGenerated ? (
          <button
            type="button"
            onClick={() => onReview(item)}
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-black text-amber-100 hover:bg-amber-500/20"
          >
            Review to assign
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSelect(item)}
            disabled={assignDisabled}
            title={assignTitle}
            className="rounded-xl bg-indigo-500 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Assign
          </button>
        )}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-300 hover:bg-slate-800"
          >
            More
          </button>
          {showMenu ? (
            <div className="absolute right-0 top-full mt-1 rounded-xl border border-slate-700 bg-slate-950 shadow-lg z-10">
              <button
                type="button"
                onClick={() => {
                  onDuplicate(item);
                  setShowMenu(false);
                }}
                className="block w-full px-4 py-2 text-left text-xs font-black text-slate-200 hover:bg-slate-800"
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => {
                  onArchive(item);
                  setShowMenu(false);
                }}
                className="block w-full px-4 py-2 text-left text-xs font-black text-slate-200 hover:bg-slate-800"
              >
                Archive
              </button>
              <button
                type="button"
                onClick={() => {
                  onPublish(item);
                  setShowMenu(false);
                }}
                disabled={!canPublish}
                className="block w-full px-4 py-2 text-left text-xs font-black text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800"
              >
                {item.status === "published" ? "Unpublish" : "Publish"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
