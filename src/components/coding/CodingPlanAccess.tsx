"use client";
import { useEffect, useState } from "react";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
type Plan = { id: string; name: string; audience: string; codingIncluded: boolean; revision: string; active: boolean };
export default function CodingPlanAccess() {
  const [plans, setPlans] = useState<Plan[]>([]), [drafts, setDrafts] = useState<Record<string, boolean>>({}), [busy, setBusy] = useState(""), [message, setMessage] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    fetchWithRefreshRetry("/api/admin/coding/access", { signal: abort.signal, cache: "no-store" }).then(async (response) => {
      if (response.status === 403) return;
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.plans)) throw new Error(data.error ?? "Subscription access could not be loaded.");
      if (!abort.signal.aborted) setPlans(data.plans);
    }).catch((failure) => { if (!abort.signal.aborted) setMessage(failure instanceof Error ? failure.message : "Subscription access is unavailable."); });
    return () => abort.abort();
  }, []);
  async function save(plan: Plan) {
    setBusy(plan.id); setMessage("");
    try {
      const response = await fetchWithRefreshRetry("/api/admin/coding/access", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: plan.id, codingIncluded: drafts[plan.id] ?? plan.codingIncluded, revision: plan.revision }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Access could not be saved.");
      setPlans((previous) => previous.map((item) => item.id === plan.id ? { ...item, codingIncluded: data.codingIncluded, revision: data.revision } : item));
      setDrafts((previous) => { const next = { ...previous }; delete next[plan.id]; return next; });
      setMessage(`Coding access saved for ${plan.name}.`);
    } catch (failure) { setMessage(failure instanceof Error ? failure.message : "Keep your selection and retry."); }
    finally { setBusy(""); }
  }
  if (!plans.length) return message ? <p role="status" className="text-sm text-amber-200">{message}</p> : null;
  return <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5"><h2 className="text-xl font-bold">Coding subscription access</h2><p className="text-sm text-slate-300">Choose which existing home and school plans include Coding. Saving a change affects access for subscriptions and licences using that plan.</p><ul className="space-y-3">{plans.map((plan) => <li key={plan.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-600 p-3"><label className="flex min-h-11 items-center gap-3 text-sm"><input className="h-5 w-5 accent-sky-600" type="checkbox" checked={drafts[plan.id] ?? plan.codingIncluded} disabled={Boolean(busy)} onChange={(event) => setDrafts((previous) => ({ ...previous, [plan.id]: event.target.checked }))} /><span><span className="font-semibold">{plan.name}</span><span className="block text-xs text-slate-400">{plan.audience} · {plan.active ? "Active plan" : "Inactive plan"}</span></span></label><button className="min-h-11 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={Boolean(busy) || drafts[plan.id] === undefined || drafts[plan.id] === plan.codingIncluded} type="button" onClick={() => void save(plan)}>{busy === plan.id ? "Saving…" : "Save access"}</button></li>)}</ul>{message && <p role="status" className="text-sm text-sky-200">{message}</p>}</section>;
}
