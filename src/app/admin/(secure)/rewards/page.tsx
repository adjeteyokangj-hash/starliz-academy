"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import AdminResourceManager from "@/components/admin/AdminResourceManager";

type RewardsOpsPayload = {
  metrics: {
    rewardRules: number;
    activeRewardRules: number;
    storeItems: number;
    todayAwards: number;
    todayRedemptions: number;
    pendingApprovals: number;
  };
  pendingRequests: Array<{
    transactionId: string;
    requestId: string;
    childId: string;
    childName: string;
    itemId: string;
    itemName: string;
    itemCategory: string;
    approvalMode: "none" | "parent" | "admin";
    rewardType: "digital" | "physical";
    balanceBefore: number;
    requestedAt: string;
    status: "pending" | "approved" | "rejected";
    reviewedAt: string | null;
    reviewedBy: string | null;
  }>;
  topStudents: Array<{
    id: string;
    name: string;
    coins: number;
    xp: number;
    parentEmail: string;
  }>;
  recentLedger: Array<{
    id: string;
    childId: string;
    childName: string;
    type: string;
    amount: number;
    source: string;
    reason: string | null;
    balanceAfter: number;
    itemId: string | null;
    createdAt: string;
    metadata: {
      itemName?: string;
      approvalStatus?: string;
      requestId?: string;
    } | null;
  }>;
};

