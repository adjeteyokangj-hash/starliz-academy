"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type SubscriptionRow = {
  parentId: string; parentName: string | null; parentEmail: string; subscriptionId: string | null;
  planKey: string; planName: string; status: string; statusCode: string; statusLabel: string;
  statusTone: "ok" | "warning" | "danger" | "neutral"; statusDetail: string; cancelScheduled: boolean;
  accessEndsAt: string | null; graceEndsAt: string | null; trialStatus: string | null; trialEndDate: string | null;
  renewalDate: string | null; amountLabel: string; billingCycle: "monthly" | "yearly"; childLimit: number;
  paymentProvider: string; paymentMethod: string; hasProviderCustomer: boolean; lastUpdatedAt: string | null;
};
type Metrics = { totalParents: number; activeSubscriptions: number; trialSubscriptions: number; churnedSubscriptions: number; failedPayments: number; mrrLabel: string; monthRevenueLabel: string };
type ActionType = "cancel_at_period_end" | "reactivate" | "send_payment_reminder";
type PricingPlan = { id: string; name: string; price: number; currency: string; interval: string; childLimit: number };
type ManualAction = "grant" | "change_plan" | "extend";

const DEFAULT_METRICS: Metrics = { totalParents: 0, activeSubscriptions: 0, trialSubscriptions: 0, churnedSubscriptions: 0, failedPayments: 0, mrrLabel: "£0.00", monthRevenueLabel: "£0.00" };

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function toneClass(tone: SubscriptionRow["statusTone"]) {
  if (tone === "ok") return "text-emerald-200";
  if (tone === "warning") return "text-amber-200";
  if (tone === "danger") return "text-rose-200";
  return "text-slate-200";
}

