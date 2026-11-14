"use client";
import { useEffect, useState } from "react";
import type { EvidenceManifest } from "@/lib/coding/learning/evidence-links";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
type Choice = { versionId: string; stage: string; practicalCandidate?: boolean; activity: { id: string; title: string } };

export default function EvidenceSelection({ activityId, required, current, bookingId, disabled, onApply }: {
  activityId: string; required: 1 | 2; current: EvidenceManifest; bookingId?: string; disabled: boolean;
  onApply: (selection: Array<{ slot: "first" | "second"; versionId: string }>) => void;
}) {
  const [entries, setEntries] = useState<Choice[] | null>(null), [error, setError] = useState("");
  const [first, setFirst] = useState(current.find((item) => item.slot === "first")?.versionId ?? ""), [second, setSecond] = useState(current.find((item) => item.slot === "second")?.versionId ?? "");
  useEffect(() => {
    const abort = new AbortController(), query = new URLSearchParams({ purpose: "link" }); if (bookingId) query.set("bookingId", bookingId);
    fetchWithRefreshRetry(`/api/student/coding/evidence?${query}`, { signal: abort.signal, cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.projects)) throw new Error(body.error ?? "Saved creations could not be opened.");
      if (!abort.signal.aborted) {
        const distinct = new Map<string, Choice>();
        for (const entry of body.projects as Choice[]) if (entry.practicalCandidate && entry.activity.id !== activityId && !distinct.has(entry.activity.id)) distinct.set(entry.activity.id, entry);
        for (const bound of current) if (!distinct.has(bound.activityId)) distinct.set(bound.activityId, { versionId: bound.versionId, stage: "saved", practicalCandidate: true, activity: { id: bound.activityId, title: bound.title } });
        setEntries([...distinct.values()]);
      }
    }).catch((failure) => { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : "Saved creations are unavailable."); });
    return () => abort.abort();
  }, [activityId, bookingId, current]);
  const selectedFirst = entries?.find((entry) => entry.versionId === first), selectedSecond = entries?.find((entry) => entry.versionId === second);
  const ready = selectedFirst && (required === 1 || selectedSecond && selectedSecond.activity.id !== selectedFirst.activity.id);
  return <fieldset disabled={disabled} className="min-w-0 space-y-3 rounded-xl border border-sky-300 bg-sky-50 p-4"><legend className="px-1 font-bold">Link your actual saved creations</legend>
    <p className="text-sm leading-6">Choose earlier private creations with saved practical results. The server checks ownership and frozen content before linking. This does not publish your work or grant an achievement.</p>
    {error && <p role="alert" className="text-sm text-amber-950">{error}</p>}
    {!entries && !error && <p role="status" className="text-sm">Opening your saved creation choices…</p>}
    {entries && entries.length < required && <p className="text-sm text-amber-950">You need practical-result versions from {required} different earlier activities. Keep your draft here and complete those practical checks first.</p>}
    {(["first", "second"] as const).slice(0, required).map((slot) => <label key={slot} className="block text-sm font-semibold">{slot === "first" ? "First saved creation" : "Second saved creation"}<select className="mt-2 min-h-11 w-full rounded-lg border border-slate-400 bg-white p-3 text-slate-950" value={slot === "first" ? first : second} onChange={(event) => slot === "first" ? setFirst(event.target.value) : setSecond(event.target.value)}><option value="">Choose a creation</option>{entries?.map((entry) => <option key={entry.versionId} value={entry.versionId}>{entry.activity.title} · {entry.stage}</option>)}</select></label>)}
    <button type="button" className="min-h-11 rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!ready} onClick={() => onApply([{ slot: "first", versionId: first }, ...(required === 2 ? [{ slot: "second" as const, versionId: second }] : [])])}>Use selected private evidence</button>
    {current.map((entry) => <p key={entry.slot} className="break-words text-sm"><strong>{entry.slot === "first" ? "First" : "Second"} bound creation:</strong> {entry.title}</p>)}
  </fieldset>;
}
