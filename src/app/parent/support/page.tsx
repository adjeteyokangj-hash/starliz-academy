"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/layout/Navbar";
import Link from "next/link";

type Ticket = {
  id: string;
  subject: string;
  message: string | null;
  status: string;
  priority: string;
  createdAt: string;
};

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  open:        { label: "Open",        cls: "bg-violet-500/15 text-violet-300 border border-violet-500/30", dot: "bg-violet-400" },
  in_progress: { label: "In Progress", cls: "bg-amber-500/15 text-amber-300 border border-amber-500/30",   dot: "bg-amber-400" },
  resolved:    { label: "Resolved",    cls: "bg-green-500/15 text-green-300 border border-green-500/30",   dot: "bg-green-400" },
  closed:      { label: "Closed",      cls: "bg-slate-700/50 text-slate-400 border border-slate-600/30",   dot: "bg-slate-500" },
};

const PRIORITY_META: Record<string, { label: string; cls: string }> = {
  urgent: { label: "Urgent", cls: "bg-red-500/15 text-red-300 border border-red-500/30" },
  high:   { label: "High",   cls: "bg-orange-500/15 text-orange-300 border border-orange-500/30" },
  normal: { label: "Normal", cls: "bg-blue-500/15 text-blue-300 border border-blue-500/30" },
  low:    { label: "Low",    cls: "bg-slate-700/50 text-slate-400 border border-slate-600/30" },
};

export default function ParentSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("normal");
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadTickets() {
    const res = await fetch("/api/parent/support");
    if (res.ok) {
      const data = await res.json();
      setTickets(data.tickets ?? []);
    }
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadTickets(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) { setError("Please enter a subject."); return; }
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/parent/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, message, priority }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Something went wrong. Please try again.");
      return;
    }
    setSubject("");
    setMessage("");
    setPriority("normal");
    setSubmitSuccess(true);
    setTimeout(() => setSubmitSuccess(false), 5000);
    await loadTickets();
  }

  const inputCls = "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-violet-500 transition";

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Navbar />

      <div className="mx-auto max-w-3xl px-4 py-10 space-y-8">
        {/* Back link */}
        <Link href="/parent" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition">
          ← Back to Dashboard
        </Link>

        {/* Header */}
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">Help &amp; Support</h1>
          <p className="mt-1.5 text-slate-400 text-sm leading-relaxed">
            Having trouble? Submit a request below and our team will get back to you within 1–2 business days.
          </p>
        </div>

        {/* Create form */}
        <div className="rounded-3xl border border-white/10 bg-white/3 p-7">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">Subject *</label>
              <input
                className={inputCls}
                placeholder="e.g. My child can't log in"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                maxLength={255}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">Priority</label>
              <select
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-violet-500 transition"
                value={priority}
                onChange={e => setPriority(e.target.value)}
              >
                <option value="low">Low — general question</option>
                <option value="normal">Normal — something isn&apos;t working</option>
                <option value="high">High — child can&apos;t access lessons</option>
                <option value="urgent">Urgent — payment or account issue</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">Message (optional)</label>
              <textarea
                className={`${inputCls} min-h-32 resize-none`}
                placeholder="Please describe the issue with as much detail as possible…"
                value={message}
                onChange={e => setMessage(e.target.value)}
                maxLength={5000}
              />
            </div>

            {error && (
              <div className="rounded-xl bg-red-950/50 border border-red-800/50 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {submitSuccess && (
              <div className="rounded-xl bg-green-950/50 border border-green-800/50 px-4 py-3 text-sm text-green-300">
                ✓ Your request has been submitted. We&apos;ll be in touch soon.
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-2xl bg-violet-600 py-3 font-bold text-white shadow-lg shadow-violet-900/30 hover:bg-violet-500 disabled:opacity-60 transition"
            >
              {submitting ? "Submitting…" : "Submit Request"}
            </button>
          </form>
        </div>

        {/* Ticket history */}
        <div className="rounded-3xl border border-white/10 bg-white/3 p-7">
          <h2 className="mb-5 text-lg font-bold text-white">Your Requests</h2>

          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : tickets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 py-10 text-center">
              <p className="text-slate-500 text-sm">No requests yet. Submit one above if you need help.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {tickets.map(t => {
                const sm = STATUS_META[t.status] ?? STATUS_META.open;
                const pm = PRIORITY_META[t.priority] ?? PRIORITY_META.normal;
                return (
                  <li key={t.id} className="rounded-2xl border border-white/10 bg-white/2 px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-white text-sm truncate">{t.subject}</p>
                        {t.message && (
                          <p className="mt-0.5 text-xs text-slate-500 truncate">{t.message}</p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${sm.cls}`}>
                            <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${sm.dot}`} />
                            {sm.label}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${pm.cls}`}>{pm.label}</span>
                        </div>
                      </div>
                      <span className="shrink-0 text-[11px] text-slate-600 whitespace-nowrap mt-0.5">
                        {new Date(t.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
