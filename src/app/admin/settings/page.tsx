"use client";

import { FormEvent, useEffect, useState } from "react";

type AdminUserRow = {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  roleId: string | null;
  active: boolean;
  createdAt: string;
};

type RoleRow = {
  id: string;
  name: string;
};

type EditState = {
  id: string;
  name: string;
  email: string;
  password: string;
};

function generatePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;
  const rand = (s: string) => s[Math.floor(Math.random() * s.length)];
  const core = [rand(upper), rand(lower), rand(digits), rand(special)];
  for (let i = 0; i < 8; i++) core.push(rand(all));
  return core.sort(() => Math.random() - 0.5).join("");
}

type Provider = "openai" | "payment" | "email" | "voice" | "storage";

type ApiKeyRow = {
  id: string;
  provider: Provider;
  label: string;
  maskedValue: string;
  status: string;
  lastTestedAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
};

const providers: { provider: Provider; title: string; description: string; icon: string; detail: string }[] = [
  {
    provider: "openai",
    title: "OpenAI",
    description: "Spelling, maths, reading & prompt generation.",
    icon: "✦",
    detail: "Powers all AI features — spelling word suggestions, maths problem generation, reading comprehension prompts, and the AI content generator in the admin panel. Without this key, AI lessons cannot be created or served.",
  },
  {
    provider: "payment",
    title: "Payment",
    description: "Stripe, Paystack or another payment provider.",
    icon: "💳",
    detail: "Handles subscription billing, trial upgrades, and wallet top-ups. Paste your Stripe secret key (sk_live_…) or Paystack secret key here. Required for parents to purchase or manage plans.",
  },
  {
    provider: "email",
    title: "Email",
    description: "Parent emails and notification templates.",
    icon: "✉",
    detail: "Powered by Resend (resend.com). Steps: 1) Sign up free at resend.com → 2) Go to API Keys → click Create API Key → copy the key starting with re_… → 3) Paste it below and set your From address (e.g. StarLiz Academy <hello@yourdomain.com>) → 4) For production, verify your domain under Resend → Domains so emails don't land in spam. For dev, the shared sender onboarding@resend.dev works out of the box.",
  },
  {
    provider: "voice",
    title: "Voice",
    description: "Voice prompts and pronunciation services.",
    icon: "🎙",
    detail: "Provides text-to-speech for spelling word audio, reading narrations, and in-app voice prompts. Typically an ElevenLabs or Google TTS API key. Without it, audio playback falls back to the browser's built-in speech engine.",
  },
  {
    provider: "storage",
    title: "Storage",
    description: "Media assets, exports and backups.",
    icon: "🗄",
    detail: "Stores uploaded images, audio files, lesson exports, and database backups. Uses an S3-compatible key (AWS, Cloudflare R2, Supabase Storage). Required for media uploads and the Backup / Export module.",
  },
];

const settingsModules = [
  { title: "General",             icon: "⚙",  desc: "App name, timezone, locale",        href: "/admin/settings/general" },
  { title: "Branding",            icon: "🎨", desc: "Logo, colours, fonts",               href: "/admin/branding" },
  { title: "Integrations",        icon: "🔗", desc: "Third-party connections",            href: "/admin/settings/integrations" },
  { title: "Security",            icon: "🔒", desc: "Auth, 2FA, session policy",          href: "/admin/settings/security" },
  { title: "AI Adaptation",       icon: "🧠", desc: "Frustration thresholds, warmup, pacing", href: "/admin/settings/adaptation" },
  { title: "System Health",       icon: "📡", desc: "Uptime, queues, diagnostics",        href: "/admin/settings/system-health" },
  { title: "Backup / Export",     icon: "💾", desc: "Data exports and backups",           href: "/admin/settings/backup" },
  { title: "Admin Users & Roles", icon: "👤", desc: "Access control & permissions",       href: "/admin/settings/admin-users" },
  { title: "AI Configuration",    icon: "🤖", desc: "Models, prompts, limits",            href: "/admin/ai" },
];

function SectionHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <p className="mb-1 text-xs font-black uppercase tracking-widest text-indigo-400">{eyebrow}</p>
      <h2 className="text-xl font-black text-white">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
    </div>
  );
}

