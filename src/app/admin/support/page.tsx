"use client";

import { useEffect, useState } from "react";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

type Ticket = {
  id: string;
  subject: string;
  message: string | null;
  status: string;
  priority: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
};

const PRIORITY_META: Record<string, { label: string; cls: string }> = {
  urgent: { label: "Urgent", cls: "bg-red-500/15 text-red-300 border border-red-500/30" },
  high:   { label: "High",   cls: "bg-orange-500/15 text-orange-300 border border-orange-500/30" },
  normal: { label: "Normal", cls: "bg-blue-500/15 text-blue-300 border border-blue-500/30" },
  low:    { label: "Low",    cls: "bg-slate-700/60 text-slate-400 border border-slate-600/40" },
};

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  open:        { label: "Open",        cls: "bg-violet-500/15 text-violet-300 border border-violet-500/30", dot: "bg-violet-400" },
  in_progress: { label: "In Progress", cls: "bg-amber-500/15 text-amber-300 border border-amber-500/30",   dot: "bg-amber-400" },
  resolved:    { label: "Resolved",    cls: "bg-green-500/15 text-green-300 border border-green-500/30",   dot: "bg-green-400" },
  closed:      { label: "Closed",      cls: "bg-slate-700/60 text-slate-400 border border-slate-600/40",   dot: "bg-slate-500" },
};

