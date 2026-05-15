"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type SubscriptionRow = {
  parentId: string;
  parentName: string | null;
  parentEmail: string;
  planKey: string;
  planName: string;
  status: "active" | "trialing" | "past_due" | "cancelled" | "failed_payment" | "suspended";
  trialStatus: string | null;
  trialEndDate: string | null;
  renewalDate: string | null;
  amountLabel: string;
  billingCycle: "monthly" | "yearly";
  childLimit: number;
  paymentProvider: "stripe" | "paystack" | string;
  paymentMethod: string;
  stripeCustomerId: string | null;
  paystackCustomerId: string | null;
  lastPaymentDate: string | null;
};

type Metrics = {
  totalParents: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  churnedSubscriptions: number;
  failedPayments: number;
  mrrLabel: string;
  monthRevenueLabel: string;
};

type ActionType =
  | "change_plan"
  | "cancel_subscription"
  | "pause_subscription"
  | "resume_subscription"
  | "extend_trial"
  | "send_payment_reminder";

const DEFAULT_METRICS: Metrics = {
  totalParents: 0,
  activeSubscriptions: 0,
  trialSubscriptions: 0,
  churnedSubscriptions: 0,
  failedPayments: 0,
  mrrLabel: "GBP 0.00",
  monthRevenueLabel: "GBP 0.00",
};

const PLAN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "free", label: "Free" },
  { value: "starter", label: "Starter" },
  { value: "standard", label: "Standard" },
  { value: "pro", label: "Pro" },
  { value: "enterprise", label: "Enterprise / Custom" },
];

const STATUS_OPTIONS: Array<{ value: SubscriptionRow["status"]; label: string }> = [
  { value: "active", label: "Active" },
  { value: "trialing", label: "Trial" },
  { value: "past_due", label: "Past Due" },
  { value: "failed_payment", label: "Failed Payment" },
  { value: "cancelled", label: "Cancelled" },
  { value: "suspended", label: "Suspended" },
];

function formatDate(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString();
}

