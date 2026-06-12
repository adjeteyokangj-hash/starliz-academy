"use client";

import { useMemo, useState } from "react";
import StarLizQuestionCard from "@/components/learning/StarLizQuestionCard";
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

type GeneratedReviewItem = Record<string, unknown>;

function asReviewItems(contentJson: string): GeneratedReviewItem[] {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.filter((item): item is GeneratedReviewItem => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  } catch {
    return [];
  }
}

function textValue(value: unknown): string {
  return String(value ?? "").trim();
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(textValue).filter(Boolean);
}

function firstText(item: GeneratedReviewItem, keys: string[]): string {
  for (const key of keys) {
    const value = textValue(item[key]);
    if (value) return value;
  }
  return "";
}

function answerOptionsFor(item: GeneratedReviewItem): string[] {
  return stringArrayValue(item.choices).length
    ? stringArrayValue(item.choices)
    : stringArrayValue(item.options).length
      ? stringArrayValue(item.options)
      : stringArrayValue(item.answerOptions);
}

function labelledLines(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => `${key}: ${textValue(entry)}`)
      .filter((line) => !line.endsWith(":"));
  }
  const text = textValue(value);
  return text ? [text] : [];
}

function difficultyLabel(value: number): string {
  if (value <= 2) return "Foundation";
  if (value <= 4) return "Core";
  if (value <= 6) return "Secure";
  return "Advanced";
}

function numericLevel(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(10, Math.round(parsed))) : fallback;
}

