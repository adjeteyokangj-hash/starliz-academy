"use client";

import { useEffect, useState } from "react";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";

export default function CodingAssistanceSettings() {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    void fetchWithRefreshRetry("/api/admin/coding/settings").then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Settings could not be loaded.");
      if (!cancelled) { setEnabled(data.humanAssistanceEnabled === true); setReady(true); }
    }).catch((error) => { if (!cancelled) setMessage(error.message); });
    return () => { cancelled = true; };
  }, []);
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetchWithRefreshRetry("/api/admin/coding/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ humanAssistanceEnabled: enabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Settings could not be saved.");
      setEnabled(data.humanAssistanceEnabled === true);
      setMessage("Coding assistance settings saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Settings could not be saved."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
    <h2 className="font-bold">Coding teacher assistance</h2>
    <p className="mt-2 text-sm text-slate-300">AI leads every lesson. Human assistance is disabled by default and requires an eligible session and an available tutor.</p>
    <label className="my-4 flex min-h-11 items-center gap-3"><input className="h-5 w-5" type="checkbox" checked={enabled} disabled={!ready || busy} onChange={(event) => setEnabled(event.target.checked)} />Enable optional human assistance</label>
    <button type="button" disabled={!ready || busy} onClick={() => void save()} className="min-h-11 rounded-xl bg-violet-600 px-4 py-2 font-bold disabled:opacity-50">{busy ? "Saving…" : "Save settings"}</button>
    <p role="status" className="mt-2 text-sm">{message}</p>
  </section>;
}
