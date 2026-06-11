"use client";

import { useMemo, useState } from "react";
import type { ContentItem } from "./types";
import {
  getBlackBoxBadgeTone,
  getContentJsonSummary,
  getContentMeta,
  parseBlackBoxAdminVerification,
  parseBlackBoxContentTest,
  parseBlackBoxRuntimeTest,
  parseContentReviewHistory,
} from "./utils";

type Props = {
  open: boolean;
  content: ContentItem | null;
  onClose: () => void;
  onVerified?: (item: ContentItem) => void;
};

type VerificationAction = "approve" | "reject" | "reclassify" | "needs_changes" | "send_back";

type VerificationPayload = {
  item?: {
    id: string;
    status: string;
    metadataJson?: string | null;
  };
  error?: string;
  blackBoxLiveTest?: unknown;
};

export default function ContentViewModal({ open, content, onClose, onVerified }: Props) {
  if (!open || !content) return null;
  return (
    <ContentViewModalBody
      key={content.id}
      content={content}
      onClose={onClose}
      onVerified={onVerified}
    />
  );
}

function ContentViewModalBody({
  content,
  onClose,
  onVerified,
}: {
  content: ContentItem;
  onClose: () => void;
  onVerified?: (item: ContentItem) => void;
}) {
  const summary = getContentJsonSummary(content.contentJson);
  const meta = getContentMeta(content);
  const blackBox = parseBlackBoxContentTest(content);
  const runtime = parseBlackBoxRuntimeTest(content);
  const verification = parseBlackBoxAdminVerification(content);
  const reviewHistory = useMemo(() => parseContentReviewHistory(content), [content]);
  const [notes, setNotes] = useState("");
  const [subject, setSubject] = useState(blackBox?.reclassificationRecommendation?.subject ?? meta.subject ?? "");
  const [strand, setStrand] = useState(blackBox?.reclassificationRecommendation?.strand ?? "");
  const [workingAction, setWorkingAction] = useState<VerificationAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  let items: unknown[] = [];
  try {
    const parsed = JSON.parse(content.contentJson);
    items = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    items = [];
  }

  async function saveVerification(action: VerificationAction) {
    if (!content) return;
    setWorkingAction(action);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/content/${content.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          notes,
          ...(action === "reclassify"
            ? {
                reclassification: {
                  subject: subject.trim() || undefined,
                  strand: strand.trim() || undefined,
                },
              }
            : {}),
        }),
      });
      const payload = await response.json() as VerificationPayload;
      if (!response.ok || !payload.item) {
        setMessage(payload.error ?? "Verification could not be saved.");
        return;
      }
      onVerified?.({
        ...content,
        status: payload.item.status,
        metadataJson: payload.item.metadataJson ?? content.metadataJson,
      });
      setMessage(`Verification saved: ${payload.item.status}.`);
    } catch {
      setMessage("Verification request failed.");
    } finally {
      setWorkingAction(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-200">Review Workspace</p>
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

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <p className="text-xs font-bold text-slate-300">Generated Content ({items.length} items)</p>
              <div className="mt-2 space-y-3">
                {items.map((item, idx) => (
                  <div key={idx} className="rounded-lg border border-slate-700 bg-slate-950 p-3">
                    <p className="mb-2 text-xs font-black text-slate-300">Item {idx + 1}</p>
                    <pre className="whitespace-pre-wrap break-words text-xs text-slate-300">{JSON.stringify(item, null, 2)}</pre>
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-300">Runtime Lesson Test</p>
              <span className={`rounded-full px-2 py-1 text-xs font-black ${runtime?.status === "passed" ? "bg-emerald-500/15 text-emerald-200" : runtime?.status === "failed" ? "bg-rose-500/15 text-rose-200" : "bg-amber-500/15 text-amber-200"}`}>
                {runtime ? `${runtime.status}${typeof runtime.score === "number" ? ` • ${runtime.score}/100` : ""}` : "Not run"}
              </span>
            </div>
            {runtime ? (
              <div className="mt-2 space-y-2 text-xs text-slate-400">
                {runtime.flowChecks?.map((entry) => <p key={entry}>{entry}</p>)}
                {runtime.hintChecks?.map((entry) => <p key={entry}>{entry}</p>)}
                {runtime.masteryChecks?.map((entry) => <p key={entry}>{entry}</p>)}
                {runtime.reasons && runtime.reasons.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5">
                    {runtime.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">Runtime simulation will run when an admin saves verification.</p>
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
            <p className="text-xs font-bold text-slate-300">Admin Verification</p>
            <div className="mt-2 text-xs text-slate-400">
              <p>Status: {verification?.status ?? "pending"}</p>
              {verification?.notes ? <p className="mt-1">Latest notes: {verification.notes}</p> : null}
            </div>
            <label className="mt-3 block text-xs font-bold text-slate-300">
              Review notes
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="mt-1 min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-400"
                placeholder="Add verification notes..."
              />
            </label>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-400"
                placeholder="Recommended subject"
              />
              <input
                value={strand}
                onChange={(event) => setStrand(event.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-400"
                placeholder="Recommended strand"
              />
            </div>
            {message ? <p className="mt-3 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200">{message}</p> : null}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {([
                ["approve", "Approve", "bg-emerald-500 hover:bg-emerald-400"],
                ["reject", "Reject", "bg-rose-500 hover:bg-rose-400"],
                ["reclassify", "Reclassify", "bg-sky-500 hover:bg-sky-400"],
                ["needs_changes", "Needs Changes", "bg-amber-500 hover:bg-amber-400"],
                ["send_back", "Regenerate", "bg-slate-700 hover:bg-slate-600"],
              ] as Array<[VerificationAction, string, string]>).map(([action, label, className]) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => void saveVerification(action)}
                  disabled={workingAction !== null}
                  className={`rounded-lg px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
                >
                  {workingAction === action ? "Saving..." : label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <p className="text-xs font-bold text-slate-300">Review History</p>
            <div className="mt-2 space-y-2 text-xs text-slate-400">
              {reviewHistory.length > 0 ? reviewHistory.slice().reverse().map((entry) => (
                <div key={`${entry.createdAt}-${entry.action}`} className="rounded-lg border border-slate-800 bg-slate-950 p-2">
                  <p className="font-bold text-slate-200">{entry.action} {entry.status ? `• ${entry.status}` : ""}</p>
                  <p>{new Date(entry.createdAt).toLocaleString()} {entry.actor ? `• ${entry.actor}` : ""}</p>
                  {entry.notes ? <p className="mt-1">{entry.notes}</p> : null}
                </div>
              )) : <p>No admin verification history yet.</p>}
            </div>
          </div>
          </div>
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
