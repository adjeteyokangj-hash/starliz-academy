"use client";
import { useEffect, useRef, useState } from "react";
import type { DemonstrationAttachment } from "@/lib/coding/learning/demonstration-contract";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";

export default function PrivateDemonstrationPlayer({ attachment, activityId, childId, audience = "learner", bookingId }: { attachment: DemonstrationAttachment; activityId: string; childId?: string; audience?: "learner" | "parent"; bookingId?: string }) {
  const [clip, setClip] = useState<{ receipt: string; url: string } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const current = useRef(attachment.receipt);
  useEffect(() => { current.current = attachment.receipt; return () => { current.current = ""; }; }, [attachment.receipt]);
  useEffect(() => () => { if (clip) URL.revokeObjectURL(clip.url); }, [clip]);
  async function open() {
    setBusy(true); setError(""); const receipt = attachment.receipt;
    try {
      const response = await fetchWithRefreshRetry(audience === "parent" ? "/api/parent/coding/demonstrations" : "/api/student/coding/demonstrations/read", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attachment, activityId, ...(audience === "parent" ? { studentId: childId } : { bookingId }) }) });
      if (!response.ok) throw new Error("This private recording could not be opened. The written alternative remains available.");
      const blob = await response.blob(); if (current.current === receipt) setClip({ receipt, url: URL.createObjectURL(blob) });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The private recording could not be opened."); } finally { setBusy(false); }
  }
  return <section className="min-w-0 space-y-3 rounded-xl border border-slate-300 bg-white p-4" aria-label="Original private project demonstration"><h3 className="font-bold">Original project demonstration</h3><p className="text-sm text-slate-600">Private video and written alternative, saved with this source version.</p>{clip?.receipt === attachment.receipt ? <video className="max-h-96 w-full rounded-lg bg-slate-950" controls preload="metadata" playsInline src={clip.url} aria-label="Original private project demonstration video" /> : <button type="button" disabled={busy} onClick={() => void open()} className="min-h-11 rounded-lg border border-slate-400 px-4 py-2 font-semibold disabled:opacity-50">{busy ? "Opening private recording…" : "Open private recording"}</button>}{error && <p role="alert" className="text-sm text-red-800">{error}</p>}<div><h4 className="font-semibold">Written alternative</h4><p className="whitespace-pre-wrap break-words text-sm">{attachment.metadata.transcript}</p></div><p className="break-words text-sm"><strong>Source and permission:</strong> {attachment.metadata.rights}</p><p className="break-words text-sm"><strong>Limit:</strong> {attachment.metadata.limitation}</p></section>;
}
