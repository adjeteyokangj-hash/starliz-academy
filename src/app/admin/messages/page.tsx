"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type AttachmentItem = {
  name: string;
  type: string;
  size: number;
  url: string;
  uploading?: boolean;
  error?: string;
};

type ParentOption = {
  id: string;
  name: string | null;
  email: string;
};

type ThreadRow = {
  id: string;
  channel: "text" | "whatsapp";
  to: string;
  contactLabel?: string | null;
  parentEmail: string | null;
  unreadCount: number;
  lastMessageAt: string;
  lastMessage: string;
  lastDirection: "inbound" | "outbound";
};

type ChatMessage = {
  id: string;
  threadId: string;
  direction: "inbound" | "outbound";
  body: string;
  fromAddress: string;
  toAddress: string;
  providerSid: string | null;
  providerStatus: string | null;
  mediaUrls: string[];
  createdAt: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const fieldCls = "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600";

export default function AdminMessagesPage() {
  const [parents, setParents] = useState<ParentOption[]>([]);
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [channel, setChannel] = useState<"text" | "whatsapp">("whatsapp");
  const [parentId, setParentId] = useState("");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inAppReplyBody, setInAppReplyBody] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [replyStatus, setReplyStatus] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedParent = useMemo(() => parents.find((p) => p.id === parentId) ?? null, [parentId, parents]);
  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [selectedThreadId, threads],
  );
  const filteredThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((thread) => {
      return (
        thread.to.toLowerCase().includes(q)
        || (thread.parentEmail ?? "").toLowerCase().includes(q)
        || (thread.contactLabel ?? "").toLowerCase().includes(q)
        || thread.lastMessage.toLowerCase().includes(q)
      );
    });
  }, [search, threads]);

  async function loadData(threadId?: string) {
    setLoading(true);

    const params = new URLSearchParams();
    if (threadId) params.set("threadId", threadId);
    const messagesUrl = `/api/admin/messages${params.size ? `?${params.toString()}` : ""}`;

    const [parentsRes, historyRes] = await Promise.all([
      fetch("/api/admin/parents"),
      fetch(messagesUrl),
    ]);

    if (parentsRes.ok) {
      const p = await parentsRes.json();
      setParents((p.parents ?? []).map((row: { id: string; name: string | null; email: string }) => ({
        id: row.id,
        name: row.name,
        email: row.email,
      })));
    }

    if (historyRes.ok) {
      const h = await historyRes.json();
      const nextThreads = (h.items ?? []).map((item: {
        id: string;
        channel: "text" | "whatsapp";
        to: string;
        contactLabel?: string | null;
        parentEmail: string | null;
        unreadCount: number;
        lastMessageAt: string;
        lastMessage: string;
        lastDirection: "inbound" | "outbound";
      }) => item);

      setThreads(nextThreads);
      setMessages(h.messages ?? []);
      setSelectedThreadId(h.selectedThreadId ?? null);
    }

    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function handleFiles(files: FileList) {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
      "video/mp4",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "audio/mpeg",
      "audio/mp4",
      "audio/aac",
      "audio/wav",
      "audio/x-wav",
      "audio/ogg",
    ];
    const maxSize = 5 * 1024 * 1024;
    let nextCount = attachments.length;

    for (const file of Array.from(files)) {
      if (nextCount >= 5) {
        setError("You can attach up to 5 files per message.");
        break;
      }
      if (!allowed.includes(file.type)) {
        setError(`"${file.name}" is not an allowed type.`);
        continue;
      }
      if (file.size > maxSize) {
        setError(`"${file.name}" exceeds 5 MB limit.`);
        continue;
      }

      const placeholder: AttachmentItem = { name: file.name, type: file.type, size: file.size, url: "", uploading: true };
      setAttachments((prev) => [...prev, placeholder]);
      nextCount += 1;

      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/messages/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({})) as { url?: string; error?: string };

      if (!res.ok || !data.url) {
        setAttachments((prev) => prev.map((a) => a.name === file.name && a.uploading ? { ...a, uploading: false, error: data.error ?? "Upload failed" } : a));
      } else {
        setAttachments((prev) => prev.map((a) => a.name === file.name && a.uploading ? { ...a, url: data.url!, uploading: false } : a));
      }
    }
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus(null);

    const resolvedTo = selectedThread?.to ?? to.trim();

    if (!resolvedTo) {
      setError("Recipient phone number is required.");
      return;
    }

    if (!message.trim()) {
      setError("Message is required.");
      return;
    }

    if (attachments.some((a) => a.uploading)) {
      setError("Please wait for attachment uploads to finish.");
      return;
    }

    setSending(true);
    const response = await fetch("/api/admin/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel,
        parentId: parentId || undefined,
        to: resolvedTo,
        message: message.trim(),
        mediaUrls: attachments.filter((a) => a.url && !a.error).map((a) => a.url),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setSending(false);

    if (!response.ok) {
      setError(payload.error ?? "Could not send message.");
      return;
    }

    setStatus(`Sent via ${channel === "text" ? "SMS" : "WhatsApp"}${payload.providerSid ? ` (SID ${payload.providerSid})` : ""}.`);
    setMessage("");
    setAttachments([]);
    setTo("");
    await loadData(payload.threadId);
  }

  async function openThread(threadId: string) {
    setSelectedThreadId(threadId);
    await loadData(threadId);
    await fetch("/api/admin/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId }),
    });
  }

  async function handleInAppReply(event: FormEvent) {
    event.preventDefault();
    if (!selectedThreadId || !inAppReplyBody.trim()) return;
    setSendingReply(true);
    setReplyError(null);
    setReplyStatus(null);
    const res = await fetch("/api/admin/messages/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: selectedThreadId, body: inAppReplyBody.trim() }),
    });
    const payload = await res.json().catch(() => ({})) as { error?: string };
    setSendingReply(false);
    if (!res.ok) {
      setReplyError(payload.error ?? "Failed to send reply.");
      return;
    }
    setReplyStatus("Reply sent.");
    setInAppReplyBody("");
    await loadData(selectedThreadId);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Parent Messaging</h1>
        <p className="mt-1 text-slate-400">Real conversation inbox for WhatsApp and SMS contacts.</p>
      </div>

      <section className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <aside className="rounded-3xl border border-slate-800 bg-slate-900/45 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Conversations</h2>
            <button type="button" onClick={() => void loadData(selectedThreadId ?? undefined)} className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-bold text-slate-300 hover:bg-slate-800">Refresh</button>
          </div>

          <input
            className={fieldCls}
            placeholder="Search number, parent, or text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <div className="mt-3 space-y-2 overflow-y-auto max-h-[62vh] pr-1">
            {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}
            {!loading && filteredThreads.length === 0 ? <p className="text-sm text-slate-500">No chats yet. Start a new message on the right.</p> : null}
            {filteredThreads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => void openThread(thread.id)}
                className={`w-full rounded-2xl border p-3 text-left transition ${selectedThreadId === thread.id ? "border-indigo-500/60 bg-indigo-500/10" : "border-slate-800 bg-slate-950/50 hover:border-slate-700"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-white truncate">{thread.contactLabel ?? thread.parentEmail ?? thread.to}</p>
                  <span className="text-[11px] text-slate-500">{timeAgo(thread.lastMessageAt)}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500 truncate">{thread.to}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-400 truncate">{thread.lastMessage || "No content"}</p>
                  {thread.unreadCount > 0 ? <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-300">{thread.unreadCount}</span> : null}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/45 p-4 md:p-5">
          <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
            <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">New or Existing Contact</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label>
                <span className="mb-1 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Channel</span>
                <select className={fieldCls} value={channel} onChange={(event) => setChannel(event.target.value as "text" | "whatsapp")}>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="text">SMS</option>
                </select>
              </label>

              <label>
                <span className="mb-1 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Parent Link (optional)</span>
                <select className={fieldCls} value={parentId} onChange={(event) => setParentId(event.target.value)}>
                  <option value="">No parent selected</option>
                  {parents.map((parent) => (
                    <option key={parent.id} value={parent.id}>
                      {(parent.name ?? "Parent")} - {parent.email}
                    </option>
                  ))}
                </select>
              </label>

              <label className="md:col-span-2">
                <span className="mb-1 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Recipient Number</span>
                <input
                  className={fieldCls}
                  value={selectedThread?.to ?? to}
                  onChange={(event) => {
                    if (selectedThread) setSelectedThreadId(null);
                    setTo(event.target.value);
                  }}
                  placeholder="+447000000000"
                />
              </label>
            </div>
            {selectedThread ? <p className="mt-2 text-xs text-slate-500">Replying in existing chat with {selectedThread.to}</p> : null}
            {selectedParent ? <p className="mt-1 text-xs text-slate-500">Linked parent: {selectedParent.name ?? "Parent"} ({selectedParent.email})</p> : null}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
            <div className="mb-3 h-[38vh] overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/50 p-3 space-y-2">
              {messages.length === 0 ? <p className="text-sm text-slate-500">No messages yet in this conversation.</p> : null}
              {messages.map((row) => (
                <div key={row.id} className={`flex ${row.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[82%] rounded-2xl px-3 py-2 ${row.direction === "outbound" ? "bg-indigo-500/20 border border-indigo-500/30 text-indigo-100" : "bg-slate-800/80 border border-slate-700 text-slate-200"}`}>
                    <p className="whitespace-pre-wrap text-sm">{row.body}</p>
                    {row.mediaUrls.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {row.mediaUrls.map((url, idx) => (
                          <a key={`${row.id}-${idx}`} href={url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-600/80 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700/60">Attachment {idx + 1}</a>
                        ))}
                      </div>
                    ) : null}
                    <p className="mt-1 text-[11px] text-slate-500">{new Date(row.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>

            {selectedThread?.channel === "text" && selectedThread.to.includes("@") ? (
              <form className="mt-3 space-y-2" onSubmit={(event) => void handleInAppReply(event)}>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-400">In-App Reply (no phone required)</p>
                <textarea
                  className={`${fieldCls} min-h-20 resize-y`}
                  value={inAppReplyBody}
                  onChange={(event) => setInAppReplyBody(event.target.value)}
                  maxLength={2000}
                  placeholder="Type reply to parent..."
                />
                <div className="flex items-center gap-3">
                  <button type="submit" disabled={sendingReply || !inAppReplyBody.trim()} className="rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-cyan-500 disabled:opacity-50">
                    {sendingReply ? "Sending..." : "Send Reply"}
                  </button>
                  {replyStatus ? <p className="text-sm font-semibold text-emerald-400">{replyStatus}</p> : null}
                  {replyError ? <p className="text-sm font-semibold text-red-400">{replyError}</p> : null}
                </div>
              </form>
            ) : null}

            <form className="space-y-3" onSubmit={(event) => void handleSend(event)}>
              <label>
                <span className="mb-1 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Message</span>
                <textarea
                  className={`${fieldCls} min-h-24 resize-y`}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={1000}
                  placeholder="Type your reply"
                />
                <span className="mt-1 block text-right text-xs text-slate-600">{message.length}/1000</span>
              </label>

              <div>
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Attachments (max 5 files, 5 MB each)</span>
                {attachments.length > 0 ? (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {attachments.map((a, i) => (
                      <div key={`${a.name}-${i}`} className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs ${a.error ? "border-rose-500/40 bg-rose-500/10 text-rose-300" : a.uploading ? "border-slate-700 bg-slate-800/60 text-slate-400" : "border-indigo-500/30 bg-indigo-500/10 text-indigo-200"}`}>
                        <span>{a.uploading ? "Uploading" : a.error ? `Error: ${a.error}` : a.name}</span>
                        {a.url && !a.error ? <a href={a.url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:underline">Preview</a> : null}
                        <button type="button" onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-white">x</button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (event.dataTransfer.files.length) {
                      void handleFiles(event.dataTransfer.files);
                    }
                  }}
                  className="flex w-full items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/40 px-4 py-3 text-sm text-slate-400 transition hover:border-indigo-500/50 hover:text-indigo-300"
                >
                  Click or drag files to attach
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,video/mp4,application/vnd.openxmlformats-officedocument.wordprocessingml.document,audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/x-wav,audio/ogg"
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files?.length) {
                      void handleFiles(event.target.files);
                    }
                    event.target.value = "";
                  }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={sending} className="rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-400 disabled:opacity-50">
                  {sending ? "Sending..." : "Send Message"}
                </button>
                {status ? <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-200">{status}</p> : null}
                {error ? <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-bold text-rose-200">{error}</p> : null}
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
