"use client";

import type { ContentItem } from "./types";
import { getContentJsonSummary, getContentMeta } from "./utils";

type Props = {
  open: boolean;
  content: ContentItem | null;
  onClose: () => void;
};

export default function ContentViewModal({ open, content, onClose }: Props) {
  if (!open || !content) return null;

  const summary = getContentJsonSummary(content.contentJson);
  const meta = getContentMeta(content);

  let items: unknown[] = [];
  try {
    const parsed = JSON.parse(content.contentJson);
    items = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    items = [];
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-black text-white">{meta.title}</h2>
            <p className="mt-1 text-xs text-slate-400">{meta.subject} | {meta.topic || "General"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-bold text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <p className="text-xs font-bold text-slate-300">Metadata</p>
            <div className="mt-2 grid gap-2 text-xs text-slate-400">
              <div><span className="font-bold">Year Group:</span> {meta.yearGroup || "All"}</div>
              <div><span className="font-bold">Key Stage:</span> {meta.keyStage || "All"}</div>
              <div><span className="font-bold">Age Group:</span> {meta.ageGroup || "Any"}</div>
              <div><span className="font-bold">Level:</span> {content.level}</div>
              <div><span className="font-bold">Status:</span> {content.status}</div>
              <div><span className="font-bold">Used Count:</span> {content.usedCount}</div>
              <div><span className="font-bold">Valid JSON:</span> {summary.valid ? "Yes" : "No"}</div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <p className="text-xs font-bold text-slate-300">Content ({items.length} items)</p>
            <div className="mt-2 space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="rounded-lg border border-slate-700 bg-slate-950 p-2">
                  <p className="text-xs font-mono text-slate-300">{JSON.stringify(item, null, 2)}</p>
                </div>
              ))}
            </div>
          </div>

          {content.prompt ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <p className="text-xs font-bold text-slate-300">Generation Prompt</p>
              <p className="mt-2 text-xs text-slate-400">{content.prompt}</p>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
        >
          Close
        </button>
      </div>
    </div>
  );
}
