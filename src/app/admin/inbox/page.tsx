"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getInboxRedirectUri } from "@/lib/imap-client";

// ── Types ─────────────────────────────────────────────────────────────────────
type Message = {
  id: string;
  subject: string;
  from: string;
  fromName: string;
  to: string;
  date: string;
  isRead: boolean;
  hasAttachments: boolean;
  bodyPreview: string;
  body?: string;
};

const FOLDERS = ["inbox", "sent", "drafts", "deleted", "junk"] as const;
type Folder = typeof FOLDERS[number];
const folderLabel: Record<Folder, string> = {
  inbox: "📥 Inbox",
  sent: "📤 Sent",
  drafts: "📝 Drafts",
  deleted: "🗑 Deleted",
  junk: "🚫 Junk",
};

const inputCls =
  "w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3.5 py-3 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 transition";

// ── Setup Form ────────────────────────────────────────────────────────────────
function SetupForm({ onConnected }: { onConnected: (email: string) => void }) {
  const [email] = useState("support@starlizacademy.com");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const redirectUri = useMemo(() => {
    if (typeof window === "undefined") return "/api/admin/inbox/oauth/callback";
    return getInboxRedirectUri(window.location.origin);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      window.location.href = "/api/admin/inbox/oauth/start";
    } catch {
      setSaving(false);
      setError("Failed to start Microsoft OAuth.");
      return;
    }
    onConnected(email);
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-linear-to-br from-blue-600 to-indigo-700 text-4xl shadow-xl">
        📧
      </div>
      <div>
        <h1 className="text-2xl font-black text-white">Connect Inbox</h1>
        <p className="mt-1 text-sm text-slate-400">Using <span className="text-white font-bold">support@starlizacademy.com</span> (Microsoft 365 Business)</p>
        <div className="mt-4 rounded-xl border border-slate-700/60 bg-slate-800/40 p-4 text-left text-xs text-slate-400 max-w-lg mx-auto space-y-3">
          <p className="font-black text-slate-200 text-sm">Microsoft Graph OAuth setup:</p>

          <div>
            <p className="font-bold text-indigo-300 mb-1">Step 1 — Azure App Registration</p>
            <ol className="list-decimal list-inside space-y-0.5 ml-1">
              <li>In Azure, register an app for StarLiz Inbox and add a Web redirect URI.</li>
              <li>Set redirect URI to <span className="text-white">{redirectUri}</span>.</li>
              <li>Add delegated permissions: <span className="text-white">Mail.ReadWrite</span>, <span className="text-white">Mail.Send</span>, <span className="text-white">User.Read</span>, <span className="text-white">offline_access</span>.</li>
              <li>Grant admin consent for the tenant.</li>
            </ol>
          </div>

          <div>
            <p className="font-bold text-indigo-300 mb-1">Step 2 — Configure env vars</p>
            <ol className="list-decimal list-inside space-y-0.5 ml-1">
              <li>Set <span className="text-white">MICROSOFT_CLIENT_ID</span>, <span className="text-white">MICROSOFT_CLIENT_SECRET</span>, and <span className="text-white">MICROSOFT_TENANT_ID</span>.</li>
              <li>Set <span className="text-white">NEXT_PUBLIC_APP_URL</span> to your app URL.</li>
            </ol>
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
            <p className="font-bold text-amber-300">Why this flow:</p>
            <p className="mt-0.5">This uses Microsoft-approved OAuth via Graph API and avoids legacy IMAP/SMTP basic auth blocks.</p>
          </div>
        </div>
      </div>
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 text-left">
        <input type="email" value={email} readOnly className={inputCls} />
        {error && (
          <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>
        )}
        <button
          disabled={saving}
          className="w-full rounded-2xl bg-indigo-600 py-3.5 font-black text-white hover:bg-indigo-500 disabled:opacity-60 transition"
        >
          {saving ? "Redirecting to Microsoft…" : "Connect with Microsoft 365 →"}
        </button>
      </form>
      <p className="max-w-xs text-xs text-slate-500">
        Credentials are encrypted and stored securely. Only accessible to admin.
      </p>
    </div>
  );
}

