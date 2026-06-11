"use client";

import type { ContentItem } from "./types";
import { getBlackBoxBadgeTone, getContentJsonSummary, getContentMeta, parseBlackBoxContentTest } from "./utils";

type Props = {
  open: boolean;
  content: ContentItem | null;
  onClose: () => void;
};

export default function ContentViewModal({ open, content, onClose }: Props) {
  if (!open || !content) return null;

  const summary = getContentJsonSummary(content.contentJson);
  const meta = getContentMeta(content);
  const blackBox = parseBlackBoxContentTest(content);

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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-300">Black Box Content Test</p>
              <span className={`rounded-full px-2 py-1 text-xs font-black ${getBlackBoxBadgeTone(blackBox)}`}>
                {blackBox ? `${blackBox.decision}${typeof blackBox.score === "number" ? ` • ${blackBox.score}/100` : ""}` : "Not tested"}
              </span>
            </div>
            {blackBox ? (
              <div className="mt-3 space-y-3 text-xs text-slate-400">
                {blackBox.reasons && blackBox.reasons.length > 0 ? (
                  <div>
                    <p className="font-bold text-slate-300">Reasons</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {blackBox.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                    </ul>
                  </div>
                ) : null}
                {blackBox.reclassificationRecommendation ? (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-amber-100">
                    <p className="font-bold">Reclassification recommendation</p>
                    <p className="mt-1">
                      Subject: {blackBox.reclassificationRecommendation.subject ?? "N/A"} | Strand: {blackBox.reclassificationRecommendation.strand ?? "N/A"} | Key stage: {blackBox.reclassificationRecommendation.keyStage ?? "N/A"} | Year: {blackBox.reclassificationRecommendation.yearGroup ?? "N/A"} | Level: {blackBox.reclassificationRecommendation.level ?? "N/A"}
                    </p>
                  </div>
                ) : null}
                {blackBox.itemChecks && blackBox.itemChecks.length > 0 ? (
                  <div>
                    <p className="font-bold text-slate-300">Item checks</p>
                    <div className="mt-2 space-y-2">
                      {blackBox.itemChecks.map((check, idx) => (
                        <div key={`${check.itemIndex ?? idx}-${check.score ?? "score"}`} className="rounded-lg border border-slate-700 bg-slate-950 p-2">
                          <p className="font-bold text-slate-300">Item {typeof check.itemIndex === "number" ? check.itemIndex + 1 : idx + 1}{typeof check.score === "number" ? ` • ${check.score}/100` : ""}</p>
                          {check.reasons && check.reasons.length > 0 ? (
                            <ul className="mt-1 list-disc space-y-1 pl-5">
                              {check.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                            </ul>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">No black-box scorecard has been stored for this content yet.</p>
            )}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <p className="text-xs font-bold text-slate-300">Metadata</p>
            <div className="mt-2 grid gap-2 text-xs text-slate-400">
              <div><span className="font-bold">Year Group:</span> {meta.yearGroup || "All"}</div>
              <div><span className="font-bold">Key Stage:</span> {meta.keyStage || "All"}</div>
              <div><span className="font-bold">Pathway:</span> {meta.curriculumPathway || "Not tagged"}</div>
              <div><span className="font-bold">Exam Board:</span> {meta.examBoard || "Not tagged"}</div>
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