export default function SubscriptionsPage() {
  const searchParams = useSearchParams();
  const requestedParentId = searchParams.get("parentId");
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [metrics, setMetrics] = useState<Metrics>(DEFAULT_METRICS);
  const [loading, setLoading] = useState(true);
  const [workingParentId, setWorkingParentId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(() => requestedParentId ?? "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [canManagePlans, setCanManagePlans] = useState(false);

  const loadRows = useCallback(async (withLoading = true) => {
    if (withLoading) setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/subscriptions", { credentials: "include" });
      if (!response.ok) {
        setError("Unable to load subscriptions.");
        return;
      }
      const payload = (await response.json()) as { rows: SubscriptionRow[]; metrics: Metrics; canManagePlans?: boolean };
      setRows(payload.rows ?? []);
      setMetrics(payload.metrics ?? DEFAULT_METRICS);
      setCanManagePlans(Boolean(payload.canManagePlans));
    } catch {
      setError("Unable to load subscriptions.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function runAction(row: SubscriptionRow, action: ActionType) {
    setWorkingParentId(row.parentId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          parentId: row.parentId,
          action,
          planKey: row.planKey,
          status: row.status,
          renewalDate: row.renewalDate,
          trialDays: action === "extend_trial" ? 7 : undefined,
        }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to run action.");
        return;
      }
      setMessage(payload.message ?? `Action applied for ${row.parentEmail}.`);
      await loadRows();
    } catch {
      setError("Unable to run action.");
    } finally {
      setWorkingParentId(null);
    }
  }

  function updateLocalRow(parentId: string, partial: Partial<SubscriptionRow>) {
    setRows((current) =>
      current.map((row) => (row.parentId === parentId ? { ...row, ...partial } : row))
    );
  }

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      const searchMatch =
        !needle ||
        row.parentId.toLowerCase().includes(needle) ||
        row.parentEmail.toLowerCase().includes(needle) ||
        (row.parentName ?? "").toLowerCase().includes(needle);
      const statusMatch = statusFilter === "all" || row.status === statusFilter;
      const planMatch = planFilter === "all" || row.planKey === planFilter;
      return searchMatch && statusMatch && planMatch;
    });
  }, [planFilter, rows, search, statusFilter]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadRows(false);
    }, 0);

    return () => {
      window.clearTimeout(id);
    };
  }, [loadRows]);

  return (
    <AdminSectionCard
      title="Subscriptions"
      eyebrow="Billing & Access"
      className="border-slate-700/80 bg-gradient-to-b from-slate-900/95 via-slate-900/85 to-slate-950/90"
    >
      {loading ? <p className="text-sm text-slate-400">Loading subscriptions...</p> : null}
      {error ? (
        <p className="mb-3 rounded-xl border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mb-3 rounded-xl border border-emerald-500/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
          {message}
        </p>
      ) : null}

      <div className="mb-4 rounded-2xl border border-slate-700/80 bg-slate-950/70 p-4 text-xs text-slate-300">
        <p className="font-semibold text-slate-200">Subscription operations</p>
        <p className="mt-1">Stripe is enabled for operations and checkout. Paystack values are retained in data but operational actions remain hidden.</p>
      </div>

      {!canManagePlans ? (
        <div className="mb-4 rounded-2xl border border-amber-500/45 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          You have read-only access. Ask a Super Admin to grant the <span className="font-semibold">parents:write</span> permission to update parent plans.
        </div>
      ) : null}

      <section className="mb-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <article className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">MRR</p>
          <p className="mt-1 text-xl font-bold text-white">{metrics.mrrLabel}</p>
        </article>
        <article className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Revenue (Month)</p>
          <p className="mt-1 text-xl font-bold text-white">{metrics.monthRevenueLabel}</p>
        </article>
        <article className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Active</p>
          <p className="mt-1 text-xl font-bold text-white">{metrics.activeSubscriptions}</p>
        </article>
        <article className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Trials</p>
          <p className="mt-1 text-xl font-bold text-white">{metrics.trialSubscriptions}</p>
        </article>
        <article className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Churned</p>
          <p className="mt-1 text-xl font-bold text-white">{metrics.churnedSubscriptions}</p>
        </article>
        <article className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Failed / Past Due</p>
          <p className="mt-1 text-xl font-bold text-white">{metrics.failedPayments}</p>
        </article>
      </section>

      <div className="mb-4 grid gap-3 rounded-2xl border border-slate-700/70 bg-slate-950/55 p-3 sm:grid-cols-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by parent email, name, or parent ID"
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
        />
        <select
          value={planFilter}
          onChange={(event) => setPlanFilter(event.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
        >
          <option value="all">All plans</option>
          {PLAN_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
        >
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="max-w-full overflow-x-auto rounded-2xl border border-slate-700/80">
        <table className="min-w-[1040px] w-full table-auto text-left text-sm">
          <thead className="bg-slate-900/95 text-xs uppercase tracking-[0.16em] text-slate-300">
            <tr>
              <th className="px-3 py-2">Parent</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Trial End</th>
              <th className="px-3 py-2">Renewal</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Child Limit</th>
              <th className="px-3 py-2">Cycle</th>
              <th className="px-3 py-2">Provider</th>
              <th className="hidden xl:table-cell px-3 py-2">Payment Method</th>
              <th className="hidden 2xl:table-cell px-3 py-2">Stripe Customer</th>
              <th className="hidden lg:table-cell px-3 py-2">Last Payment</th>
              <th className="sticky right-0 z-20 border-l border-slate-800 bg-slate-900/95 px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.parentId} className="border-t border-slate-800 bg-slate-950/40 align-top">
                <td className="px-3 py-3">
                  <p className="font-semibold text-white">{row.parentName ?? "Parent"}</p>
                  <p className="text-xs text-slate-400">{row.parentEmail}</p>
                </td>
                <td className="px-3 py-3">
                  <select
                    value={row.planKey}
                    onChange={(event) =>
                      updateLocalRow(row.parentId, { planKey: event.target.value })
                    }
                    disabled={!canManagePlans || workingParentId === row.parentId}
                    className="min-w-[5.5rem] w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {PLAN_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-3">
                  <select
                    value={row.status}
                    onChange={(event) =>
                      updateLocalRow(row.parentId, { status: event.target.value as SubscriptionRow["status"] })
                    }
                    disabled={!canManagePlans || workingParentId === row.parentId}
                    className="min-w-[5.5rem] w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-3 text-slate-200">{formatDate(row.trialEndDate)}</td>
                <td className="px-3 py-3">
                  <input
                    type="date"
                    value={row.renewalDate ? row.renewalDate.slice(0, 10) : ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      updateLocalRow(row.parentId, {
                        renewalDate: value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null,
                      });
                    }}
                    disabled={!canManagePlans || workingParentId === row.parentId}
                    className="min-w-[8.5rem] w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </td>
                <td className="px-3 py-3 text-slate-200">{row.amountLabel}</td>
                <td className="px-3 py-3 text-slate-200">{row.childLimit}</td>
                <td className="px-3 py-3 text-slate-200">{row.billingCycle}</td>
                <td className="px-3 py-3 text-slate-200">{row.paymentProvider === "stripe" ? "Stripe" : "Paystack"}</td>
                <td className="hidden xl:table-cell px-3 py-3 text-slate-200">{row.paymentMethod}</td>
                <td className="hidden 2xl:table-cell px-3 py-3">
                  <p className="max-w-[220px] truncate text-xs text-slate-300">{row.stripeCustomerId ?? "-"}</p>
                </td>
                <td className="hidden lg:table-cell px-3 py-3 text-slate-200">{formatDate(row.lastPaymentDate)}</td>
                <td className="sticky right-0 z-10 border-l border-slate-800 bg-slate-950/95 px-3 py-3">
                  <div className="grid gap-2">
                    <button
                      type="button"
                      onClick={() => void runAction(row, "change_plan")}
                      disabled={!canManagePlans || workingParentId === row.parentId}
                      className="rounded-lg bg-indigo-500 px-2 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-400 disabled:opacity-50"
                    >
                      Upgrade / Update
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAction(row, "extend_trial")}
                      disabled={!canManagePlans || workingParentId === row.parentId}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] font-semibold text-slate-200"
                    >
                      Extend +7d
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAction(row, "pause_subscription")}
                      disabled={!canManagePlans || workingParentId === row.parentId}
                      className="rounded-lg border border-amber-700 bg-amber-950/40 px-2 py-1.5 text-[11px] font-semibold text-amber-200"
                    >
                      Pause
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAction(row, "resume_subscription")}
                      disabled={!canManagePlans || workingParentId === row.parentId}
                      className="rounded-lg border border-emerald-700 bg-emerald-950/40 px-2 py-1.5 text-[11px] font-semibold text-emerald-200"
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAction(row, "cancel_subscription")}
                      disabled={!canManagePlans || workingParentId === row.parentId}
                      className="rounded-lg border border-rose-700 bg-rose-950/40 px-2 py-1.5 text-[11px] font-semibold text-rose-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAction(row, "send_payment_reminder")}
                      disabled={!canManagePlans || workingParentId === row.parentId}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] font-semibold text-slate-200"
                    >
                      Remind
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && filteredRows.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-3 py-6 text-center text-sm text-slate-400">
                  No subscriptions match your filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminSectionCard>
  );
}