const inputCls = "w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-violet-500 transition";
const selectCls = "w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500 transition";

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ subject: "", parentId: "", priority: "normal", status: "open", message: "" });
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    const res = await fetch(`/api/admin/resources/support?${params.toString()}`);
    const data = await res.json();
    setTickets(data.records ?? []);
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  function openTicket(t: Ticket) {
    setSelected(t);
    setEditStatus(t.status);
    setEditPriority(t.priority);
    setSaveMsg(null);
  }

  async function saveTicket() {
    if (!selected) return;
    setSaving(true);
    setSaveMsg(null);
    const res = await fetch(`/api/admin/resources/support/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: editStatus, priority: editPriority }),
    });
    setSaving(false);
    if (res.ok) {
      setSaveMsg("Saved successfully.");
      setTickets(prev => prev.map(t => t.id === selected.id ? { ...t, status: editStatus, priority: editPriority } : t));
      setSelected(prev => prev ? { ...prev, status: editStatus, priority: editPriority } : prev);
    } else {
      setSaveMsg("Failed to save.");
    }
  }

  async function deleteTicket(id: string) {
    await fetch(`/api/admin/resources/support/${id}`, { method: "DELETE" });
    setSelected(null);
    setTickets(prev => prev.filter(t => t.id !== id));
  }

  async function createTicket() {
    if (!draft.subject.trim()) { setCreateErr("Subject is required."); return; }
    setCreating(true);
    setCreateErr(null);
    const res = await fetch("/api/admin/resources/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setCreating(false);
    if (!res.ok) { setCreateErr("Could not create ticket."); return; }
    setCreateOpen(false);
    setDraft({ subject: "", parentId: "", priority: "normal", status: "open", message: "" });
    await load();
  }

  const filtered = tickets.filter(t => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (priorityFilter && t.priority !== priorityFilter) return false;
    return true;
  });

  const counts = {
    open: tickets.filter(t => t.status === "open").length,
    in_progress: tickets.filter(t => t.status === "in_progress").length,
    urgent: tickets.filter(t => t.priority === "urgent").length,
    resolved: tickets.filter(t => t.status === "resolved").length,
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-slate-800 px-8 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-0.5 text-xs font-bold uppercase tracking-widest text-violet-400">Admin</p>
            <h1 className="text-3xl font-black tracking-tight text-white">Support / Tickets</h1>
            <p className="mt-1 text-sm text-slate-400">Track parent issues, payment problems, child access and technical requests.</p>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-900/40 hover:bg-violet-500 transition"
          >
            + New Ticket
          </button>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Open", value: counts.open, cls: "text-violet-300" },
            { label: "In Progress", value: counts.in_progress, cls: "text-amber-300" },
            { label: "Urgent", value: counts.urgent, cls: "text-red-300" },
            { label: "Resolved", value: counts.resolved, cls: "text-green-300" },
          ].map(s => (
            <div key={s.label} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{s.label}</p>
              <p className={`mt-1 text-3xl font-black ${s.cls}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <input
            className="w-72 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-violet-500 transition"
            placeholder="Search subject or message…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && void load()}
          />
          <select className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500 transition" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <select className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500 transition" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
            <option value="">All priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
          <button onClick={() => void load()} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-bold text-slate-300 hover:bg-slate-800 transition">
            Apply
          </button>
        </div>

        {/* Content grid */}
        <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
          {/* Ticket list */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-500 text-sm">Loading tickets…</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <span className="text-3xl">🎉</span>
                <p className="text-slate-400 text-sm">No tickets match your filters.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-800">
                {filtered.map(t => {
                  const pm = PRIORITY_META[t.priority] ?? PRIORITY_META.normal;
                  const sm = STATUS_META[t.status] ?? STATUS_META.open;
                  const isActive = selected?.id === t.id;
                  return (
                    <li
                      key={t.id}
                      onClick={() => openTicket(t)}
                      className={`cursor-pointer px-5 py-4 transition hover:bg-slate-800/60 ${isActive ? "bg-slate-800/80 border-l-2 border-violet-500" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-white text-sm">{t.subject}</p>
                          {t.message && (
                            <p className="mt-0.5 truncate text-xs text-slate-500">{t.message}</p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${sm.cls}`}>
                              <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${sm.dot}`} />
                              {sm.label}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${pm.cls}`}>{pm.label}</span>
                            {t.parentId && (
                              <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] text-slate-400 border border-slate-600/40">
                                Parent …{t.parentId.slice(-6)}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="shrink-0 text-[11px] text-slate-600 whitespace-nowrap mt-0.5">
                          {timeAgo(t.createdAt)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Detail panel */}
          {selected ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-5 self-start sticky top-4">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-bold text-white text-base leading-snug">{selected.subject}</h2>
                <button onClick={() => setSelected(null)} className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 transition text-xs">✕</button>
              </div>

              {selected.message && (
                <div className="rounded-xl bg-slate-800/60 border border-slate-700 px-4 py-3 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {selected.message}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs text-slate-400">
                <div>
                  <p className="font-bold uppercase tracking-widest text-slate-600 mb-1">Created</p>
                  <p>{new Date(selected.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="font-bold uppercase tracking-widest text-slate-600 mb-1">Parent ID</p>
                  <p className="truncate">{selected.parentId ?? "—"}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">Status</label>
                  <select className={selectCls} value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">Priority</label>
                  <select className={selectCls} value={editPriority} onChange={e => setEditPriority(e.target.value)}>
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => void saveTicket()}
                  disabled={saving}
                  className="flex-1 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-60 transition"
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
                <button
                  onClick={() => { if (confirm("Delete this ticket?")) void deleteTicket(selected.id); }}
                  className="rounded-xl border border-red-900/50 px-4 py-2.5 text-sm font-bold text-red-400 hover:bg-red-950/50 hover:text-red-300 transition"
                >
                  Delete
                </button>
              </div>
              {saveMsg && <p className="text-xs text-center text-slate-400">{saveMsg}</p>}
            </div>
          ) : (
            <div className="hidden lg:flex rounded-2xl border border-dashed border-slate-800 items-center justify-center py-20 text-slate-700 text-sm">
              Select a ticket to view details
            </div>
          )}
        </div>
      </div>

      {/* Create modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-7 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-black text-white">New Ticket</h2>
              <button onClick={() => setCreateOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 transition text-xs">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">Subject *</label>
                <input className={inputCls} placeholder="Describe the issue briefly" value={draft.subject} onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">Parent ID (optional)</label>
                <input className={inputCls} placeholder="Parent user ID" value={draft.parentId} onChange={e => setDraft(d => ({ ...d, parentId: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">Priority</label>
                  <select className={selectCls} value={draft.priority} onChange={e => setDraft(d => ({ ...d, priority: e.target.value }))}>
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">Status</label>
                  <select className={selectCls} value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}>
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">Message</label>
                <textarea className={`${inputCls} min-h-28 resize-none`} placeholder="Full details of the issue…" value={draft.message} onChange={e => setDraft(d => ({ ...d, message: e.target.value }))} />
              </div>
              {createErr && <p className="text-xs text-red-400">{createErr}</p>}
              <div className="flex gap-3 pt-1">
                <button onClick={() => void createTicket()} disabled={creating} className="flex-1 rounded-xl bg-violet-600 px-5 py-3 font-bold text-white hover:bg-violet-500 disabled:opacity-60 transition">
                  {creating ? "Creating…" : "Create Ticket"}
                </button>
                <button onClick={() => setCreateOpen(false)} className="rounded-xl border border-slate-700 px-5 py-3 font-bold text-slate-400 hover:bg-slate-800 transition">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

