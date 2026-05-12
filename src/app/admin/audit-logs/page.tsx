"use client";

import { useEffect, useState } from "react";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type AuditLog = {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [actorUserId, setActorUserId] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function loadLogs() {
    const params = new URLSearchParams();
    if (actorUserId) params.set("actorUserId", actorUserId);
    if (action) params.set("action", action);
    if (entityType) params.set("entityType", entityType);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    const response = await fetch(`/api/admin/audit-logs?${params.toString()}`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    setLogs(data.logs ?? []);
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
        <div className="grid gap-3 md:grid-cols-5">
          <input className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none" placeholder="Admin user ID" value={actorUserId} onChange={(event) => setActorUserId(event.target.value)} />
          <input className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none" placeholder="Action type" value={action} onChange={(event) => setAction(event.target.value)} />
          <input className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none" placeholder="Resource" value={entityType} onChange={(event) => setEntityType(event.target.value)} />
          <input className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <input className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        <button type="button" onClick={() => void loadLogs()} className="mt-4 rounded-2xl bg-violet-500 px-5 py-3 font-bold text-white">
          Apply Filters
        </button>
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
                  <td className="px-3 py-3">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-3">{log.actorEmail ?? log.actorUserId ?? "System"}</td>
                  <td className="px-3 py-3 font-semibold text-white">{log.action}</td>
                  <td className="px-3 py-3">{log.entityType}</td>
                  <td className="px-3 py-3 text-slate-400">{log.entityId ?? "-"}</td>
                </tr>
              ))}
              {!logs.length ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500">No audit events found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AdminSectionCard>
    </div>
  );
}
