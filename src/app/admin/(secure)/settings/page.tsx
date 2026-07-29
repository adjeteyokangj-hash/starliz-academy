"use client";

import { AdminCollapsibleCard } from "@/components/admin/ui";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { generatePassword } from "@/lib/password";
import { PlatformSchoolUsersPanel } from "@/components/admin/PlatformSchoolUsersPanel";
import type { PlatformUserDto, SchoolUserDto } from "@/lib/admin/access-scope";

type AdminUserRow = PlatformUserDto;

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

type Provider = "openai" | "payment" | "email" | "voice" | "storage";
type VoiceTestVoice = "alloy" | "aria" | "sage" | "verse";

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
  { title: "API Management",      icon: "🔑", desc: "Connected APIs & generated keys",    href: "/admin/settings/api-management" },
  { title: "Migration",           icon: "🔁", desc: "Local to production sync controls",  href: "/admin/settings/migration" },
  { title: "Security",            icon: "🔒", desc: "Auth, 2FA, session policy",          href: "/admin/settings/security" },
  { title: "AI Adaptation",       icon: "🧠", desc: "Frustration thresholds, warmup, pacing", href: "/admin/settings/adaptation" },
  { title: "System Health",       icon: "📡", desc: "Uptime, queues, diagnostics",        href: "/admin/settings/system-health" },
  { title: "Backup / Export",     icon: "💾", desc: "Data exports and backups",           href: "/admin/settings/backup" },
  { title: "Admin Users & Roles", icon: "👤", desc: "Access control & permissions",       href: "/admin/settings/admin-users" },
  { title: "AI Configuration",    icon: "🤖", desc: "Models, prompts, limits",            href: "/admin/ai-generator" },
];

