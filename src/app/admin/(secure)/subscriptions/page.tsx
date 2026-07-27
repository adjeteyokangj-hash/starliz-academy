"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type SubscriptionRow = {
  parentId: string;
  parentName: string | null;
  parentEmail: string;
  subscriptionId: string | null;
  planKey: string;
  planName: string;
  status: string;
  statusCode: string;
  statusLabel: string;
  statusTone: "ok" | "warning" | "danger" | "neutral";
  statusDetail: string;
  cancelScheduled: boolean;
  accessEndsAt: string | null;
  graceEndsAt: string | null;
  trialStatus: string | null;
  trialEndDate: string | null;
  renewalDate: string | null;
  amountLabel: string;
  billingCycle: "monthly" | "yearly";
  childLimit: number;
  paymentProvider: string;
  paymentMethod: string;
  hasProviderCustomer: boolean;
  lastUpdatedAt: string | null;
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

type ActionType = "cancel_at_period_end" | "reactivate" | "send_payment_reminder" | "record_operational_note";

const DEFAULT_METRICS: Metrics = {
  totalParents: 0,
  activeSubscriptions: 0,
  trialSubscriptions: 0,
  churnedSubscriptions: 0,
  failedPayments: 0,
  mrrLabel: "£0.00",
  monthRevenueLabel: "£0.00",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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
  const [metrics, setMetrics] = useState<Metrics>(DEFAULT_METRICS);
  const [loading, setLoading] = useState(true);
  const [workingParentId, setWorkingParentId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(() => requestedParentId ?? "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [canManagePlans, setCanManagePlans] = useState(false);
  const [noteParentId, setNoteParentId] = useState(() => requestedParentId ?? "");
  const [noteText, setNoteText] = useState("");
  const [commercialNotes, setCommercialNotes] = useState<string[]>([]);

  const loadRows = useCallback(async (withLoading = true) => {
    if (withLoading) setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/subscriptions", { credentials: "include" });
      if (!response.ok) {
        setError("Unable to load subscriptions.");
        return;
      }
      const payload = (await response.json()) as {
        rows: SubscriptionRow[];
        metrics: Metrics;
        canManagePlans?: boolean;
        commercialNotes?: string[];
      };
      setRows(payload.rows ?? []);
      setMetrics(payload.metrics ?? DEFAULT_METRICS);
      setCanManagePlans(Boolean(payload.canManagePlans));
      setCommercialNotes(payload.commercialNotes ?? []);
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
        }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to run action.");
        await loadRows(false);
        return;
      }
      setMessage(payload.message ?? `Action applied for ${row.parentEmail}.`);
      await loadRows(false);
    } catch {
      setError("Unable to run action.");
    } finally {
      setWorkingParentId(null);
    }
  }

  async function recordNote() {
    const parentId = noteParentId.trim();
    if (!parentId || noteText.trim().length < 3) {
      setError("Enter a parent ID and a note of at least 3 characters.");
      return;
    }
    setWorkingParentId(parentId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          parentId,
          action: "record_operational_note",
          note: noteText.trim(),
        }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to record note.");
        return;
      }
      setMessage(payload.message ?? "Operational note recorded.");
      setNoteText("");
    } catch {
      setError("Unable to record note.");
    } finally {
      setWorkingParentId(null);
    }
  }

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      const searchMatch =
        !needle
        || row.parentId.toLowerCase().includes(needle)
        || row.parentEmail.toLowerCase().includes(needle)
        || (row.parentName ?? "").toLowerCase().includes(needle);
      const statusMatch =
        statusFilter === "all"
        || row.status === statusFilter
        || row.statusCode === statusFilter
        || (statusFilter === "payment_attention" && ["past_due", "failed_payment", "unpaid", "incomplete"].includes(row.status));
      return searchMatch && statusMatch;
    });
  }, [rows, search, statusFilter]);

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
      className="border-slate-700/80 bg-slate-950/90"
    >
      {loading ? <p className="text-sm text-slate-400">Loading subscriptions…</p> : null}
      {error ? (
        <p role="alert" className="mb-3 rounded-xl border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mb-3 rounded-xl border border-emerald-500/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
          {message}
        </p>
      ) : null}

      <div className="mb-4 rounded-2xl border border-slate-700/80 bg-slate-950/70 p-4 text-xs text-slate-300">
        <p className="font-semibold text-slate-200">Payment truth</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {(commercialNotes.length > 0
            ? commercialNotes
            : [
                "Payment status is payment-provider truth. Admin cannot activate paid access locally.",
                "Cancel at period end keeps access until the paid period ends.",
                "There is no cancellation fee and no automatic pro-rata refund.",
              ]
          ).map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>

      {!canManagePlans ? (
        <div className="mb-4 rounded-2xl border border-amber-500/45 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          You have read-only access. Ask a Super Admin to grant subscription management permission for cancel, reactivate, or payment notices.
        </div>
      ) : null}

      {canManagePlans ? (
        <section className="mb-4 rounded-2xl border border-slate-700/60 bg-slate-950/40 p-3">
          <p className="text-sm font-semibold text-slate-100">Record operational note</p>
          <p className="mt-1 text-xs text-slate-400">Does not change payment state. Stored in the audit trail only.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <label className="block text-xs text-slate-400">
              Parent ID
              <input
                value={noteParentId}
                onChange={(event) => setNoteParentId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Note
              <input
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </label>
            <button
              type="button"
              onClick={() => void recordNote()}
              disabled={workingParentId === noteParentId.trim()}
              className="self-end rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-100 disabled:opacity-50"
            >
              Save note
            </button>
          </div>
        </section>
      ) : null}

      <section className="mb-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["MRR", metrics.mrrLabel],
          ["Active plan revenue", metrics.monthRevenueLabel],
          ["Active", String(metrics.activeSubscriptions)],
          ["Trials", String(metrics.trialSubscriptions)],
          ["Cancelled / ended", String(metrics.churnedSubscriptions)],
          ["Payment attention", String(metrics.failedPayments)],
        ].map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{label}</p>
            <p className="mt-1 text-xl font-bold text-white">{value}</p>
          </article>
        ))}
      </section>

      <div className="mb-4 grid gap-3 rounded-2xl border border-slate-700/70 bg-slate-950/55 p-3 sm:grid-cols-2">
        <label className="block text-xs text-slate-400">
          Search
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Parent email, name, or ID"
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
        </label>
        <label className="block text-xs text-slate-400">
          Status filter
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="trialing">Trial</option>
            <option value="payment_attention">Payment needs attention</option>
            <option value="cancel_at_period_end">Cancels at period end</option>
            <option value="cancelled">Cancelled / expired</option>
          </select>
        </label>
      </div>

      <div className="max-w-full overflow-x-auto rounded-2xl border border-slate-700/80">
        <table className="min-w-[980px] w-full table-auto text-left text-sm">
          <thead className="bg-slate-900/95 text-xs uppercase tracking-[0.16em] text-slate-300">
            <tr>
              <th className="px-3 py-2">Parent</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Access / renewal</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Provider customer</th>
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
                <td className="px-3 py-3 text-slate-200">
                  <p>{row.planName}</p>
                  <p className="text-xs text-slate-500">{row.billingCycle} · {row.childLimit} child limit</p>
                </td>
                <td className="px-3 py-3">
                  <p className={`font-semibold ${toneClass(row.statusTone)}`}>{row.statusLabel}</p>
                  <p className="mt-1 max-w-[18rem] text-xs text-slate-400">{row.statusDetail}</p>
                </td>
                <td className="px-3 py-3 text-slate-200">
                  <p>Renewal: {formatDate(row.renewalDate)}</p>
                  <p className="text-xs text-slate-400">Access ends: {formatDate(row.accessEndsAt)}</p>
                  {row.graceEndsAt ? (
                    <p className="text-xs text-amber-200">Grace until: {formatDate(row.graceEndsAt)}</p>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-slate-200">{row.amountLabel}</td>
                <td className="px-3 py-3 text-slate-200">
                  {row.hasProviderCustomer ? "Linked" : "Not linked"}
                </td>
                <td className="sticky right-0 z-10 border-l border-slate-800 bg-slate-950/95 px-3 py-3">
                  <div className="grid gap-2">
                    <button
                      type="button"
                      onClick={() => void runAction(row, "cancel_at_period_end")}
                      disabled={!canManagePlans || workingParentId === row.parentId}
                      className="rounded-lg border border-rose-700 bg-rose-950/40 px-2 py-1.5 text-[11px] font-semibold text-rose-200 disabled:opacity-50"
                    >
                      Cancel at period end
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAction(row, "reactivate")}
                      disabled={!canManagePlans || workingParentId === row.parentId || !row.cancelScheduled}
                      className="rounded-lg border border-emerald-700 bg-emerald-950/40 px-2 py-1.5 text-[11px] font-semibold text-emerald-200 disabled:opacity-50"
                    >
                      Reactivate
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAction(row, "send_payment_reminder")}
                      disabled={!canManagePlans || workingParentId === row.parentId}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] font-semibold text-slate-200 disabled:opacity-50"
                    >
                      Send payment notice
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-400">
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
