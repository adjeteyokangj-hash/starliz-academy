"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import { getActiveProfileId, getProfiles } from "@/lib/store";

type WalletEntry = {
  id: string;
  type: string;
  amount: number;
  source: string;
  reason: string | null;
  itemId: string | null;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
  metadata: { itemName?: string; activityName?: string; subject?: string; failureCode?: string } | null;
};

type WalletData = {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  recentActivity: WalletEntry[];
  earnedBySource: Array<{ source: string; amount: number }>;
  spentByItem: Array<{ itemId: string; amount: number; count: number; itemName: string | null }>;
};

type EntryFilter = "all" | "earn" | "spend" | "equip" | "manual_adjustment" | "failed";

const FILTER_LABELS: { key: EntryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "earn", label: "Earned" },
  { key: "spend", label: "Spent" },
  { key: "equip", label: "Equipped" },
  { key: "manual_adjustment", label: "Adjustments" },
  { key: "failed", label: "Failed" },
];

const PAGE_SIZE = 20;

function entrySign(type: string, amount: number) {
  if (type === "earn") return `+${amount}`;
  if (type === "spend") return `-${Math.abs(amount)}`;
  if (type === "manual_adjustment") return amount >= 0 ? `+${amount}` : `${amount}`;
  if (type === "equip" || type === "failed") return "0";
  return `${amount}`;
}

function entryColor(type: string, amount: number) {
  if (type === "earn") return "text-emerald-600";
  if (type === "spend") return "text-rose-600";
  if (type === "manual_adjustment") return amount >= 0 ? "text-blue-600" : "text-orange-600";
  if (type === "failed") return "text-amber-600";
  return "text-slate-600";
}

export default function ParentWalletPage() {
  const searchParams = useSearchParams();
  const queryChildId = searchParams.get("childId");

  const profiles = getProfiles();
  const activeId = getActiveProfileId();
  const childId = queryChildId ?? activeId ?? profiles[0]?.id ?? null;
  const child = profiles.find((p) => p.id === childId) ?? null;

  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<EntryFilter>("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!childId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/children/${childId}/data`)
      .then((r) => r.json())
      .then((payload) => {
        setWalletData((payload.walletSummary as WalletData) ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [childId]);

  const filtered = (walletData?.recentActivity ?? []).filter(
    (entry) => filter === "all" || entry.type === filter,
  );
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset to page 0 when filter changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(0);
  }, [filter]);

  return (
    <div className="min-h-screen bg-[#f5f3ff]">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/parent" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
            ← Back
          </Link>
          <div>
            <h1 className="text-2xl font-black text-[#1e1b4b]">
              {child ? `${child.name}'s Wallet` : "Wallet History"}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">Full coin ledger from the server.</p>
          </div>
        </div>

        {/* Child switcher if multiple profiles */}
        {profiles.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <Link
                key={p.id}
                href={`/parent/wallet?childId=${p.id}`}
                className={`rounded-full px-4 py-1.5 text-sm font-bold ${p.id === childId ? "bg-[#4f46e5] text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {p.name}
              </Link>
            ))}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-3xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">Loading wallet data…</div>
        ) : !walletData ? (
          <div className="rounded-3xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">No wallet data found.</div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-3xl bg-white p-5 shadow-sm text-center">
                <p className="text-xs font-bold uppercase text-slate-400">Balance</p>
                <p className="mt-2 text-3xl font-black text-emerald-600">{walletData.balance}</p>
                <p className="mt-1 text-xs text-slate-400">coins</p>
              </div>
              <div className="rounded-3xl bg-white p-5 shadow-sm text-center">
                <p className="text-xs font-bold uppercase text-slate-400">Earned</p>
                <p className="mt-2 text-3xl font-black text-blue-600">{walletData.totalEarned}</p>
                <p className="mt-1 text-xs text-slate-400">coins</p>
              </div>
              <div className="rounded-3xl bg-white p-5 shadow-sm text-center">
                <p className="text-xs font-bold uppercase text-slate-400">Spent</p>
                <p className="mt-2 text-3xl font-black text-rose-600">{walletData.totalSpent}</p>
                <p className="mt-1 text-xs text-slate-400">coins</p>
              </div>
            </div>

            {/* Earned by source */}
            {walletData.earnedBySource.length > 0 ? (
              <div className="rounded-3xl bg-white p-6 shadow-sm">
                <p className="text-sm font-extrabold text-[#1e1b4b]">Earned by activity</p>
                <div className="mt-4 space-y-2">
                  {walletData.earnedBySource.map((entry) => (
                    <div key={entry.source} className="flex items-center justify-between gap-3 text-sm">
                      <span className="capitalize text-slate-700">{entry.source.replaceAll("_", " ")}</span>
                      <span className="font-black text-emerald-600">+{entry.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Transaction list */}
            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
                <p className="text-sm font-extrabold text-[#1e1b4b]">Transaction history</p>
                <p className="text-xs text-slate-400">{filtered.length} rows</p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-2 mb-5">
                {FILTER_LABELS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`rounded-full px-4 py-1.5 text-xs font-bold ${filter === key ? "bg-[#4f46e5] text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Rows */}
              <div className="space-y-2">
                {pageItems.map((entry) => {
                  const label =
                    entry.metadata?.itemName ??
                    entry.metadata?.activityName ??
                    entry.reason ??
                    entry.source.replaceAll("_", " ");
                  const subject = entry.metadata?.subject ? ` · ${entry.metadata.subject}` : "";
                  return (
                    <div key={entry.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`text-sm font-black m-0 ${entryColor(entry.type, entry.amount)}`}>
                          {entrySign(entry.type, entry.amount)} coins
                          {entry.type === "manual_adjustment" ? " (admin adjustment)" : ""}
                        </p>
                        <p className="m-0 mt-0.5 text-[13px] text-slate-600 truncate">{label}{subject}</p>
                        <p className="m-0 mt-0.5 text-[11px] text-slate-400">
                          Balance {entry.balanceBefore} → {entry.balanceAfter}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] font-semibold text-slate-400 whitespace-nowrap">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
                {pageItems.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">No transactions match this filter.</p>
                ) : null}
              </div>

              {/* Pagination */}
              {totalPages > 1 ? (
                <div className="mt-5 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                  >
                    ← Previous
                  </button>
                  <span className="text-sm text-slate-500">
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                  >
                    Next →
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
