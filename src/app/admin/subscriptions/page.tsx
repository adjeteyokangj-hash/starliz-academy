"use client";

import { useEffect, useState } from "react";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type SubscriptionRow = {
  parentId: string;
  parentEmail: string;
  planKey: "free" | "monthly" | "yearly";
  plan: string;
  status: "active" | "trialing" | "cancelled" | "past_due" | "blocked";
  childLimit: number;
  childrenUsed: number;
  renewalDate: string | null;
  paymentProvider: "stripe" | "paystack" | string;
  badge: string;
  paymentFailed: boolean;
};

const PLAN_OPTIONS: Array<{ value: SubscriptionRow["planKey"]; label: string }> = [
  { value: "free", label: "Free" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const STATUS_OPTIONS: Array<{ value: SubscriptionRow["status"]; label: string }> = [
  { value: "active", label: "Active" },
  { value: "trialing", label: "Trial" },
  { value: "cancelled", label: "Cancelled" },
  { value: "past_due", label: "Failed Payment" },
  { value: "blocked", label: "Blocked" },
];

export default function SubscriptionsPage() {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingFor, setSavingFor] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");

  async function loadRows() {
    setLoading(true);
    const response = await fetch("/api/admin/subscriptions", { credentials: "include" });
    if (!response.ok) {
      setError("Unable to load subscriptions.");
      setLoading(false);
      return;
    }
    const payload = (await response.json()) as { rows: SubscriptionRow[] };
    setRows(payload.rows ?? []);
    setLoading(false);
  }

  async function applyOverride(row: SubscriptionRow) {
    setSavingFor(row.parentId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          parentId: row.parentId,
          planKey: row.planKey,
          status: row.status,
          provider: row.paymentProvider,
          renewalDate: row.renewalDate,
        }),
      });
      if (!response.ok) {
        setError("Unable to save override.");
        return;
      }
      setMessage(`Subscription updated for ${row.parentEmail}.`);
      await loadRows();
    } catch {
      setError("Unable to save override.");
    } finally {
      setSavingFor(null);
    }
  }

  function updateRow(parentId: string, partial: Partial<SubscriptionRow>) {
    setRows((current) => current.map((row) => (row.parentId === parentId ? { ...row, ...partial } : row)));
  }

  const visibleRows = rows.filter((row) => {
    const searchLower = search.toLowerCase();
    const searchMatch = !searchLower || row.parentEmail.toLowerCase().includes(searchLower);
    const statusMatch = statusFilter === "all" || row.status === statusFilter;
    const planMatch = planFilter === "all" || row.planKey === planFilter;
    return searchMatch && statusMatch && planMatch;
  });

  useEffect(() => {
    let active = true;
    void (async () => {
      const response = await fetch("/api/admin/subscriptions", { credentials: "include" });
      if (!active) return;
      if (!response.ok) {
        setError("Unable to load subscriptions.");
        setLoading(false);
        return;
      }
      const payload = (await response.json()) as { rows: SubscriptionRow[] };
      setRows(payload.rows ?? []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <AdminSectionCard title="Subscriptions" eyebrow="Billing">
      {loading ? <p className="text-sm text-slate-400">Loading subscriptions...</p> : null}
      {error ? <p className="mb-3 rounded-xl border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
      {message ? <p className="mb-3 rounded-xl border border-emerald-500/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">{message}</p> : null}

      <div className="mb-4 rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-xs text-slate-300">
        Stripe is primary for UK launch billing. Paystack remains a future provider option and is not used for checkout yet.
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search parent email"
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
        />
        <select
          value={planFilter}
          onChange={(event) => setPlanFilter(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
        >
          <option value="all">All plans</option>
          {PLAN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
        >
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>

      <div className="grid gap-3">
        {visibleRows.map((row) => (
          <article key={row.parentId} className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-white">{row.parentEmail}</p>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-800 px-2 py-1 font-semibold text-slate-200">Children {row.childrenUsed}/{row.childLimit}</span>
                {row.paymentFailed ? <span className="rounded-full bg-rose-900/60 px-2 py-1 font-semibold text-rose-200">Failed payment</span> : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="text-xs font-semibold text-slate-400">Plan
                <select
                  value={row.planKey}
                  onChange={(event) => updateRow(row.parentId, { planKey: event.target.value as SubscriptionRow["planKey"] })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                >
                  {PLAN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>

              <label className="text-xs font-semibold text-slate-400">Status
                <select
                  value={row.status}
                  onChange={(event) => updateRow(row.parentId, { status: event.target.value as SubscriptionRow["status"] })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                >
                  {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>

              <label className="text-xs font-semibold text-slate-400">Renewal Date
                <input
                  type="date"
                  value={row.renewalDate ? row.renewalDate.slice(0, 10) : ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    updateRow(row.parentId, { renewalDate: value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null });
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                />
              </label>

              <label className="text-xs font-semibold text-slate-400">Provider
                <select
                  value={row.paymentProvider === "paystack" ? "paystack" : "stripe"}
                  onChange={(event) => updateRow(row.parentId, { paymentProvider: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                >
                  <option value="stripe">Stripe (Primary)</option>
                  <option value="paystack">Paystack (Future provider)</option>
                </select>
              </label>

              <div className="flex items-end">
                <button
                  onClick={() => void applyOverride(row)}
                  disabled={savingFor === row.parentId}
                  className="w-full rounded-lg bg-indigo-500 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-400 disabled:opacity-50"
                >
                  {savingFor === row.parentId ? "Saving..." : "Save Override"}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </AdminSectionCard>
  );
}

