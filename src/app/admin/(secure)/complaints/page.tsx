"use client";

import { useCallback, useEffect, useState } from "react";

type Sla = {
  acknowledgementOverdue: boolean;
  substantiveOverdue: boolean;
  atRisk: boolean;
};

type Complaint = {
  id: string;
  reference: string;
  subject: string;
  summary: string | null;
  channel: string;
  priority: string;
  status: string;
  assignedToUserId: string | null;
  receivedAt: string;
  acknowledgedAt: string | null;
  substantiveRespondedAt: string | null;
  acknowledgementDueAt: string | null;
  substantiveResponseDueAt: string | null;
  resolution: string | null;
  sla: Sla;
};

type ComplaintNote = {
  id: string;
  actorUserId: string | null;
  kind: string;
  body: string;
  createdAt: string;
};

type Metrics = { total: number; open: number; overdue: number; atRisk: number; urgent: number };

const STATUS_META: Record<string, { label: string; cls: string }> = {
  received: { label: "Received", cls: "bg-violet-500/15 text-violet-300 border border-violet-500/30" },
  acknowledged: { label: "Acknowledged", cls: "bg-blue-500/15 text-blue-300 border border-blue-500/30" },
  investigating: { label: "Investigating", cls: "bg-amber-500/15 text-amber-300 border border-amber-500/30" },
  awaiting_information: { label: "Awaiting info", cls: "bg-orange-500/15 text-orange-300 border border-orange-500/30" },
  resolved: { label: "Resolved", cls: "bg-green-500/15 text-green-300 border border-green-500/30" },
  closed: { label: "Closed", cls: "bg-slate-700/60 text-slate-400 border border-slate-600/40" },
};

const PRIORITY_META: Record<string, { label: string; cls: string }> = {
  urgent: { label: "Urgent", cls: "bg-red-500/15 text-red-300 border border-red-500/30" },
  high: { label: "High", cls: "bg-orange-500/15 text-orange-300 border border-orange-500/30" },
  normal: { label: "Normal", cls: "bg-blue-500/15 text-blue-300 border border-blue-500/30" },
  low: { label: "Low", cls: "bg-slate-700/60 text-slate-400 border border-slate-600/40" },
};

const inputCls = "w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-violet-500 transition [color-scheme:dark]";
const selectCls = inputCls;

function fmt(dt: string | null): string {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-GB");
}