export default function RewardsPage() {
  const [data, setData] = useState<RewardsOpsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [bonusChildId, setBonusChildId] = useState("");
  const [bonusAmount, setBonusAmount] = useState("10");
  const [bonusReason, setBonusReason] = useState("Confidence streak bonus");
  const [workingRequestId, setWorkingRequestId] = useState<string | null>(null);

  const loadData = useCallback(async (withLoading = true) => {
    if (withLoading) setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/rewards/ops", { credentials: "include" });
      if (!response.ok) {
        setError("Unable to load rewards operations.");
        return;
      }
      const payload = (await response.json()) as RewardsOpsPayload;
      setData(payload);
    } catch {
      setError("Unable to load rewards operations.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function submitBonus() {
    setMessage(null);
    setError(null);
    const parsedAmount = Number.parseInt(bonusAmount, 10);
    if (!bonusChildId.trim() || Number.isNaN(parsedAmount) || parsedAmount <= 0 || !bonusReason.trim()) {
      setError("Provide child ID, positive amount, and reason.");
      return;
    }

    const response = await fetch("/api/admin/rewards/ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        action: "award_bonus",
        childId: bonusChildId.trim(),
        amount: parsedAmount,
        reason: bonusReason.trim(),
      }),
    });

    const payload = (await response.json()) as { error?: string; newBalance?: number };
    if (!response.ok) {
      setError(payload.error ?? "Unable to award bonus.");
      return;
    }

    setMessage(`Bonus awarded. Updated balance: ${payload.newBalance ?? "n/a"} coins.`);
    await loadData();
  }

  async function reviewRequest(requestId: string, decision: "approve" | "reject") {
    setWorkingRequestId(requestId);
    setMessage(null);
    setError(null);

    const response = await fetch("/api/admin/rewards/ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        action: "review_redemption",
        requestId,
        decision,
      }),
    });

    const payload = (await response.json()) as { error?: string; status?: string };
    setWorkingRequestId(null);
    if (!response.ok) {
      setError(payload.error ?? "Unable to review request.");
      return;
    }

    setMessage(`Request ${decision === "approve" ? "approved" : "rejected"}.`);
    await loadData();
  }

  const pendingOnly = useMemo(
    () => (data?.pendingRequests ?? []).filter((request) => request.status === "pending"),
    [data?.pendingRequests],
  );

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadData(false);
    }, 0);

    return () => {
      window.clearTimeout(id);
    };
  }, [loadData]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Rewards Engine</h1>
        <p className="mt-1 text-slate-400">Rule automation, wallet governance, redemption approvals, and reward telemetry.</p>
      </div>

      {loading ? <p className="text-sm text-slate-400">Loading rewards operations...</p> : null}
      {error ? <p className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
      {message ? <p className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">{message}</p> : null}

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
          <p className="text-xs text-slate-400">Reward Rules</p>
          <p className="mt-1 text-xl font-black text-white">{data?.metrics.rewardRules ?? 0}</p>
        </article>
        <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
          <p className="text-xs text-slate-400">Active Rules</p>
          <p className="mt-1 text-xl font-black text-white">{data?.metrics.activeRewardRules ?? 0}</p>
        </article>
        <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
          <p className="text-xs text-slate-400">Store Items</p>
          <p className="mt-1 text-xl font-black text-white">{data?.metrics.storeItems ?? 0}</p>
        </article>
        <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
          <p className="text-xs text-slate-400">Awards Today</p>
          <p className="mt-1 text-xl font-black text-white">{data?.metrics.todayAwards ?? 0}</p>
        </article>
        <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
          <p className="text-xs text-slate-400">Redemptions Today</p>
          <p className="mt-1 text-xl font-black text-white">{data?.metrics.todayRedemptions ?? 0}</p>
        </article>
        <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
          <p className="text-xs text-slate-400">Pending Approvals</p>
          <p className="mt-1 text-xl font-black text-white">{data?.metrics.pendingApprovals ?? 0}</p>
        </article>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <AdminSectionCard title="Assign Bonus Points">
          <p className="mb-3 text-sm text-slate-400">Use this to reward streak consistency, weak-area improvement, and confidence growth.</p>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Child ID
              <input
                value={bonusChildId}
                onChange={(event) => setBonusChildId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Coins
              <input
                value={bonusAmount}
                onChange={(event) => setBonusAmount(event.target.value)}
                type="number"
                min={1}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500 md:col-span-3">
              Reason
              <input
                value={bonusReason}
                onChange={(event) => setBonusReason(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => void submitBonus()}
            className="mt-3 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400"
          >
            Award Bonus
          </button>
        </AdminSectionCard>

        <AdminSectionCard title="Top Student Wallets">
          <div className="space-y-2">
            {(data?.topStudents ?? []).map((student) => (
              <div key={student.id} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-white">{student.name}</span>
                  <span>{student.coins} coins</span>
                </div>
                <p className="text-xs text-slate-400">XP {student.xp} · {student.parentEmail}</p>
              </div>
            ))}
            {!data?.topStudents?.length ? <p className="text-sm text-slate-500">No students found.</p> : null}
          </div>
        </AdminSectionCard>
      </div>

      <AdminSectionCard title="Pending Redemption Approvals">
        <div className="space-y-3">
          {pendingOnly.map((request) => (
            <article key={request.requestId} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{request.childName} · {request.itemName}</p>
                  <p className="text-xs text-slate-400">
                    {request.itemCategory} · {request.rewardType} · {request.approvalMode} approval · {new Date(request.requestedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void reviewRequest(request.requestId, "approve")}
                    disabled={workingRequestId === request.requestId}
                    className="rounded-lg border border-emerald-600 bg-emerald-950/40 px-3 py-1.5 text-xs font-bold text-emerald-200"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => void reviewRequest(request.requestId, "reject")}
                    disabled={workingRequestId === request.requestId}
                    className="rounded-lg border border-rose-600 bg-rose-950/40 px-3 py-1.5 text-xs font-bold text-rose-200"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </article>
          ))}
          {!pendingOnly.length ? <p className="text-sm text-slate-500">No pending redemption approvals.</p> : null}
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="Recent Reward Ledger">
        <div className="space-y-2">
          {(data?.recentLedger ?? []).map((entry) => (
            <div key={entry.id} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-200">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-white">{entry.childName}</span>
                <span>{new Date(entry.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-xs text-slate-400">
                {entry.type} {entry.amount >= 0 ? `+${entry.amount}` : entry.amount} · {entry.source} · balance {entry.balanceAfter}
              </p>
              {entry.reason ? <p className="text-xs text-slate-500">{entry.reason}</p> : null}
            </div>
          ))}
          {!data?.recentLedger?.length ? <p className="text-sm text-slate-500">No reward ledger activity yet.</p> : null}
        </div>
      </AdminSectionCard>

      <AdminResourceManager
        title="Reward Rules"
        description="Configure trigger-based points rules. Example triggers: streak_3_days, weak_area_improved, daily_consistency."
        resource="rewards"
        primaryField="name"
        fields={[
          { name: "name", label: "Rule name" },
          { name: "trigger", label: "Trigger key" },
          { name: "points", label: "Points", type: "number" },
          { name: "isActive", label: "Active", type: "checkbox" },
        ]}
      />
    </div>
  );
}