// ── Compose Modal ─────────────────────────────────────────────────────────────
function ComposeModal({
  replyTo,
  onClose,
  onSent,
}: {
  replyTo?: Message | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState(replyTo?.from ?? "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : "");
  const [body, setBody] = useState(
    replyTo
      ? `\n\n\n--- Original Message ---\nFrom: ${replyTo.from}\n${replyTo.bodyPreview}`
      : ""
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!to || !subject || !body) { setError("To, subject, and body are required."); return; }
    setSending(true);
    setError(null);
    const res = await fetch("/api/admin/inbox/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, cc: cc || undefined, subject, body }),
    });
    setSending(false);
    if (!res.ok) { const d = await res.json(); setError(d.error ?? "Failed to send."); return; }
    onSent();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700/60 px-5 py-3">
          <h3 className="font-black text-white">{replyTo ? "Reply" : "New Message"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">✕</button>
        </div>
        <div className="space-y-3 p-5">
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" className={inputCls} />
          <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Cc (optional)" className={inputCls} />
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className={inputCls} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Write your message…" className={inputCls} />
          {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-sm text-rose-200">{error}</p>}
          <div className="flex gap-3">
            <button onClick={send} disabled={sending} className="rounded-xl bg-indigo-600 px-5 py-2.5 font-black text-white hover:bg-indigo-500 disabled:opacity-60 transition">
              {sending ? "Sending…" : "Send"}
            </button>
            <button onClick={onClose} className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-300 hover:bg-slate-800 transition">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name: string, email: string): string {
  const n = name.trim();
  if (n) {
    const parts = n.split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : n.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function avatarColor(seed: string): string {
  const colors = [
    "from-violet-500 to-indigo-600",
    "from-indigo-500 to-blue-600",
    "from-blue-500 to-cyan-600",
    "from-emerald-500 to-teal-600",
    "from-rose-500 to-pink-600",
    "from-amber-500 to-orange-600",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

function parseEmailBody(raw: string): { main: string; quoted: string | null } {
  const separators = [
    /\n[-─]{3,}[\s]*Original Message[\s]*[-─]{3,}/i,
    /\n[-─]{3,}[\s]*Forwarded Message[\s]*[-─]{3,}/i,
    /\nOn .{5,100} wrote:/,
    /\n>{2,}/,
  ];
  for (const sep of separators) {
    const idx = raw.search(sep);
    if (idx > 0) {
      return { main: raw.slice(0, idx).trim(), quoted: raw.slice(idx).trim() };
    }
  }
  // strip leading-`>` lines at the end
  const lines = raw.split("\n");
  const firstQuote = lines.findIndex((l) => l.startsWith(">"));
  if (firstQuote > 0 && firstQuote > lines.length * 0.5) {
    return {
      main: lines.slice(0, firstQuote).join("\n").trim(),
      quoted: lines.slice(firstQuote).join("\n").trim(),
    };
  }
  return { main: raw.trim(), quoted: null };
}

// ── Reading Pane ──────────────────────────────────────────────────────────────
function ReadingPane({
  selected,
  fullMessage,
  onReply,
  onDelete,
}: {
  selected: Message;
  fullMessage: Message | null;
  onReply: () => void;
  onDelete: () => void;
}) {
  const [quotedOpen, setQuotedOpen] = useState(false);
  const raw = fullMessage?.body ?? fullMessage?.bodyPreview ?? null;
  const parsed = raw ? parseEmailBody(raw) : null;
  const initials = getInitials(selected.fromName, selected.from);
  const color = avatarColor(selected.from);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Top action bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-700/50 bg-slate-900/80 px-6 py-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="rounded-md bg-slate-800 px-2 py-1 font-mono text-slate-400">{selected.subject || "(No subject)"}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onReply}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white hover:bg-indigo-500 transition shadow-md shadow-indigo-900/40"
          >
            ↩ Reply
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-400 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300 transition"
          >
            🗑 Delete
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Subject + sender card */}
        <div className="border-b border-slate-700/40 bg-slate-950/40 px-6 py-5">
          <h2 className="text-xl font-black leading-tight text-white">
            {selected.subject || "(No subject)"}
          </h2>

          <div className="mt-4 flex items-start gap-3">
            {/* Avatar */}
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br ${color} text-sm font-black text-white shadow-lg`}>
              {initials}
            </div>

            {/* From / To / Date */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-black text-white text-sm">{selected.fromName || selected.from}</span>
                {selected.fromName && (
                  <span className="text-xs text-slate-500">&lt;{selected.from}&gt;</span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                <span><span className="text-slate-600">To:</span> {selected.to}</span>
                <span><span className="text-slate-600">Date:</span> {new Date(selected.date).toLocaleString()}</span>
                {selected.hasAttachments && (
                  <span className="text-amber-400">📎 Attachment</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {!fullMessage ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              Loading message…
            </div>
          ) : parsed ? (
            <div className="space-y-4">
              {/* Main content */}
              <div className="rounded-2xl border border-slate-700/50 bg-slate-950/60 p-5">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-200">
                  {parsed.main}
                </pre>
              </div>

              {/* Quoted / original content */}
              {parsed.quoted && (
                <div>
                  <button
                    onClick={() => setQuotedOpen((v) => !v)}
                    className="flex items-center gap-2 rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-slate-200 transition"
                  >
                    <span className={`transition-transform ${quotedOpen ? "rotate-90" : ""}`}>▶</span>
                    {quotedOpen ? "Hide" : "Show"} original message
                  </button>
                  {quotedOpen && (
                    <div className="mt-2 rounded-2xl border border-slate-700/30 bg-slate-900/30 px-5 py-4">
                      <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-500">
                        {parsed.quoted}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-300">
              {selected.bodyPreview}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminInboxPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [folder, setFolder] = useState<Folder>("inbox");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Message | null>(null);
  const [fullMessage, setFullMessage] = useState<Message | null>(null);
  const [composing, setComposing] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchMessages = useCallback(async (f: Folder) => {
    setLoading(true);
    setSelected(null);
    setFullMessage(null);
    try {
      const res = await fetch(`/api/admin/inbox?folder=${f}`, { credentials: "include" });
      if (!res.ok) { setConnected(false); return; }
      const data = await res.json();
      setConnected(data.connected ?? false);
      if (data.account?.email) setAccount(data.account.email);
      setMessages(data.messages ?? []);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchMessages(folder);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [folder, fetchMessages]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectedFlag = params.get("connected") === "1";
    const oauth = params.get("oauth");
    const hasOauthError = params.get("error") === "oauth_failed" || oauth === "error";
    if (!connectedFlag && !oauth && !hasOauthError) return;

    const timer = window.setTimeout(() => {
      if (connectedFlag || oauth === "connected") {
        setNotice("✅ Inbox connected with Microsoft Graph OAuth.");
        void fetchMessages(folder);
      } else {
        setNotice("❌ Inbox OAuth failed.");
      }
    }, 0);

    window.history.replaceState({}, "", "/admin/inbox");
    return () => window.clearTimeout(timer);
  }, [fetchMessages, folder]);

  async function openMessage(msg: Message) {
    setSelected(msg);
    setFullMessage(null);
    const res = await fetch(`/api/admin/inbox/${encodeURIComponent(msg.id)}`);
    
    if (!res.ok) {
      setConnected(false);
      return;
    }
    const full = await res.json();
    setFullMessage(full);
    setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, isRead: true } : m));
  }

  async function deleteMsg(msgId: string) {
    if (!confirm("Delete this message?")) return;
    await fetch(`/api/admin/inbox/${encodeURIComponent(msgId)}`, { method: "DELETE", credentials: "include" });
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    if (selected?.id === msgId) { setSelected(null); setFullMessage(null); }
  }

  async function disconnect() {
    if (!confirm("Disconnect inbox?")) return;
    await fetch("/api/admin/inbox/config", { method: "DELETE", credentials: "include" });
    setConnected(false);
    setMessages([]);
    setAccount(null);
  }

  if (connected === null) {
    return <div className="flex items-center justify-center py-20 text-sm text-slate-400">Loading…</div>;
  }

  if (!connected) {
    return <SetupForm onConnected={(email) => { setAccount(email); }} />;
  }

  return (
    <div className="flex flex-col gap-3 md:h-[calc(100vh-8rem)] md:gap-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-400">Admin</p>
          <h1 className="text-2xl font-black text-white">Inbox</h1>
          {account && (
            <p className="text-xs text-slate-400">
              {account} ·{" "}
              <button onClick={disconnect} className="text-rose-400 hover:underline">Disconnect</button>
            </p>
          )}
        </div>
        <button onClick={() => { setReplyTo(null); setComposing(true); }} className="w-full rounded-2xl bg-indigo-600 px-5 py-2.5 font-black text-white hover:bg-indigo-500 transition sm:w-auto">
          ✏️ Compose
        </button>
      </div>

      {notice && (
        <p className={`rounded-xl border px-4 py-2.5 text-sm ${notice.startsWith("✅") ? "border-green-500/30 bg-green-500/10 text-green-200" : "border-rose-500/30 bg-rose-500/10 text-rose-200"}`}>
          {notice}
        </p>
      )}

      {/* Layout */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-visible lg:flex-row lg:gap-4 lg:overflow-hidden">
        {/* Folder sidebar */}
        <div className="flex shrink-0 gap-2 overflow-x-auto rounded-2xl border border-slate-700/60 bg-slate-900/60 p-2.5 lg:w-44 lg:flex-col lg:gap-0.5 lg:overflow-visible">
          {FOLDERS.map((f) => (
            <button
              key={f}
              onClick={() => setFolder(f)}
              className={`whitespace-nowrap rounded-xl px-3 py-2.5 text-left text-sm font-bold transition lg:whitespace-normal ${
                folder === f
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/40"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              {folderLabel[f]}
            </button>
          ))}
        </div>

        {/* Message list */}
        <div className="flex max-h-80 shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/60 lg:max-h-none lg:w-72">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-slate-400">Loading…</div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <span className="text-3xl opacity-30">📭</span>
              <p className="text-sm text-slate-500">No messages</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-slate-700/30">
              {messages.map((msg) => {
                const initials = getInitials(msg.fromName, msg.from);
                const color = avatarColor(msg.from);
                const isActive = selected?.id === msg.id;
                return (
                  <button
                    key={msg.id}
                    onClick={() => openMessage(msg)}
                    className={`group w-full px-4 py-3.5 text-left transition ${
                      isActive
                        ? "bg-indigo-600/20 border-l-2 border-l-indigo-500"
                        : "hover:bg-slate-800/50 border-l-2 border-l-transparent"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br ${color} text-xs font-black text-white`}>
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className={`truncate text-sm ${msg.isRead ? "text-slate-300" : "font-black text-white"}`}>
                            {msg.fromName || msg.from}
                          </p>
                          <p className="shrink-0 text-[10px] text-slate-500">{new Date(msg.date).toLocaleDateString()}</p>
                        </div>
                        <p className={`mt-0.5 truncate text-xs ${msg.isRead ? "text-slate-500" : "font-semibold text-slate-300"}`}>
                          {msg.subject || "(No subject)"}
                        </p>
                        {msg.hasAttachments && (
                          <span className="mt-1 inline-block text-[10px] text-amber-500">📎</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail pane */}
        <div className="flex min-h-80 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/60 lg:min-h-0">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <span className="text-4xl opacity-20">✉️</span>
              <p className="text-sm text-slate-500">Select a message to read</p>
            </div>
          ) : (
            <ReadingPane
              selected={selected}
              fullMessage={fullMessage}
              onReply={() => { setReplyTo(selected); setComposing(true); }}
              onDelete={() => deleteMsg(selected.id)}
            />
          )}
        </div>
      </div>

      {composing && (
        <ComposeModal
          replyTo={replyTo}
          onClose={() => { setComposing(false); setReplyTo(null); }}
          onSent={() => {
            setNotice("✅ Message sent!");
            setTimeout(() => setNotice(null), 4000);
          }}
        />
      )}
    </div>
  );
}
