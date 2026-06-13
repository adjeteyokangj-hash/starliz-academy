"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import type {
  BrainCentreMismatchRow,
  BrainCentrePayload,
  BrainCentreQlfIssueRow,
  BrainCentreWarningRow,
} from "@/app/api/admin/brain-centre/route";
import { toBrainCentreFilterHref, toIssueDetailHref } from "@/lib/brain-centre/action-map";

type BrainCentreTab = "all" | "warnings" | "mismatches" | "qlf";

const tabs: Array<{ key: BrainCentreTab; label: string }> = [
  { key: "all", label: "All" },
  { key: "warnings", label: "Warnings" },
  { key: "mismatches", label: "Recommendation Mismatches" },
  { key: "qlf", label: "QLF Issues" },
];

function statusClass(status: string): string {
  if (status === "critical" || status === "blocked") return "border-rose-500/40 bg-rose-500/10 text-rose-100";
  if (status === "warning") return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
}

function compactDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-4 text-sm text-slate-400">
      {label}
    </div>
  );
}

function HeartbeatWarnings({ rows, onOpenIssue }: { rows: BrainCentreWarningRow[]; onOpenIssue: (row: BrainCentreWarningRow) => void }) {
  if (!rows.length) return <EmptyRow label="No HEART BEAT warnings in the current sample." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-245 text-left text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-xs uppercase text-slate-500">
            <th className="px-3 py-3">Student</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">Reason / Signals</th>
            <th className="px-3 py-3">Recommended Action</th>
            <th className="px-3 py-3">Generated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.studentId}-${row.warningStatus}`}
              role="button"
              tabIndex={0}
              onClick={() => onOpenIssue(row)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenIssue(row);
                }
              }}
              className="cursor-pointer border-b border-slate-800/70 text-slate-300 transition hover:bg-slate-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <td className="px-3 py-3">
                <Link href={toIssueDetailHref(row)} className="font-bold text-white hover:text-blue-200">{row.studentName}</Link>
                <p className="mt-0.5 font-mono text-xs text-slate-500">{row.studentId}</p>
              </td>
              <td className="px-3 py-3">
                <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${statusClass(row.status)}`}>
                  {row.warningStatus}
                </span>
              </td>
              <td className="px-3 py-3">
                <div className="max-w-md space-y-1 text-xs text-slate-300">
                  {row.reasonSignals.slice(0, 3).map((signal, index) => <p key={`${row.studentId}-signal-${index}`}>{signal}</p>)}
                </div>
              </td>
              <td className="px-3 py-3 text-xs text-slate-200">{row.recommendedAction}</td>
              <td className="px-3 py-3 text-xs text-slate-400">{compactDate(row.generatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecommendationMismatches({ rows, onOpenIssue }: { rows: BrainCentreMismatchRow[]; onOpenIssue: (row: BrainCentreMismatchRow) => void }) {
  if (!rows.length) return <EmptyRow label="No recommendation sync mismatches in the current sample." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-250 text-left text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-xs uppercase text-slate-500">
            <th className="px-3 py-3">Student</th>
            <th className="px-3 py-3">Canonical Recommendation</th>
            <th className="px-3 py-3">Mismatching Engine</th>
            <th className="px-3 py-3">Mismatch Detail</th>
            <th className="px-3 py-3">Lock-Style Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${row.studentId}-${row.mismatchingEngine}-${index}`}
              role="button"
              tabIndex={0}
              onClick={() => onOpenIssue(row)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenIssue(row);
                }
              }}
              className="cursor-pointer border-b border-slate-800/70 text-slate-300 transition hover:bg-slate-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <td className="px-3 py-3">
                <Link href={toIssueDetailHref(row)} className="font-bold text-white hover:text-blue-200">{row.studentName}</Link>
                <p className="mt-0.5 font-mono text-xs text-slate-500">{row.studentId}</p>
              </td>
              <td className="px-3 py-3 text-xs text-emerald-100">{row.canonicalRecommendation}</td>
              <td className="px-3 py-3">
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-100">
                  {row.mismatchingEngine}
                </span>
              </td>
              <td className="px-3 py-3 text-xs text-slate-300">{row.mismatchDetail}</td>
              <td className="px-3 py-3 text-xs text-slate-200">{row.lockAction}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QlfIssues({ rows, onOpenIssue }: { rows: BrainCentreQlfIssueRow[]; onOpenIssue: (row: BrainCentreQlfIssueRow) => void }) {
  if (!rows.length) return <EmptyRow label="No QLF or Brain connection issues in the current sample." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-225 text-left text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-xs uppercase text-slate-500">
            <th className="px-3 py-3">Student</th>
            <th className="px-3 py-3">Issue</th>
            <th className="px-3 py-3">Detail</th>
            <th className="px-3 py-3">Snapshot</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${row.studentId}-${row.issueType}-${index}`}
              role="button"
              tabIndex={0}
              onClick={() => onOpenIssue(row)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenIssue(row);
                }
              }}
              className="cursor-pointer border-b border-slate-800/70 text-slate-300 transition hover:bg-slate-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <td className="px-3 py-3">
                <Link href={toIssueDetailHref(row)} className="font-bold text-white hover:text-blue-200">{row.studentName}</Link>
                <p className="mt-0.5 font-mono text-xs text-slate-500">{row.studentId}</p>
              </td>
              <td className="px-3 py-3">
                <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${statusClass(row.status)}`}>
                  {row.issueType.replaceAll("_", " ")}
                </span>
              </td>
              <td className="px-3 py-3 text-xs text-slate-300">{row.detail}</td>
              <td className="px-3 py-3 text-xs text-slate-400">{compactDate(row.snapshotLastCalculatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminBrainCentrePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [payload, setPayload] = useState<BrainCentrePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeTab: BrainCentreTab = useMemo(() => {
    const queryTab = searchParams.get("tab");
    if (queryTab === "all" || queryTab === "warnings" || queryTab === "mismatches" || queryTab === "qlf") {
      return queryTab;
    }
    return "warnings";
  }, [searchParams]);

  async function loadBrainCentre({ silent = false }: { silent?: boolean } = {}) {
    if (silent) setRefreshing(true);
    try {
      const response = await fetch("/api/admin/brain-centre");
      if (response.status === 401) {
        window.location.replace("/admin/login?next=/admin/brain-centre");
        return;
      }
      if (!response.ok) throw new Error("Unable to load Brain Centre.");
      setPayload(await response.json() as BrainCentrePayload);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load Brain Centre.");
    } finally {
      if (!silent) setLoading(false);
      if (silent) setRefreshing(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBrainCentre();
  }, []);

  const tabCounts = useMemo(() => ({
    all: payload?.students.length ?? 0,
    warnings: payload?.heartbeatWarnings.length ?? 0,
    mismatches: payload?.recommendationMismatches.length ?? 0,
    qlf: payload?.qlfIssues.length ?? 0,
  }), [payload]);

  const severityFilter = searchParams.get("severity");
  const issueTypeFilter = searchParams.get("issueType");
  const statusFilter = searchParams.get("status");
  const healthyOnly = statusFilter === "healthy";

  const filteredWarnings = useMemo(() => {
    if (healthyOnly) return [];
    const rows = payload?.heartbeatWarnings ?? [];
    return rows.filter((row) => {
      if (severityFilter && row.severity !== severityFilter) return false;
      if (issueTypeFilter && row.issueType !== issueTypeFilter) return false;
      return true;
    });
  }, [healthyOnly, issueTypeFilter, payload?.heartbeatWarnings, severityFilter]);

  const filteredMismatches = useMemo(() => {
    if (healthyOnly) return [];
    const rows = payload?.recommendationMismatches ?? [];
    return rows.filter((row) => {
      if (severityFilter && row.severity !== severityFilter) return false;
      if (issueTypeFilter && row.issueType !== issueTypeFilter) return false;
      return true;
    });
  }, [healthyOnly, issueTypeFilter, payload?.recommendationMismatches, severityFilter]);

  const filteredQlfIssues = useMemo(() => {
    if (healthyOnly) return [];
    const rows = payload?.qlfIssues ?? [];
    return rows.filter((row) => {
      if (severityFilter && row.severity !== severityFilter) return false;
      if (issueTypeFilter && row.issueType !== issueTypeFilter) return false;
      return true;
    });
  }, [healthyOnly, issueTypeFilter, payload?.qlfIssues, severityFilter]);

  const openIssue = (row: BrainCentreWarningRow | BrainCentreMismatchRow | BrainCentreQlfIssueRow) => {
    router.push(toIssueDetailHref(row));
  };

  return (
    <AdminSectionCard title="Brain Centre" eyebrow="Stage 1 visibility">
      <div className="space-y-4">
        {loading ? <p className="text-sm text-slate-400">Loading Brain health...</p> : null}
        {error ? <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-3 text-sm text-rose-100">{error}</div> : null}

        {payload ? (
          <>
            <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Priority Action Strip</p>
                  <h2 className="mt-1 text-sm font-bold text-white">Focus warnings and critical mismatches first</h2>
                  <p className="mt-1 text-xs text-slate-400">Critical issues and warning rows stay in the primary surface. Deep diagnostics remain available below.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => router.push(toBrainCentreFilterHref({ tab: "warnings", severity: "warning" }))}
                    className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-100"
                  >
                    Review warnings ({tabCounts.warnings})
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(toBrainCentreFilterHref({ tab: "mismatches", severity: "critical" }))}
                    className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-100"
                  >
                    Check mismatches ({tabCounts.mismatches})
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadBrainCentre({ silent: true })}
                    disabled={refreshing}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:border-slate-500 disabled:opacity-60"
                  >
                    {refreshing ? "Refreshing dashboard..." : "Refresh dashboard"}
                  </button>
                </div>
              </div>
            </section>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <button
                type="button"
                onClick={() => router.push(toBrainCentreFilterHref({ tab: "all" }))}
                className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-left"
              >
                <p className="text-xs uppercase text-slate-500">Students Checked</p>
                <p className="mt-1 text-2xl font-black text-white">{payload.summary.totalStudentsChecked}</p>
              </button>
              <button
                type="button"
                onClick={() => router.push(toBrainCentreFilterHref({ tab: "all", status: "healthy" }))}
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-left"
              >
                <p className="text-xs uppercase text-emerald-200/80">Healthy</p>
                <p className="mt-1 text-2xl font-black text-emerald-100">{payload.summary.healthyCount}</p>
              </button>
              <button
                type="button"
                onClick={() => router.push(toBrainCentreFilterHref({ tab: "warnings", severity: "warning" }))}
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-left"
              >
                <p className="text-xs uppercase text-amber-200/80">Warning</p>
                <p className="mt-1 text-2xl font-black text-amber-100">{payload.summary.warningCount}</p>
              </button>
              <button
                type="button"
                onClick={() => router.push(toBrainCentreFilterHref({ tab: "all", severity: "critical" }))}
                className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-left"
              >
                <p className="text-xs uppercase text-rose-200/80">Critical</p>
                <p className="mt-1 text-2xl font-black text-rose-100">{payload.summary.criticalCount}</p>
              </button>
              <button
                type="button"
                onClick={() => router.push(toBrainCentreFilterHref({ tab: "qlf", issueType: "stale_snapshot" }))}
                className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-left"
              >
                <p className="text-xs uppercase text-slate-500">Stale / Missing</p>
                <p className="mt-1 text-2xl font-black text-slate-100">{payload.summary.staleOrMissingDataCount}</p>
              </button>
            </div>

            <details className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <summary className="cursor-pointer list-none text-sm font-bold text-white">
                Brain Diagnostics (low-priority detail) · score {payload.diagnostics.healthScore} · {payload.diagnostics.issues.length} issue types
              </summary>
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {payload.diagnostics.issues.length ? payload.diagnostics.issues.slice(0, 8).map((issue) => (
                  <div key={issue.code} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                    <p className="text-xs font-black text-white">{issue.label}</p>
                    <p className="mt-1 text-xs text-slate-400">{issue.count} affected</p>
                    <p className="mt-1 truncate text-[11px] text-slate-500">
                      {issue.affectedStudents.map((student) => student.studentName).join(", ")}
                    </p>
                  </div>
                )) : <p className="text-xs text-slate-500">No diagnostic issues in the current sample.</p>}
              </div>
            </details>

            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => router.push(toBrainCentreFilterHref({ tab: tab.key }))}
                  className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                    activeTab === tab.key
                      ? "border-indigo-400 bg-indigo-500 text-white"
                      : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  {tab.label} <span className="ml-1 text-[11px] opacity-80">{tabCounts[tab.key]}</span>
                </button>
              ))}
            </div>

            {(activeTab === "all" || activeTab === "warnings") ? (
              <section>
                <h2 className="mb-2 text-sm font-bold text-white">HEART BEAT Warnings</h2>
                {healthyOnly ? <EmptyRow label="No healthy issues to show." /> : <HeartbeatWarnings rows={filteredWarnings} onOpenIssue={openIssue} />}
              </section>
            ) : null}

            {(activeTab === "all" || activeTab === "mismatches") ? (
              <section>
                <h2 className="mb-2 text-sm font-bold text-white">Recommendation Sync Mismatches</h2>
                {healthyOnly ? <EmptyRow label="No healthy issues to show." /> : <RecommendationMismatches rows={filteredMismatches} onOpenIssue={openIssue} />}
              </section>
            ) : null}

            {(activeTab === "all" || activeTab === "qlf") ? (
              <details className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                <summary className="cursor-pointer list-none text-sm font-bold text-white">QLF / Brain Connection Status (expanded detail)</summary>
                <div className="mt-3">
                <h2 className="mb-2 text-sm font-bold text-white">QLF / Brain Connection Status</h2>
                {healthyOnly ? <EmptyRow label="No healthy issues to show." /> : <QlfIssues rows={filteredQlfIssues} onOpenIssue={openIssue} />}
                </div>
              </details>
            ) : null}
          </>
        ) : null}
      </div>
    </AdminSectionCard>
  );
}