function withUpdatedItemLevel(item: GeneratedReviewItem, level: number): GeneratedReviewItem {
  return {
    ...item,
    level,
    difficulty: level,
    difficultyLevel: level,
    difficultyLabel: difficultyLabel(level),
  };
}

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
  const items = useMemo(() => asReviewItems(content.contentJson), [content.contentJson]);
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [rawExpanded, setRawExpanded] = useState(false);
  const [notes, setNotes] = useState("");
  const [subject, setSubject] = useState(blackBox?.reclassificationRecommendation?.subject ?? meta.subject ?? "");
  const [strand, setStrand] = useState(blackBox?.reclassificationRecommendation?.strand ?? "");
  const [workingAction, setWorkingAction] = useState<VerificationAction | null>(null);
  const [blackBoxRetesting, setBlackBoxRetesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const currentItem = items[selectedItemIndex] ?? null;
  const answerOptions = currentItem ? answerOptionsFor(currentItem) : [];
  const questionText = currentItem ? firstText(currentItem, ["question", "prompt", "word", "title"]) : "No question content available.";
  const correctAnswer = currentItem ? firstText(currentItem, ["answer", "correctAnswer", "expectedAnswer"]) : "";
  const explanation = currentItem ? firstText(currentItem, ["explanation", "rationale", "feedback"]) : "";
  const hint = currentItem ? firstText(currentItem, ["hint", "sentenceContext", "support"]) : "";
  const workedSolution = currentItem ? firstText(currentItem, ["workedSolution", "worked_solution", "solution", "method"]) : "";
  const coachSteps = currentItem ? [
    ...labelledLines(currentItem.coachSteps),
    ...labelledLines(currentItem.guidedSteps),
    ...labelledLines(currentItem.steps),
  ] : [];
  const passage = currentItem ? firstText(currentItem, ["passage", "text", "sourceText"]) : "";
  const currentItemCheck = blackBox?.itemChecks?.find((check) => check.itemIndex === selectedItemIndex)
    ?? blackBox?.itemChecks?.[selectedItemIndex]
    ?? null;
  const estimatedMinutes = Math.max(2, Math.ceil(items.length * 1.5));
  const currentItemLevel = numericLevel(currentItem?.difficulty ?? currentItem?.level, content.level);
  const recommendedLevel = currentItemCheck?.recommendedLevel ?? currentItemCheck?.estimatedLevel ?? null;
  const levelRecommendation = currentItemCheck?.levelRecommendation ?? null;

  async function updateCurrentItemLevel(nextLevel: number) {
    if (!currentItem) return;
    setMessage(null);

    const nextItems = items.map((item, index) =>
      index === selectedItemIndex ? withUpdatedItemLevel(item, nextLevel) : item,
    );

    try {
      const response = await fetch(`/api/admin/content/${content.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentJson: JSON.stringify(nextItems) }),
      });
      const payload = await response.json() as VerificationPayload;
      if (!response.ok || !payload.item) {
        setMessage(payload.error ?? "Item level update failed.");
        return;
      }

      onVerified?.({
        ...content,
        status: payload.item.status,
        contentJson: JSON.stringify(nextItems),
        metadataJson: payload.item.metadataJson ?? content.metadataJson,
      });
      setMessage(`Item ${selectedItemIndex + 1} level updated to ${nextLevel}. Re-run Black Box to refresh the score.`);
    } catch {
      setMessage("Item level update request failed.");
    }
  }

  async function rerunBlackBox() {
    setBlackBoxRetesting(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/content/${content.id}/black-box`, {
        method: "POST",
      });
      const payload = await response.json() as VerificationPayload;
      if (!response.ok || !payload.item) {
        setMessage(payload.error ?? "Black Box re-run failed.");
        return;
      }
      onVerified?.({
        ...content,
        status: payload.item.status,
        metadataJson: payload.item.metadataJson ?? content.metadataJson,
      });
      setMessage("Black Box test re-run completed.");
    } catch {
      setMessage("Black Box re-run request failed.");
    } finally {
      setBlackBoxRetesting(false);
    }
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

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-200">Student-style Preview</p>
                  <p className="mt-1 text-sm font-black text-white">Question {items.length ? selectedItemIndex + 1 : 0} of {items.length}</p>
                  <p className="text-xs text-slate-400">{items.length} total questions | Estimated {estimatedMinutes} min | {meta.subject} | {meta.topic || "General"}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedItemIndex((current) => Math.max(0, current - 1));
                      setRawExpanded(false);
                    }}
                    disabled={selectedItemIndex === 0}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedItemIndex((current) => Math.min(items.length - 1, current + 1));
                      setRawExpanded(false);
                    }}
                    disabled={!items.length || selectedItemIndex >= items.length - 1}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>

            {currentItem ? (
              <StarLizQuestionCard
                subjectBadge={<span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-indigo-800">{meta.subject}</span>}
                attemptNumber={1}
                maxAttempts={3}
                progressLabel={`${selectedItemIndex + 1}/${items.length}`}
                contextLabel={`${meta.keyStage ?? "All key stages"} | ${meta.yearGroup ?? "All years"} | ${meta.topic ?? "General"}`}
                reviewNotice="Admin review preview. Answers and diagnostics are shown below the student-style card."
                learningFocus={meta.skillFocus ?? meta.topic}
                hint={hint || null}
                passageSlot={passage ? (
                  <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 text-slate-900">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Reading Passage</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6">{passage}</p>
                  </div>
                ) : null}
                coachPanel={coachSteps.length || workedSolution ? (
                  <div className="rounded-2xl border border-cyan-200 bg-white p-4 text-sm font-bold text-cyan-950">
                    {coachSteps.length ? coachSteps.map((step, idx) => <p key={`${step}-${idx}`}>{idx + 1}. {step}</p>) : null}
                    {workedSolution ? <p className="mt-2 whitespace-pre-wrap">{workedSolution}</p> : null}
                  </div>
                ) : null}
                coachOpen={Boolean(coachSteps.length || workedSolution)}
                questionPrompt={questionText}
                answerOptions={answerOptions.length ? answerOptions : undefined}
                answerValue=""
                actionButtonLabel="Preview only"
              />
            ) : (
              <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm font-bold text-rose-100">
                This content does not contain any reviewable generated items.
              </div>
            )}

            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <p className="text-xs font-bold text-slate-300">Admin Answer Review</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-200">Correct Answer</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm font-black text-white">{correctAnswer || "Not provided"}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-950 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-300">Difficulty</p>
                  <p className="mt-1 text-sm font-black text-white">Level {content.level} | {difficultyLabel(content.level)}</p>
                </div>
                <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-3 md:col-span-2">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-indigo-200">Current Item Level</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateCurrentItemLevel(Math.max(1, numericLevel(currentItem?.difficulty ?? currentItem?.level, content.level) - 1))}
                      className="rounded-lg border border-indigo-400/40 px-3 py-2 text-xs font-black text-indigo-100 hover:bg-indigo-500/10"
                    >
                      Demote item
                    </button>
                    <span className="rounded-full bg-slate-950 px-3 py-2 text-xs font-black text-white">
                      Item level {currentItemLevel} | {difficultyLabel(currentItemLevel)}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateCurrentItemLevel(Math.min(10, currentItemLevel + 1))}
                      className="rounded-lg border border-indigo-400/40 px-3 py-2 text-xs font-black text-indigo-100 hover:bg-indigo-500/10"
                    >
                      Move item up
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-indigo-100">Updates only this question. Re-run Black Box afterwards to refresh score and reasons.</p>
                </div>
              </div>
              {explanation ? (
                <div className="mt-3 rounded-lg border border-sky-500/20 bg-sky-500/10 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-200">Explanation</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-sky-50">{explanation}</p>
                </div>
              ) : null}
              {workedSolution ? (
                <div className="mt-3 rounded-lg border border-violet-500/20 bg-violet-500/10 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-200">Worked Solution</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-violet-50">{workedSolution}</p>
                </div>
              ) : null}
              {coachSteps.length ? (
                <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-200">Coach Steps</p>
                  <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm font-semibold text-cyan-50">
                    {coachSteps.map((step, idx) => <li key={`${step}-${idx}`}>{step}</li>)}
                  </ol>
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <button
                type="button"
                onClick={() => setRawExpanded((current) => !current)}
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800"
              >
                {rawExpanded ? "Hide raw data" : "Show raw data"}
              </button>
              {rawExpanded && currentItem ? (
                <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-300">
                  {JSON.stringify(currentItem, null, 2)}
                </pre>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-300">Black Box Content Test</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={rerunBlackBox}
                  disabled={blackBoxRetesting}
                  className="rounded-lg border border-indigo-400/40 px-3 py-1.5 text-xs font-black text-indigo-100 hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {blackBoxRetesting ? "Re-running..." : "Re-run Black Box"}
                </button>
                <span className={`rounded-full px-2 py-1 text-xs font-black ${getBlackBoxBadgeTone(blackBox)}`}>
                  {blackBox ? `${blackBox.decision}${typeof blackBox.score === "number" ? ` • ${blackBox.score}/100` : ""}` : "Not tested"}
                </span>
              </div>
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
                    <p className="font-bold text-slate-300">Current item checks</p>
                    <div className="mt-2 space-y-2">
                      {currentItemCheck ? (
                        <div className="rounded-lg border border-slate-700 bg-slate-950 p-2">
                          <p className="font-bold text-slate-300">Item {selectedItemIndex + 1}{typeof currentItemCheck.score === "number" ? ` • ${currentItemCheck.score}/100` : ""}</p>
                          <div className="mt-2 rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-2 text-indigo-50">
                            <p className="font-black text-indigo-100">Difficulty recommendation</p>
                            <div className="mt-1 grid gap-1">
                              <p>Current: Level {currentItemCheck.declaredLevel ?? currentItemLevel} | {difficultyLabel(currentItemCheck.declaredLevel ?? currentItemLevel)}</p>
                              <p>Black Box Estimate: Level {currentItemCheck.estimatedLevel ?? "N/A"}{typeof currentItemCheck.estimatedLevel === "number" ? ` | ${difficultyLabel(currentItemCheck.estimatedLevel)}` : ""}</p>
                              <p>Recommendation: {levelRecommendation?.reason ?? "No item-level difficulty recommendation available."}</p>
                            </div>
                            {typeof recommendedLevel === "number" && recommendedLevel !== currentItemLevel ? (
                              <button
                                type="button"
                                onClick={() => updateCurrentItemLevel(recommendedLevel)}
                                className="mt-2 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-black text-white hover:bg-indigo-400"
                              >
                                Apply Recommendation
                              </button>
                            ) : null}
                          </div>
                          {currentItemCheck.reasons && currentItemCheck.reasons.length > 0 ? (
                            <ul className="mt-1 list-disc space-y-1 pl-5">
                              {currentItemCheck.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                            </ul>
                          ) : null}
                          {currentItemCheck.checks ? (
                            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900 p-2 text-[11px] text-slate-400">
                              {JSON.stringify(currentItemCheck.checks, null, 2)}
                            </pre>
                          ) : null}
                        </div>
                      ) : (
                        <p>No item-specific Black Box check is stored for this question.</p>
                      )}
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
              <div><span className="font-bold">Subject:</span> {meta.subject}</div>
              <div><span className="font-bold">Topic:</span> {meta.topic || "General"}</div>
              <div><span className="font-bold">Skill Focus:</span> {meta.skillFocus || "Not tagged"}</div>
              <div><span className="font-bold">Year Group:</span> {meta.yearGroup || "All"}</div>
              <div><span className="font-bold">Key Stage:</span> {meta.keyStage || "All"}</div>
              <div><span className="font-bold">Content Type:</span> {content.contentType}</div>
              <div><span className="font-bold">Pathway:</span> {meta.curriculumPathway || "Not tagged"}</div>
              <div><span className="font-bold">Exam Board:</span> {meta.examBoard || "Not tagged"}</div>
              <div><span className="font-bold">Age Group:</span> {meta.ageGroup || "Any"}</div>
              <div><span className="font-bold">Level:</span> {content.level} | {difficultyLabel(content.level)}</div>
              <div><span className="font-bold">Strand/module:</span> {strand || blackBox?.reclassificationRecommendation?.strand || "Not tagged"}</div>
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