export default function AdminComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [selected, setSelected] = useState<Complaint | null>(null);
  const [notes, setNotes] = useState<ComplaintNote[]>([]);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [responseDraft, setResponseDraft] = useState("");
  const [resolutionDraft, setResolutionDraft] = useState("");
  const [assignDraft, setAssignDraft] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ subject: "", summary: "", priority: "normal" });
  const [createErr, setCreateErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    try {
      const res = await fetch(`/api/admin/complaints?${params.toString()}`, { credentials: "include" });
      if (!res.ok) {
        setError("Complaints are unavailable right now.");
        setComplaints([]);
        return;
      }
      const data = await res.json();
      setComplaints(data.complaints ?? []);
      setMetrics(data.metrics ?? null);
    } catch {
      setError("Complaints are unavailable right now.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/complaints?${new URLSearchParams({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(priorityFilter ? { priority: priorityFilter } : {}),
    }).toString()}`, { credentials: "include", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Complaints are unavailable right now.");
        return res.json();
      })
      .then((data) => {
        setError(null);
        setComplaints(data.complaints ?? []);
        setMetrics(data.metrics ?? null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Complaints are unavailable right now.");
        setComplaints([]);
        setLoading(false);
      });
    return () => controller.abort();
  }, [statusFilter, priorityFilter]);

  async function openComplaint(c: Complaint) {
    setSelected(c);
    setActionMsg(null);
    setNoteDraft("");
    setResponseDraft("");
    setResolutionDraft("");
    setAssignDraft(c.assignedToUserId ?? "");
    const res = await fetch(`/api/admin/complaints/${c.id}`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setSelected(data.complaint);
      setNotes(data.notes ?? []);
    }
  }

  async function act(payload: Record<string, unknown>, successMsg: string) {
    if (!selected) return;
    setBusy(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/admin/complaints/${selected.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setActionMsg("Action failed.");
        return;
      }
      const data = await res.json();
      setSelected(data.complaint);
      setNotes(data.notes ?? notes);
      setComplaints((prev) => prev.map((c) => (c.id === data.complaint.id ? data.complaint : c)));
      setActionMsg(successMsg);
      setNoteDraft("");
      setResponseDraft("");
    } finally {
      setBusy(false);
    }
  }

  async function createComplaint() {
    if (!draft.subject.trim()) {
      setCreateErr("Subject is required.");
      return;
    }
    setCreateErr(null);
    const res = await fetch("/api/admin/complaints", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (!res.ok) {
      setCreateErr("Could not create complaint.");
      return;
    }
    setCreateOpen(false);
    setDraft({ subject: "", summary: "", priority: "normal" });
    await load();
  }

  function slaBadge(c: Complaint) {
    if (c.sla.acknowledgementOverdue || c.sla.substantiveOverdue) {
      return <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-300 border border-red-500/30">Overdue</span>;
    }
    if (c.sla.atRisk) {
      return <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/30">At risk</span>;
    }
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="border-b border-slate-800 px-8 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-0.5 text-xs font-bold uppercase tracking-widest text-violet-400">Admin</p>
            <h1 className="text-3xl font-black tracking-tight text-white">Complaints</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Operational complaints handling with working-day SLA tracking. Targets are published service targets, not
              guarantees. Safeguarding concerns are handled separately and must not be logged here.
            </p>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-900/40 hover:bg-violet-500 transition"
          >
            + Log complaint
          </button>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Total", value: metrics?.total ?? "…", cls: "text-white" },
            { label: "Open", value: metrics?.open ?? "…", cls: "text-violet-300" },
            { label: "Overdue", value: metrics?.overdue ?? "…", cls: "text-red-300" },
            { label: "At risk", value: metrics?.atRisk ?? "…", cls: "text-amber-300" },
            { label: "Urgent open", value: metrics?.urgent ?? "…", cls: "text-orange-300" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{s.label}</p>
              <p className={`mt-1 text-3xl font-black ${s.cls}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <select className={`w-48 ${selectCls}`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {Object.keys(STATUS_META).map((s) => (
              <option key={s} value={s}>{STATUS_META[s].label}</option>
            ))}
          </select>
          <select className={`w-48 ${selectCls}`} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <option value="">All priorities</option>
            {Object.keys(PRIORITY_META).map((p) => (
              <option key={p} value={p}>{PRIORITY_META[p].label}</option>
            ))}
          </select>
        </div>

        {error ? (
          <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{error}</div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1fr_460px]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-500 text-sm">Loading complaints…</div>
            ) : complaints.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400 text-sm">
                No complaints match your filters.
              </div>
            ) : (
              <ul className="divide-y divide-slate-800">
                {complaints.map((c) => {
                  const sm = STATUS_META[c.status] ?? STATUS_META.received;
                  const pm = PRIORITY_META[c.priority] ?? PRIORITY_META.normal;
                  const isActive = selected?.id === c.id;
                  return (
                    <li
                      key={c.id}
                      onClick={() => void openComplaint(c)}
                      className={`cursor-pointer px-5 py-4 transition hover:bg-slate-800/60 ${isActive ? "bg-slate-800/80 border-l-2 border-violet-500" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-white text-sm">{c.subject}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{c.reference}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${sm.cls}`}>{sm.label}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${pm.cls}`}>{pm.label}</span>
                            {slaBadge(c)}
                          </div>
                        </div>
                        <span className="shrink-0 text-[11px] text-slate-600 whitespace-nowrap mt-0.5">{fmt(c.receivedAt)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {selected ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-5 self-start sticky top-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-bold text-white text-base leading-snug">{selected.subject}</h2>
                  <p className="text-xs text-slate-500">{selected.reference}</p>
                </div>
                <button onClick={() => setSelected(null)} className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 transition text-xs">✕</button>
              </div>

              {selected.summary ? (
                <div className="rounded-xl bg-slate-800/60 border border-slate-700 px-4 py-3 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {selected.summary}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3 text-xs text-slate-400">
                <div>
                  <p className="font-bold uppercase tracking-widest text-slate-600 mb-1">Acknowledge by</p>
                  <p className={selected.sla.acknowledgementOverdue ? "text-red-300" : ""}>{fmt(selected.acknowledgementDueAt)}</p>
                </div>
                <div>
                  <p className="font-bold uppercase tracking-widest text-slate-600 mb-1">Substantive by</p>
                  <p className={selected.sla.substantiveOverdue ? "text-red-300" : ""}>{fmt(selected.substantiveResponseDueAt)}</p>
                </div>
                <div>
                  <p className="font-bold uppercase tracking-widest text-slate-600 mb-1">Acknowledged</p>
                  <p>{fmt(selected.acknowledgedAt)}</p>
                </div>
                <div>
                  <p className="font-bold uppercase tracking-widest text-slate-600 mb-1">Responded</p>
                  <p>{fmt(selected.substantiveRespondedAt)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500">Assign owner (user ID)</label>
                <div className="flex gap-2">
                  <input className={inputCls} placeholder="User ID" value={assignDraft} onChange={(e) => setAssignDraft(e.target.value)} />
                  <button disabled={busy} onClick={() => void act({ action: "assign", assignedToUserId: assignDraft || null }, "Owner updated.")} className="shrink-0 rounded-xl border border-slate-700 px-3 text-sm font-bold text-slate-200 hover:bg-slate-800">Set</button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => void act({ action: "acknowledge" }, "Acknowledged.")} className="rounded-xl bg-blue-600/80 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500">Acknowledge</button>
                <button disabled={busy} onClick={() => void act({ action: "set_status", status: "investigating" }, "Investigating.")} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800">Investigating</button>
                <button disabled={busy} onClick={() => void act({ action: "set_status", status: "awaiting_information" }, "Awaiting info.")} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800">Awaiting info</button>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500">Investigation note</label>
                <textarea className={`${inputCls} min-h-20 resize-none`} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Internal investigation note…" />
                <button disabled={busy || !noteDraft.trim()} onClick={() => void act({ action: "add_note", body: noteDraft, kind: "investigation" }, "Note added.")} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50">Add note</button>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500">Substantive response</label>
                <textarea className={`${inputCls} min-h-20 resize-none`} value={responseDraft} onChange={(e) => setResponseDraft(e.target.value)} placeholder="Response sent to the complainant…" />
                <button disabled={busy || !responseDraft.trim()} onClick={() => void act({ action: "record_response", body: responseDraft }, "Response recorded.")} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-500 disabled:opacity-50">Record response</button>
              </div>

              <div className="space-y-2 border-t border-slate-800 pt-4">
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500">Resolution</label>
                <textarea className={`${inputCls} min-h-20 resize-none`} value={resolutionDraft} onChange={(e) => setResolutionDraft(e.target.value)} placeholder="Resolution summary…" />
                <div className="flex gap-2">
                  <button disabled={busy || !resolutionDraft.trim()} onClick={() => void act({ action: "resolve", resolution: resolutionDraft }, "Resolved.")} className="flex-1 rounded-xl bg-green-600/80 px-3 py-2 text-xs font-bold text-white hover:bg-green-500 disabled:opacity-50">Resolve</button>
                  <button disabled={busy} onClick={() => void act({ action: "close", resolution: resolutionDraft || undefined }, "Closed.")} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800">Close</button>
                </div>
              </div>

              {actionMsg ? <p className="text-xs text-center text-slate-400">{actionMsg}</p> : null}

              {notes.length > 0 ? (
                <div className="space-y-2 border-t border-slate-800 pt-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">History</p>
                  {notes.map((n) => (
                    <div key={n.id} className="rounded-xl bg-slate-800/50 border border-slate-700 px-3 py-2">
                      <div className="flex justify-between gap-2 text-[11px] text-slate-500">
                        <span className="uppercase tracking-wide">{n.kind}</span>
                        <span>{fmt(n.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-300 whitespace-pre-wrap">{n.body}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="hidden lg:flex rounded-2xl border border-dashed border-slate-800 items-center justify-center py-20 text-slate-700 text-sm">
              Select a complaint to manage it
            </div>
          )}
        </div>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-7 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-black text-white">Log complaint</h2>
              <button onClick={() => setCreateOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 transition text-xs">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">Subject *</label>
                <input className={inputCls} value={draft.subject} onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))} placeholder="Short description" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">Priority</label>
                <select className={selectCls} value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}>
                  <option value="urgent">Urgent (1 working day ack)</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">Details</label>
                <textarea className={`${inputCls} min-h-28 resize-none`} value={draft.summary} onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))} placeholder="What is the complaint about?" />
              </div>
              <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                Do not log safeguarding concerns here. Email safeguarding@starlizacademy.com or contact emergency services if there is immediate danger.
              </p>
              {createErr ? <p className="text-xs text-red-400">{createErr}</p> : null}
              <div className="flex gap-3 pt-1">
                <button onClick={() => void createComplaint()} className="flex-1 rounded-xl bg-violet-600 px-5 py-3 font-bold text-white hover:bg-violet-500 transition">Create</button>
                <button onClick={() => setCreateOpen(false)} className="rounded-xl border border-slate-700 px-5 py-3 font-bold text-slate-400 hover:bg-slate-800 transition">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