export default function SubscriptionsPage() {
  const searchParams = useSearchParams();
  const requestedParentId = searchParams.get("parentId");
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [metrics, setMetrics] = useState<Metrics>(DEFAULT_METRICS);
  const [loading, setLoading] = useState(true);
  const [workingParentId, setWorkingParentId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(() => requestedParentId ?? "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [canManagePlans, setCanManagePlans] = useState(false);
  const [manageRow, setManageRow] = useState<SubscriptionRow | null>(null);
  const [manualAction, setManualAction] = useState<ManualAction>("grant");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [months, setMonths] = useState(1);

  const loadRows = useCallback(async (withLoading = true) => {
    if (withLoading) setLoading(true);
    setError(null);
    try {
      const [subscriptionsResponse, plansResponse] = await Promise.all([
        fetch("/api/admin/subscriptions", { credentials: "include" }),
        fetch("/api/admin/subscriptions/manual", { credentials: "include" }),
      ]);
      if (!subscriptionsResponse.ok) { setError("Unable to load subscriptions."); return; }
      const payload = await subscriptionsResponse.json() as { rows: SubscriptionRow[]; metrics: Metrics; canManagePlans?: boolean };
      setRows(payload.rows ?? []); setMetrics(payload.metrics ?? DEFAULT_METRICS); setCanManagePlans(Boolean(payload.canManagePlans));
      if (plansResponse.ok) {
        const planPayload = await plansResponse.json() as { plans?: PricingPlan[] };
        const nextPlans = planPayload.plans ?? [];
        setPlans(nextPlans);
        setSelectedPlanId((current) => current || nextPlans[0]?.id || "");
      }
    } catch { setError("Unable to load subscriptions."); }
    finally { setLoading(false); }
  }, []);

  async function runAction(row: SubscriptionRow, action: ActionType) {
    setWorkingParentId(row.parentId); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/admin/subscriptions", { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ parentId: row.parentId, action }) });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) { setError(payload.error ?? "Unable to run action."); await loadRows(false); return; }
      setMessage(payload.message ?? `Action applied for ${row.parentEmail}.`); await loadRows(false);
    } catch { setError("Unable to run action."); }
    finally { setWorkingParentId(null); }
  }

  function openManage(row: SubscriptionRow) {
    setManageRow(row);
    setManualAction(row.subscriptionId ? "extend" : "grant");
    setMonths(1);
    const matching = plans.find((plan) => plan.name.toLowerCase() === row.planName.toLowerCase());
    setSelectedPlanId(matching?.id ?? plans[0]?.id ?? "");
    setError(null); setMessage(null);
  }

  async function saveManualAction() {
    if (!manageRow) return;
    if (manualAction !== "extend" && !selectedPlanId) { setError("Select a subscription plan."); return; }
    setWorkingParentId(manageRow.parentId); setError(null); setMessage(null);
    try {
      const body = manualAction === "extend"
        ? { parentId: manageRow.parentId, action: manualAction, months }
        : manualAction === "grant"
          ? { parentId: manageRow.parentId, action: manualAction, pricingPlanId: selectedPlanId, months }
          : { parentId: manageRow.parentId, action: manualAction, pricingPlanId: selectedPlanId };
      const response = await fetch("/api/admin/subscriptions/manual", { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) { setError(payload.error ?? "Unable to update subscription."); return; }
      setMessage(payload.message ?? "Subscription updated."); setManageRow(null); await loadRows(false);
    } catch { setError("Unable to update subscription."); }
    finally { setWorkingParentId(null); }
  }

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      const searchMatch = !needle || row.parentId.toLowerCase().includes(needle) || row.parentEmail.toLowerCase().includes(needle) || (row.parentName ?? "").toLowerCase().includes(needle);
      const statusMatch = statusFilter === "all" || row.status === statusFilter || row.statusCode === statusFilter || (statusFilter === "payment_attention" && ["past_due", "failed_payment", "unpaid", "incomplete"].includes(row.status));
      return searchMatch && statusMatch;
    });
  }, [rows, search, statusFilter]);

  useEffect(() => { void loadRows(false); }, [loadRows]);

  return (
    <AdminSectionCard title="Subscriptions" eyebrow="Billing & Access" className="border-slate-700/80 bg-slate-950/90">
      {loading ? <p className="text-sm text-slate-400">Loading subscriptions…</p> : null}
      {error ? <p role="alert" className="mb-3 rounded-xl border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
      {message ? <p role="status" className="mb-3 rounded-xl border border-emerald-500/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">{message}</p> : null}

      <div className="mb-4 rounded-2xl border border-cyan-700/60 bg-cyan-950/25 p-4 text-xs text-cyan-100">
        <p className="font-semibold">Admin-managed access</p>
        <p className="mt-1 text-cyan-200/80">Stripe is deferred. Admin can grant, change, or extend customer access directly. Manual actions are recorded in the audit trail.</p>
      </div>

      {!canManagePlans ? <div className="mb-4 rounded-2xl border border-amber-500/45 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">You have read-only access. Subscription management permission is required.</div> : null}

      <section className="mb-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[["MRR", metrics.mrrLabel], ["Active plan revenue", metrics.monthRevenueLabel], ["Active", String(metrics.activeSubscriptions)], ["Trials", String(metrics.trialSubscriptions)], ["Cancelled / ended", String(metrics.churnedSubscriptions)], ["Payment attention", String(metrics.failedPayments)]].map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-3"><p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{label}</p><p className="mt-1 text-xl font-bold text-white">{value}</p></article>
        ))}
      </section>

      <div className="mb-4 grid gap-3 rounded-2xl border border-slate-700/70 bg-slate-950/55 p-3 sm:grid-cols-2">
        <label className="block text-xs text-slate-400">Search<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Parent email, name, or ID" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" /></label>
        <label className="block text-xs text-slate-400">Status filter<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"><option value="all">All statuses</option><option value="active">Active</option><option value="trialing">Trial</option><option value="payment_attention">Payment needs attention</option><option value="cancel_at_period_end">Cancels at period end</option><option value="cancelled">Cancelled / expired</option></select></label>
      </div>

      <div className="max-w-full overflow-x-auto rounded-2xl border border-slate-700/80">
        <table className="min-w-[1050px] w-full table-auto text-left text-sm">
          <thead className="bg-slate-900/95 text-xs uppercase tracking-[0.16em] text-slate-300"><tr><th className="px-3 py-2">Parent</th><th className="px-3 py-2">Plan</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Access / renewal</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Provider</th><th className="sticky right-0 z-20 border-l border-slate-800 bg-slate-900/95 px-3 py-2">Actions</th></tr></thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.parentId} className="border-t border-slate-800 bg-slate-950/40 align-top">
                <td className="px-3 py-3"><p className="font-semibold text-white">{row.parentName ?? "Parent"}</p><p className="text-xs text-slate-400">{row.parentEmail}</p></td>
                <td className="px-3 py-3 text-slate-200"><p>{row.planName}</p><p className="text-xs text-slate-500">{row.billingCycle} · {row.childLimit} child limit</p></td>
                <td className="px-3 py-3"><p className={`font-semibold ${toneClass(row.statusTone)}`}>{row.statusLabel}</p><p className="mt-1 max-w-[18rem] text-xs text-slate-400">{row.statusDetail}</p></td>
                <td className="px-3 py-3 text-slate-200"><p>Renewal: {formatDate(row.renewalDate)}</p><p className="text-xs text-slate-400">Access ends: {formatDate(row.accessEndsAt)}</p>{row.graceEndsAt ? <p className="text-xs text-amber-200">Grace until: {formatDate(row.graceEndsAt)}</p> : null}</td>
                <td className="px-3 py-3 text-slate-200">{row.amountLabel}</td>
                <td className="px-3 py-3 text-slate-200">{row.paymentProvider === "manual" ? "Admin / Manual" : row.hasProviderCustomer ? "Linked" : "Not linked"}</td>
                <td className="sticky right-0 z-10 border-l border-slate-800 bg-slate-950/95 px-3 py-3"><div className="grid gap-2">
                  <button type="button" onClick={() => openManage(row)} disabled={!canManagePlans || workingParentId === row.parentId} className="rounded-lg border border-cyan-600 bg-cyan-950/50 px-2 py-1.5 text-[11px] font-semibold text-cyan-100 disabled:opacity-50">{row.subscriptionId ? "Manage subscription" : "Grant subscription"}</button>
                  <button type="button" onClick={() => void runAction(row, "cancel_at_period_end")} disabled={!canManagePlans || workingParentId === row.parentId || !row.subscriptionId} className="rounded-lg border border-rose-700 bg-rose-950/40 px-2 py-1.5 text-[11px] font-semibold text-rose-200 disabled:opacity-50">Cancel at period end</button>
                  <button type="button" onClick={() => void runAction(row, "reactivate")} disabled={!canManagePlans || workingParentId === row.parentId || !row.cancelScheduled} className="rounded-lg border border-emerald-700 bg-emerald-950/40 px-2 py-1.5 text-[11px] font-semibold text-emerald-200 disabled:opacity-50">Reactivate</button>
                  <button type="button" onClick={() => void runAction(row, "send_payment_reminder")} disabled={!canManagePlans || workingParentId === row.parentId} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] font-semibold text-slate-200 disabled:opacity-50">Send payment notice</button>
                </div></td>
              </tr>
            ))}
            {!loading && filteredRows.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-400">No subscriptions match your filters.</td></tr> : null}
          </tbody>
        </table>
      </div>

      {manageRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Manage subscription">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-950 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><p className="text-lg font-bold text-white">Manage subscription</p><p className="text-sm text-slate-400">{manageRow.parentName ?? "Parent"} · {manageRow.parentEmail}</p></div><button type="button" onClick={() => setManageRow(null)} className="rounded-lg border border-slate-700 px-3 py-1 text-sm text-slate-300">Close</button></div>
            <div className="mt-4 grid gap-3">
              <label className="text-xs text-slate-400">Action<select value={manualAction} onChange={(e) => setManualAction(e.target.value as ManualAction)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"><option value="grant">Grant / replace access</option>{manageRow.subscriptionId ? <><option value="change_plan">Change plan</option><option value="extend">Extend subscription</option></> : null}</select></label>
              {manualAction !== "extend" ? <label className="text-xs text-slate-400">Plan<select value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.currency} {plan.price.toFixed(2)} · {plan.childLimit} child limit</option>)}</select></label> : null}
              {manualAction !== "change_plan" ? <label className="text-xs text-slate-400">Duration / extension<select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"><option value={1}>1 month</option><option value={3}>3 months</option><option value={6}>6 months</option><option value={12}>12 months</option><option value={24}>24 months</option></select></label> : null}
              {manualAction === "extend" ? <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300">Current access ends: <strong>{formatDate(manageRow.accessEndsAt)}</strong>. The extension is added after the current end date, so existing access is not shortened.</p> : null}
              <button type="button" onClick={() => void saveManualAction()} disabled={workingParentId === manageRow.parentId || (manualAction !== "extend" && !selectedPlanId)} className="mt-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{workingParentId === manageRow.parentId ? "Saving…" : "Save subscription"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminSectionCard>
  );
}
