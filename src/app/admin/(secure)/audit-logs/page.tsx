"use client";

import { useEffect, useState } from "react";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type AuditLog = {
  id: string;
  actorUserId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  actor?: {
    email?: string | null;
    name?: string | null;
  } | null;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt?: string;
  timestamp?: string;
};

function formatAuditDate(log: AuditLog) {
  const value = log.createdAt ?? log.timestamp;

  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString();
}

const quickActionFilters = [
  { key: "all", label: "All Actions", value: "" },
  { key: "content-unpublished", label: "Content Unpublished", value: "ai_content.unpublished" },
] as const;

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [actorUserId, setActorUserId] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [result, setResult] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quickActionKey = action === "ai_content.unpublished" ? "content-unpublished" : action ? "custom" : "all";

  function currentParams(actionOverride?: string) {
    const params = new URLSearchParams();
    if (actorUserId) params.set("actorUserId", actorUserId);
    const effectiveAction = actionOverride ?? action;
    if (effectiveAction) params.set("action", effectiveAction);
    if (entityType) params.set("entityType", entityType);
    if (entityId) params.set("entityId", entityId);
    if (result) params.set("result", result);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params;
  }

  async function loadLogs(actionOverride?: string) {
    setLoading(true);
    setError(null);
    try {
      const params = currentParams(actionOverride);
      const response = await fetch(`/api/admin/audit-logs?${params.toString()}`, { credentials: "include" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? `Unable to load audit logs (${response.status}).`);
        return;
      }
      const data = await response.json();
      setLogs(data.logs ?? []);
      setLoaded(true);
    } catch {
      setError("Unable to load audit logs right now.");
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    const params = currentParams();
    params.set("format", "csv");
    window.open(`/api/admin/audit-logs?${params.toString()}`, "_blank");
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Audit Logs</h1>
        <p className="mt-1 text-slate-400">Filter security events by admin user, action, date range and resource.</p>
      </div>

      <AdminSectionCard title="Filters">
        <div className="grid gap-3 md:grid-cols-4">
          <input aria-label="Admin user ID" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none" placeholder="Admin user ID" value={actorUserId} onChange={(event) => setActorUserId(event.target.value)} />
          <input aria-label="Action type" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none" placeholder="Action type" value={action} onChange={(event) => setAction(event.target.value)} />
          <input aria-label="Resource or entity type" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none" placeholder="Resource / entity type" value={entityType} onChange={(event) => setEntityType(event.target.value)} />
          <input aria-label="Record or entity ID" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none" placeholder="Record / entity ID" value={entityId} onChange={(event) => setEntityId(event.target.value)} />
          <select aria-label="Result" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none [color-scheme:dark]" value={result} onChange={(event) => setResult(event.target.value)}>
            <option value="">Any result</option>
            <option value="success">Success</option>
            <option value="denied">Denied / rejected</option>
          </select>
          <input aria-label="From date" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none [color-scheme:dark]" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <input aria-label="To date" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none [color-scheme:dark]" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {quickActionFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => {
                setAction(filter.value);
                void loadLogs(filter.value);
              }}
              className={`rounded-xl px-3 py-2 text-xs font-black uppercase tracking-[0.08em] ${quickActionKey === filter.key ? "bg-violet-500 text-white" : "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={() => void loadLogs()} disabled={loading} className="rounded-2xl bg-violet-500 px-5 py-3 font-bold text-white disabled:opacity-60">
            {loading ? "Loading…" : "Apply Filters"}
          </button>
          <button type="button" onClick={exportCsv} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-bold text-white hover:bg-white/10">
            Export CSV
          </button>
        </div>
        {error ? (
          <p role="alert" className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{error}</p>
        ) : null}
      </AdminSectionCard>

      <AdminSectionCard title="Recent Events">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Admin</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Resource</th>
                <th className="px-3 py-2">Record</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-slate-300">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-3 py-3">{formatAuditDate(log)}</td>
                  <td className="px-3 py-3">{log.actorEmail ?? log.actor?.email ?? log.actorUserId ?? "System"}</td>
                  <td className="px-3 py-3 font-semibold text-white">{log.action}</td>
                  <td className="px-3 py-3">{log.entityType}</td>
                  <td className="px-3 py-3 text-slate-400">{log.entityId ?? "-"}</td>
                </tr>
              ))}
              {!logs.length ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                    {loading
                      ? "Loading audit events…"
                      : error
                        ? "Audit events unavailable — adjust filters or retry."
                        : loaded
                          ? "No audit events match these filters."
                          : "Apply filters to load audit events."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AdminSectionCard>
    </div>
  );
}