function FieldInput({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-slate-300">
      {label}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const inputCls = "w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3.5 py-3 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 transition";

export default function SettingsPage() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [emailFrom, setEmailFrom] = useState("");
  const [cardMsg, setCardMsg] = useState<{ provider: Provider; text: string; ok: boolean } | null>(null);

  const [admins, setAdmins] = useState<AdminUserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminRoleId, setAdminRoleId] = useState("");
  const [adminMsg, setAdminMsg] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [showAdminPw, setShowAdminPw] = useState(false);

  const [editing, setEditing] = useState<EditState | null>(null);
  const [editMsg, setEditMsg] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [showEditPw, setShowEditPw] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  async function loadAdmins() {
    const res = await fetch("/api/admin/users");
    const payload = await res.json();
    setAdmins(payload.admins ?? []);
  }

  async function loadRoles() {
    try {
      const res = await fetch("/api/admin/roles");
      const payload = await res.json();
      if (res.ok) setRoles(payload.roles ?? []);
    } catch { /* ignore */ }
  }

  async function loadKeys() {
    const response = await fetch("/api/admin/settings/api-keys");
    const payload = await response.json();
    setKeys(payload.keys ?? []);
    const emailKey = (payload.keys ?? []).find((k: ApiKeyRow) => k.provider === "email");
    if (emailKey?.label?.includes("@")) setEmailFrom(emailKey.label);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadKeys();
    void loadAdmins();
    void loadRoles();
  }, []);

  async function saveKey(event: FormEvent, provider: Provider, label: string) {
    event.preventDefault();
    setMessage(null);
    const value = values[provider]?.trim();
    const alreadySaved = keys.some((k) => k.provider === provider);
    const effectiveLabel = provider === "email" && emailFrom.trim() ? emailFrom.trim() : label;

    // Label-only update (from address changed, no new key entered)
    if (!value && alreadySaved && provider === "email" && emailFrom.trim()) {
      const response = await fetch("/api/admin/settings/api-keys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, label: effectiveLabel }),
      });
      const payload = await response.json();
      if (!response.ok) { setCardMsg({ provider, text: payload.error ?? "Unable to update from address.", ok: false }); return; }
      setCardMsg({ provider, text: "From address saved.", ok: true });
      await loadKeys();
      return;
    }

    if (!value) { setCardMsg({ provider, text: "Enter a key before saving.", ok: false }); return; }
    const response = await fetch("/api/admin/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, label: effectiveLabel, value }),
    });
    const payload = await response.json();
    if (!response.ok) { setCardMsg({ provider, text: payload.error ?? "Unable to save API key.", ok: false }); return; }
    setValues((c) => ({ ...c, [provider]: "" }));
    setCardMsg({ provider, text: `${label} key saved.`, ok: true });
    await loadKeys();
  }

  async function testKey(provider: Provider) {
    setCardMsg(null);
    const response = await fetch("/api/admin/settings/api-keys/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    const payload = await response.json();
    setCardMsg({ provider, text: payload.message ?? payload.error ?? "Test complete.", ok: response.ok });
    await loadKeys();
  }

  async function createAdmin(event: FormEvent) {
    event.preventDefault();
    setAdminMsg(null);
    setAdminError(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: adminName, email: adminEmail, password: adminPassword, ...(adminRoleId ? { roleId: adminRoleId } : {}) }),
    });
    const payload = await res.json();
    if (!res.ok) { setAdminError(payload.error ?? "Unable to create admin user."); return; }
    setAdminMsg(`Admin account created for ${payload.admin.email}.`);
    setAdminName(""); setAdminEmail(""); setAdminPassword(""); setAdminRoleId("");
    await loadAdmins();
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setEditMsg(null); setEditError(null);
    const body: Record<string, string> = {};
    if (editing.name) body.name = editing.name;
    if (editing.email) body.email = editing.email;
    if (editing.password) body.password = editing.password;
    const res = await fetch(`/api/admin/users/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json();
    if (!res.ok) { setEditError(payload.error ?? "Unable to update admin."); return; }
    setEditMsg("Admin updated successfully.");
    setEditing(null);
    await loadAdmins();
  }

  async function deleteAdmin(id: string) {
    const res = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const payload = await res.json();
    if (!res.ok) { setAdminError(payload.error ?? "Unable to delete admin."); return; }
    setDeleteConfirmId(null);
    await loadAdmins();
  }

  return (
    <div className="space-y-8 pb-16">

      {/* ── Platform Modules ── */}
      <section className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur">
        <SectionHeader eyebrow="Platform control" title="Settings" subtitle="Manage all platform configuration from one place." />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {settingsModules.map((m) => (
            <a key={m.title} href={m.href} className="group flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 transition hover:border-indigo-500/40 hover:bg-indigo-950/20">
              <span className="mt-0.5 text-xl">{m.icon}</span>
              <div>
                <p className="text-sm font-black text-white group-hover:text-indigo-200 transition">{m.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{m.desc}</p>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* ── API Keys ── */}
      <section className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur">
        <SectionHeader
          eyebrow="Encrypted secrets"
          title="API Keys"
          subtitle="Keys are AES-encrypted at rest and never displayed in full."
        />
        {message ? (
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-3 text-sm font-semibold text-indigo-200">
            <span>ℹ</span> {message}
          </div>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {providers.map((item) => {
            const saved = keys.find((k) => k.provider === item.provider);
            const isConnected = saved?.status === "connected";
            return (
              <form
                key={item.provider}
                onSubmit={(e) => void saveKey(e, item.provider, item.title)}
                className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-5 transition hover:border-slate-700"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-xl">{item.icon}</span>
                    <div>
                      <p className="font-black text-white">{item.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${isConnected ? "bg-green-500/15 text-green-300" : "bg-slate-800 text-slate-400"}`}>
                    {saved?.status ?? "not saved"}
                  </span>
                </div>
                <p className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-xs leading-relaxed text-slate-400">{item.detail}</p>
                {saved ? (
                  <div className="rounded-xl bg-slate-900 px-3 py-2.5 text-xs">
                    <span className="text-slate-500">Saved: </span>
                    <span className="font-mono font-bold text-slate-200">{saved.maskedValue}</span>
                  </div>
                ) : null}
                {item.provider === "email" && (
                  <input
                    value={emailFrom}
                    onChange={(e) => setEmailFrom(e.target.value)}
                    placeholder='From address — e.g. StarLiz Academy <hello@yourdomain.com>'
                    className={inputCls + " text-xs"}
                  />
                )}
                <input
                  value={values[item.provider] ?? ""}
                  onChange={(e) => setValues((c) => ({ ...c, [item.provider]: e.target.value }))}
                  placeholder={item.provider === "email" ? "Resend API key — re_…" : "Paste key here…"}
                  className={inputCls + " font-mono text-xs"}
                />
                {cardMsg?.provider === item.provider && (
                  <p className={`rounded-xl px-3 py-2 text-xs font-semibold ${cardMsg.ok ? "bg-green-500/10 text-green-300 border border-green-500/20" : "bg-red-500/10 text-red-300 border border-red-500/20"}`}>
                    {cardMsg.text}
                  </p>
                )}
                <div className="flex gap-2">
                  <button className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-black text-white hover:bg-indigo-500 transition">Save key</button>
                  <button type="button" onClick={() => void testKey(item.provider)} className="rounded-xl border border-slate-700 px-4 text-sm font-bold text-slate-300 hover:bg-slate-800 transition">
                    Test
                  </button>
                </div>
              </form>
            );
          })}
        </div>
      </section>

      {/* ── Admin Users & Roles ── */}
      <section className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur">
        <SectionHeader eyebrow="Access control" title="Admin Users & Roles" subtitle="Create and manage admin accounts with full portal access." />
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">

          {/* Create form */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="mb-5 text-sm font-black text-slate-200">New admin account</p>
            <form onSubmit={(e) => void createAdmin(e)} className="space-y-4">
              <FieldInput label="Name">
                <input value={adminName} onChange={(e) => setAdminName(e.target.value)} required placeholder="Full name" className={inputCls} />
              </FieldInput>
              <FieldInput label="Email address">
                <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required placeholder="admin@example.com" className={inputCls} />
              </FieldInput>
              <FieldInput label="Password — min 8 characters">
                <div className="flex gap-2">
                  <input
                    type={showAdminPw ? "text" : "password"}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    minLength={8}
                    required
                    placeholder="••••••••"
                    className={inputCls}
                  />
                  <button type="button" onClick={() => setShowAdminPw((v) => !v)} className="shrink-0 rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-bold text-slate-300 hover:text-white transition">
                    {showAdminPw ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAdminPassword(generatePassword()); setShowAdminPw(true); }}
                    className="shrink-0 whitespace-nowrap rounded-xl border border-indigo-700/60 bg-indigo-950/50 px-3 text-xs font-bold text-indigo-300 hover:bg-indigo-900/50 hover:text-white transition"
                  >
                    Generate
                  </button>
                </div>
              </FieldInput>
              {roles.length > 0 ? (
                <FieldInput label="Role">
                  <select
                    value={adminRoleId}
                    onChange={(e) => setAdminRoleId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">No role assigned</option>
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </FieldInput>
              ) : (
                <FieldInput label="Role">
                  <select disabled className={inputCls + " opacity-50 cursor-not-allowed"}>
                    <option>Loading roles...</option>
                  </select>
                </FieldInput>
              )}
              {adminError ? <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{adminError}</p> : null}
              {adminMsg  ? <p className="rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-300">{adminMsg}</p>  : null}
              <button className="w-full rounded-xl bg-indigo-600 py-3 font-black text-white hover:bg-indigo-500 transition">Create admin account</button>
            </form>
          </div>

          {/* Admins list */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-black text-slate-200">Existing admins <span className="ml-1.5 rounded-full bg-slate-800 px-2 py-0.5 text-xs font-bold text-slate-400">{admins.length}</span></p>
            </div>
            {admins.length === 0 ? (
              <p className="rounded-2xl border border-slate-800 bg-slate-950/50 p-6 text-center text-sm text-slate-500">No admin accounts yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {admins.map((admin) => (
                  <li key={admin.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3.5 transition hover:border-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-sm font-black text-indigo-300">
                          {(admin.name ?? admin.email).charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-white">{admin.name ?? "—"}</p>
                          <p className="truncate text-xs text-slate-400">{admin.email}</p>
                          {admin.role && <p className="truncate text-xs text-indigo-400">{admin.role}</p>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-black ${admin.active ? "bg-green-500/15 text-green-300" : "bg-slate-800 text-slate-500"}`}>
                          {admin.active ? "active" : "inactive"}
                        </span>
                        <button
                          type="button"
                          onClick={() => { setEditing({ id: admin.id, name: admin.name ?? "", email: admin.email, password: "" }); setEditMsg(null); setEditError(null); setShowEditPw(false); }}
                          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition"
                        >
                          Edit
                        </button>
                        {admins.length > 1 && (
                          deleteConfirmId === admin.id ? (
                            <div className="flex gap-1.5">
                              <button type="button" onClick={() => void deleteAdmin(admin.id)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500 transition">Confirm</button>
                              <button type="button" onClick={() => setDeleteConfirmId(null)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-400 hover:bg-slate-800 transition">Cancel</button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(admin.id)}
                              className="rounded-lg border border-red-900/50 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-950/50 hover:text-red-300 transition"
                            >
                              Delete
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* ── Edit modal ── */}
      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-7 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-black text-white">Edit admin</h2>
              <button type="button" onClick={() => setEditing(null)} className="rounded-full p-1 text-slate-400 hover:text-white transition">✕</button>
            </div>
            <form onSubmit={(e) => void saveEdit(e)} className="space-y-4">
              <FieldInput label="Name">
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required className={inputCls} />
              </FieldInput>
              <FieldInput label="Email address">
                <input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} required className={inputCls} />
              </FieldInput>
              <FieldInput label="New password — leave blank to keep current">
                <div className="flex gap-2">
                  <input
                    type={showEditPw ? "text" : "password"}
                    value={editing.password}
                    onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                    minLength={editing.password ? 8 : undefined}
                    placeholder="••••••••"
                    className={inputCls}
                  />
                  <button type="button" onClick={() => setShowEditPw((v) => !v)} className="shrink-0 rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs font-bold text-slate-300 hover:text-white transition">
                    {showEditPw ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditing({ ...editing, password: generatePassword() }); setShowEditPw(true); }}
                    className="shrink-0 whitespace-nowrap rounded-xl border border-indigo-700/60 bg-indigo-950/50 px-3 text-xs font-bold text-indigo-300 hover:bg-indigo-900/50 hover:text-white transition"
                  >
                    Generate
                  </button>
                </div>
              </FieldInput>
              {editError ? <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{editError}</p> : null}
              {editMsg   ? <p className="rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-300">{editMsg}</p>   : null}
              <div className="flex gap-3 pt-1">
                <button className="flex-1 rounded-xl bg-indigo-600 py-3 font-black text-white hover:bg-indigo-500 transition">Save changes</button>
                <button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-slate-700 px-5 py-3 font-bold text-slate-300 hover:bg-slate-800 transition">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
