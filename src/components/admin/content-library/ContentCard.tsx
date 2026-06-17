"use client";

import { useState } from "react";
import type { ContentItem } from "./types";
import { getBlackBoxBadgeLabel, getBlackBoxBadgeTone, getContentJsonSummary, getContentMeta, parseBlackBoxAdminVerification, parseBlackBoxContentTest } from "./utils";

type Props = {
  item: ContentItem;
  selected: boolean;
  onSelect: (item: ContentItem) => void;
  onView: (item: ContentItem) => void;
  onDuplicate: (item: ContentItem) => void;
  onArchive: (item: ContentItem) => void;
  onPublish: (item: ContentItem) => void;
  onReview: (item: ContentItem) => void;
  /** Called with updated item data after a successful in-card Black Box run (Part 5) */
  onRefreshItem?: (updated: ContentItem) => void;
  viewMode: "grid" | "list";
  operatingAction?: "view" | "select" | "duplicate" | "archive" | "publish" | "review" | null;
  operatingId?: string | null;
  assigning?: boolean;
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
  onRefreshItem,
  viewMode,
  operatingAction,
  operatingId,
  assigning,
}: Props) {
  const [showMenu, setShowMenu] = useState(false);
  const [runningBB, setRunningBB] = useState(false);
  const [bbError, setBbError] = useState<string | null>(null);
  const summary = getContentJsonSummary(item.contentJson);
  const meta = getContentMeta(item);
  const blackBox = parseBlackBoxContentTest(item);
  const verification = parseBlackBoxAdminVerification(item);
  const isDraftOrGenerated = ["draft", "generated"].includes(item.status);
  const assignDisabled = !["reviewed", "approved", "published"].includes(item.status) || !summary.valid;
  const canPublish = ["reviewed", "approved", "published"].includes(item.status);
  const assignTitle = isDraftOrGenerated
    ? "Review or publish this content before assigning."
    : !summary.valid
      ? "Content JSON is invalid and cannot be assigned."
      : undefined;
  const isOperating = operatingId === item.id;

  /** Part 5: run Black Box test directly from card */
  async function handleRunBlackBox() {
    setRunningBB(true);
    setBbError(null);
    try {
      const response = await fetch(`/api/admin/content/${item.id}/black-box`, { method: "POST" });
      const data = await response.json() as { item?: { id: string; status: string; metadataJson: string | null }; error?: string };
      if (!response.ok || !data.item) {
        setBbError(data.error ?? "Black Box test failed.");
        return;
      }
      onRefreshItem?.({
        ...item,
        status: data.item.status,
        metadataJson: data.item.metadataJson ?? item.metadataJson,
      });
    } catch {
      setBbError("Black Box test request failed.");
    } finally {
      setRunningBB(false);
    }
  }

  /** Part 4: determine display badge for BB result vs admin status */
  const adminVerified = verification?.status === "verified" || verification?.status === "rejected";
  const bbBadgeText = getBlackBoxBadgeLabel(blackBox, verification);

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
          {/* Part 4: show admin review status alongside (not overwriting) machine BB result */}
          {adminVerified ? (
            <span className={`rounded-full px-2 py-1 text-xs font-black ${verification?.status === "verified" ? "bg-emerald-500/20 text-emerald-100" : "bg-rose-500/20 text-rose-100"}`}>
              Admin: {verification?.decision ?? verification?.status}
            </span>
          ) : null}
          <span className={`rounded-full px-2 py-1 text-xs font-black ${getBlackBoxBadgeTone(blackBox, verification)}`}>
            {bbBadgeText}
          </span>
          {/* Part 5: warn when content is reviewed/published but never tested */}
          {!blackBox && (item.status === "reviewed" || item.status === "published" || item.status === "approved") ? (
            <span className="rounded-full bg-rose-500/15 px-2 py-1 text-xs font-black text-rose-200">
              {item.status === "published" ? "Published before BB test" : "Reviewed before BB test"}
            </span>
          ) : null}
        </div>
      </div>
      {bbError ? (
        <p className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs font-bold text-rose-200">{bbError}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onView(item)}
          disabled={isOperating || Boolean(assigning)}
          className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isOperating && operatingAction === "view" ? "Opening..." : "View"}
        </button>
        {/* Part 5: visible Run Black Box button when not yet tested */}
        {!blackBox ? (
          <button
            type="button"
            onClick={() => void handleRunBlackBox()}
            disabled={runningBB || isOperating || Boolean(assigning)}
            className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs font-black text-indigo-100 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3"
          >
            {runningBB ? "Testing..." : <><span className="hidden sm:inline">Run Black Box</span><span className="sm:hidden">Test</span></>}
          </button>
        ) : null}
        {isDraftOrGenerated ? (
          <button
            type="button"
            onClick={() => onReview(item)}
            disabled={isOperating || Boolean(assigning)}
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-black text-amber-100 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isOperating && operatingAction === "review" ? "Opening..." : "Open Review"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSelect(item)}
            disabled={assignDisabled || isOperating || Boolean(assigning)}
            title={assignTitle}
            className="rounded-xl bg-indigo-500 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isOperating && operatingAction === "select" ? "Opening..." : assigning ? "Assigning..." : "Assign"}
          </button>
        )}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            disabled={isOperating || Boolean(assigning)}
            className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
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
                {isOperating && operatingAction === "duplicate" ? "Loading..." : "Duplicate"}
              </button>
              <button
                type="button"
                onClick={() => {
                  onArchive(item);
                  setShowMenu(false);
                }}
                className="block w-full px-4 py-2 text-left text-xs font-black text-slate-200 hover:bg-slate-800"
              >
                {isOperating && operatingAction === "archive" ? "Loading..." : "Archive"}
              </button>
              <button
                type="button"
                onClick={() => {
                  onPublish(item);
                  setShowMenu(false);
                }}
                disabled={!canPublish || isOperating || Boolean(assigning)}
                className="block w-full px-4 py-2 text-left text-xs font-black text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800"
              >
                {isOperating && operatingAction === "publish" ? "Loading..." : item.status === "published" ? "Unpublish" : "Publish"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