const VOICE_TEST_TEXT_DEFAULT = "Hello, this is a live OpenAI voice test from StarLiz Academy.";
const VOICE_TEST_VOICES: readonly VoiceTestVoice[] = ["alloy", "aria", "sage", "verse"];

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
  const [testingProvider, setTestingProvider] = useState<Provider | null>(null);
  const [voiceTestText, setVoiceTestText] = useState(VOICE_TEST_TEXT_DEFAULT);
  const [voiceTestVoice, setVoiceTestVoice] = useState<VoiceTestVoice>("alloy");
  const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(null);
  const [voiceFallbackUsed, setVoiceFallbackUsed] = useState(false);

  const [admins, setAdmins] = useState<AdminUserRow[]>([]);
  const [schoolUsers, setSchoolUsers] = useState<SchoolUserDto[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [canManageAdmins, setCanManageAdmins] = useState(false);
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

  const redirectToAdminLogin = useCallback(() => {
    const nextPath = typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "/admin/settings";
    window.location.replace(`/admin/login?next=${encodeURIComponent(nextPath)}`);
  }, []);

  const handleUnauthorized = useCallback((response: Response): boolean => {
    if (response.status !== 401) return false;
    redirectToAdminLogin();
    return true;
  }, [redirectToAdminLogin]);

  const loadAdmins = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (handleUnauthorized(res)) return;
    if (res.status === 403) {
      setCanManageAdmins(false);
      setAdmins([]);
      setSchoolUsers([]);
      return;
    }
    const payload = await res.json();
    setCanManageAdmins(true);
    setAdmins(payload.platformUsers ?? payload.admins ?? []);
    setSchoolUsers(payload.schoolUsers ?? []);
  }, [handleUnauthorized]);

  const loadRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/roles");
      if (handleUnauthorized(res)) return;
      const payload = await res.json();
      if (res.ok) setRoles(payload.roles ?? []);
    } catch { /* ignore */ }
  }, [handleUnauthorized]);

  const loadKeys = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/settings/api-keys");
      if (handleUnauthorized(response)) return;
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error ?? "Unable to load saved API keys.");
        return;
      }
      setKeys(payload.keys ?? []);
      const emailKey = (payload.keys ?? []).find((k: ApiKeyRow) => k.provider === "email");
      if (emailKey?.label?.includes("@")) setEmailFrom(emailKey.label);
    } catch {
      setMessage("Unable to load saved API keys.");
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadKeys();
    void loadAdmins();
    void loadRoles();
  }, [loadKeys, loadAdmins, loadRoles]);

  useEffect(() => {
    return () => {
      if (voicePreviewUrl) {
        URL.revokeObjectURL(voicePreviewUrl);
      }
    };
  }, [voicePreviewUrl]);

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
        if (handleUnauthorized(response)) return;
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
    if (handleUnauthorized(response)) return;
    const payload = await response.json();
    if (!response.ok) { setCardMsg({ provider, text: payload.error ?? "Unable to save API key.", ok: false }); return; }
    setValues((c) => ({ ...c, [provider]: "" }));
    setCardMsg({ provider, text: `${label} key saved.`, ok: true });
    await loadKeys();
  }

  function playBrowserSpeechFallback(text: string): boolean {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return false;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-GB";
    utterance.rate = 0.96;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
    return true;
  }

  async function testKey(provider: Provider) {
    setCardMsg(null);
    setTestingProvider(provider);

    if (provider === "voice") {
      const testText = voiceTestText.trim();
      if (!testText) {
        setCardMsg({ provider, text: "Enter test text before running voice test.", ok: false });
        setTestingProvider(null);
        return;
      }

      try {
        const response = await fetch("/api/admin/voice/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: testText, voice: voiceTestVoice }),
        });
        if (handleUnauthorized(response)) return;

        if (response.ok) {
          const audioBlob = await response.blob();
          const nextUrl = URL.createObjectURL(audioBlob);
          setVoiceFallbackUsed(false);
          setVoicePreviewUrl((current) => {
            if (current) URL.revokeObjectURL(current);
            return nextUrl;
          });
          setCardMsg({ provider, text: `Voice test succeeded using ${voiceTestVoice}. Preview is ready below.`, ok: true });
          await loadKeys();
          return;
        }

        const payload = await response.json().catch(() => ({} as { error?: string }));
        const fallbackOk = playBrowserSpeechFallback(testText);
        setVoiceFallbackUsed(fallbackOk);
        setCardMsg({
          provider,
          text: fallbackOk
            ? `OpenAI TTS failed (${payload.error ?? "voice provider error"}). Browser speech fallback played instead.`
            : (payload.error ?? "Voice test failed and browser speech fallback is unavailable."),
          ok: fallbackOk,
        });
      } catch {
        const fallbackOk = playBrowserSpeechFallback(testText);
        setVoiceFallbackUsed(fallbackOk);
        setCardMsg({
          provider,
          text: fallbackOk
            ? "Voice test request failed. Browser speech fallback played instead."
            : "Voice test request failed and browser speech fallback is unavailable.",
          ok: fallbackOk,
        });
      } finally {
        setTestingProvider(null);
      }
      return;
    }

    try {
      const response = await fetch("/api/admin/settings/api-keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (handleUnauthorized(response)) return;
      const payload = await response.json();
      setCardMsg({ provider, text: payload.message ?? payload.error ?? "Test complete.", ok: response.ok });
      await loadKeys();
    } finally {
      setTestingProvider(null);
    }
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
    if (handleUnauthorized(res)) return;
    const payload = await res.json();
    if (!res.ok) { setAdminError(payload.error ?? "Unable to create platform user."); return; }
    setAdminMsg(`Platform user created for ${payload.admin.email}.`);
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
    if (handleUnauthorized(res)) return;
    const payload = await res.json();
    if (!res.ok) { setEditError(payload.error ?? "Unable to update platform user."); return; }
    setEditMsg("Platform user updated successfully.");
    setEditing(null);
    await loadAdmins();
  }

  async function deleteAdmin(id: string) {
    const res = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (handleUnauthorized(res)) return;
    const payload = await res.json();
    if (!res.ok) { setAdminError(payload.error ?? "Unable to delete platform user."); return; }
    setDeleteConfirmId(null);
    await loadAdmins();
  }

  return (
    <div className="space-y-8 pb-16">

      {/* ── Platform Modules ── */}
      <AdminCollapsibleCard
        eyebrow="Platform control"
        title="Settings"
        subtitle="Manage all platform configuration from one place."
        padding="lg"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {settingsModules
            .filter((m) => canManageAdmins || m.href !== "/admin/settings/admin-users")
            .map((m) => (
            <a
              key={m.title}
              href={m.href}
              className="group flex cursor-pointer items-start gap-3 rounded-[var(--admin-radius)] border border-[var(--admin-border)] p-4 transition hover:border-[var(--admin-primary)]/40 hover:bg-[var(--admin-primary-muted)]"
              style={{ background: "var(--admin-rail)" }}
            >
              <span className="mt-0.5 text-xl">{m.icon}</span>
              <div>
                <p className="text-sm font-bold text-[var(--admin-text)] transition group-hover:text-[var(--admin-primary-hover)]">{m.title}</p>
                <p className="admin-body mt-0.5 text-xs">{m.desc}</p>
              </div>
            </a>
          ))}
        </div>
      </AdminCollapsibleCard>

      {/* ── API Keys ── */}
      <AdminCollapsibleCard
        eyebrow="Encrypted secrets"
        title="API Keys"
        subtitle="Keys are AES-encrypted at rest and never displayed in full."
        padding="lg"
      >
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
                {item.provider === "voice" && (
                  <>
                    <select
                      value={voiceTestVoice}
                      onChange={(e) => setVoiceTestVoice(e.target.value as VoiceTestVoice)}
                      className={inputCls + " text-xs"}
                    >
                      {VOICE_TEST_VOICES.map((voice) => (
                        <option key={voice} value={voice}>{voice}</option>
                      ))}
                    </select>
                    <textarea
                      value={voiceTestText}
                      onChange={(e) => setVoiceTestText(e.target.value)}
                      rows={3}
                      maxLength={500}
                      placeholder="Text for live voice testing"
                      className={inputCls + " resize-none text-xs"}
                    />
                    {voicePreviewUrl ? (
                      <audio controls preload="metadata" src={voicePreviewUrl} className="w-full rounded-xl border border-slate-800 bg-slate-900/70">
                        Your browser does not support audio playback.
                      </audio>
                    ) : null}
                  </>
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
                  <button
                    type="button"
                    onClick={() => void testKey(item.provider)}
                    disabled={testingProvider === item.provider}
                    className="rounded-xl border border-slate-700 px-4 text-sm font-bold text-slate-300 hover:bg-slate-800 transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {testingProvider === item.provider ? "Testing..." : "Test"}
                  </button>
                  {item.provider === "voice" && cardMsg?.provider === "voice" && !cardMsg.ok ? (
                    <button
                      type="button"
                      onClick={() => void testKey("voice")}
                      disabled={testingProvider === "voice"}
                      className="rounded-xl border border-amber-500/40 px-4 text-sm font-bold text-amber-300 hover:bg-amber-500/10 transition disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Retry
                    </button>
                  ) : null}
                </div>
                {item.provider === "voice" && voiceFallbackUsed ? (
                  <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200">
                    Browser speech fallback is active for this test session.
                  </p>
                ) : null}
              </form>
            );
          })}
        </div>
      </AdminCollapsibleCard>

      {/* ── Platform Users & School Users ── */}
      {canManageAdmins ? (
      <AdminCollapsibleCard
        eyebrow="Access control"
        title="Platform Users & School Users"
        subtitle="Separate Operations Console access from school-scoped staff."
        padding="lg"
      >
        <div className="mb-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="mb-5 text-sm font-black text-slate-200">New platform user</p>
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
                <FieldInput label="Platform role">
                  <select
                    value={adminRoleId}
                    onChange={(e) => setAdminRoleId(e.target.value)}
                    className={inputCls}
                    aria-label="Platform role"
                  >
                    <option value="">Select a platform role</option>
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </FieldInput>
              ) : (
                <FieldInput label="Platform role">
                  <select disabled className={inputCls + " opacity-50 cursor-not-allowed"}>
                    <option>Loading roles...</option>
                  </select>
                </FieldInput>
              )}
              {adminError ? <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{adminError}</p> : null}
              {adminMsg  ? <p className="rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-300">{adminMsg}</p>  : null}
              <button className="w-full rounded-xl bg-indigo-600 py-3 font-black text-white hover:bg-indigo-500 transition">Create platform user</button>
            </form>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">
            <p className="font-semibold text-slate-200">How access is separated</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><span className="text-slate-200">Platform Users</span> have AdminUser rows and Operations Console access.</li>
              <li><span className="text-slate-200">School Users</span> are SchoolTeacher memberships scoped to one school.</li>
              <li>This form only creates platform users. Manage school staff from each school&apos;s staff directory.</li>
            </ul>
          </div>
        </div>

        <PlatformSchoolUsersPanel
          platformUsers={admins}
          schoolUsers={schoolUsers}
          roles={roles}
          showDelete
          deleteConfirmId={deleteConfirmId}
          onRequestDelete={setDeleteConfirmId}
          onCancelDelete={() => setDeleteConfirmId(null)}
          onDelete={(id) => void deleteAdmin(id)}
          onEdit={(admin) => { setEditing({ id: admin.id, name: admin.name ?? "", email: admin.email, password: "" }); setEditMsg(null); setEditError(null); setShowEditPw(false); }}
          onToggleActive={async (adminId, currentActive) => {
            const res = await fetch("/api/admin/users", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ adminId, active: !currentActive }),
            });
            if (handleUnauthorized(res)) return;
            const payload = await res.json();
            if (!res.ok) {
              setAdminError(payload.error ?? "Unable to update platform user.");
              return;
            }
            await loadAdmins();
          }}
        />
      </AdminCollapsibleCard>
      ) : null}

      {/* ── Edit modal ── */}
      {editing && canManageAdmins ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-7 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-black text-white">Edit platform user</h2>
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
