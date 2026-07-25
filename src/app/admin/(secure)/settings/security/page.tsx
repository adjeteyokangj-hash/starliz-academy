"use client";

import { FormEvent, useEffect, useState } from "react";

type Settings = {
  minPasswordLength: number;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
  sessionTimeoutHours: number;
  maxLoginAttempts: number;
  twoFaEnabled: boolean;
};

const defaults: Settings = {
  minPasswordLength: 8,
  requireUppercase: true,
  requireNumber: true,
  requireSpecial: false,
  sessionTimeoutHours: 24,
  maxLoginAttempts: 5,
  twoFaEnabled: false,
};

function Toggle({ value, onChange, label, note }: { value: boolean; onChange: (v: boolean) => void; label: string; note?: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-700/60 bg-slate-950/60 px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-white">{label}</p>
        {note && <p className="text-xs text-slate-500">{note}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${value ? "bg-indigo-600" : "bg-slate-700"}`}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${value ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </div>
  );
}

export default function SecuritySettingsPage() {
  const [form, setForm] = useState<Settings>(defaults);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings/security")
      .then((r) => r.json())
      .then((p: { settings?: Settings }) => { if (p.settings) setForm(p.settings); })
      .catch(() => null);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/settings/security", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await res.json() as { error?: string };
      if (!res.ok) { setStatus({ ok: false, text: payload.error ?? "Failed to save." }); return; }
      setStatus({ ok: true, text: "Security settings saved." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-16">
      <div>
        <p className="mb-1 text-xs font-black uppercase tracking-widest text-indigo-400">Platform control</p>
        <h1 className="text-2xl font-black text-white">Security Settings</h1>
        <p className="mt-1 text-sm text-slate-400">Password policy, session timeouts, and login controls.</p>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6 space-y-6 backdrop-blur">

        {/* Password Policy */}
        <div>
          <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">Password Policy</p>
          <div className="space-y-4">
            <label className="block text-sm font-semibold text-slate-300">
              Minimum Password Length
              <div className="mt-1.5 flex items-center gap-3">
                <input
                  type="range"
                  min={6}
                  max={32}
                  value={form.minPasswordLength}
                  onChange={(e) => setForm((c) => ({ ...c, minPasswordLength: Number(e.target.value) }))}
                  className="flex-1 accent-indigo-500"
                />
                <span className="w-8 text-center text-sm font-black text-indigo-300">{form.minPasswordLength}</span>
              </div>
            </label>

            <div className="space-y-2">
              <Toggle
                value={form.requireUppercase}
                onChange={(v) => setForm((c) => ({ ...c, requireUppercase: v }))}
                label="Require uppercase letter"
                note="Passwords must contain at least one uppercase character."
              />
              <Toggle
                value={form.requireNumber}
                onChange={(v) => setForm((c) => ({ ...c, requireNumber: v }))}
                label="Require number"
                note="Passwords must contain at least one digit."
              />
              <Toggle
                value={form.requireSpecial}
                onChange={(v) => setForm((c) => ({ ...c, requireSpecial: v }))}
                label="Require special character"
                note="Passwords must contain ! @ # $ % & * or similar."
              />
            </div>
          </div>
        </div>

        {/* Session */}
        <div>
          <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">Sessions</p>
          <div className="space-y-4">
            <label className="block text-sm font-semibold text-slate-300">
              Session Timeout (hours)
              <div className="mt-1.5 flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={720}
                  value={form.sessionTimeoutHours}
                  onChange={(e) => setForm((c) => ({ ...c, sessionTimeoutHours: Number(e.target.value) }))}
                  className="flex-1 accent-indigo-500"
                />
                <span className="w-16 text-center text-sm font-black text-indigo-300">
                  {form.sessionTimeoutHours >= 24
                    ? `${Math.floor(form.sessionTimeoutHours / 24)}d`
                    : `${form.sessionTimeoutHours}h`}
                </span>
              </div>
            </label>

            <label className="block text-sm font-semibold text-slate-300">
              Max Login Attempts Before Lockout
              <div className="mt-1.5 flex items-center gap-3">
                <input
                  type="range"
                  min={3}
                  max={20}
                  value={form.maxLoginAttempts}
                  onChange={(e) => setForm((c) => ({ ...c, maxLoginAttempts: Number(e.target.value) }))}
                  className="flex-1 accent-indigo-500"
                />
                <span className="w-8 text-center text-sm font-black text-indigo-300">{form.maxLoginAttempts}</span>
              </div>
            </label>
          </div>
        </div>

        {/* 2FA */}
        <div>
          <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">Two-Factor Authentication</p>
          <Toggle
            value={form.twoFaEnabled}
            onChange={(v) => setForm((c) => ({ ...c, twoFaEnabled: v }))}
            label="Enable 2FA for admin accounts"
            note="When enabled, admins will be required to verify with an authenticator app on login. Full TOTP integration required."
          />
          {form.twoFaEnabled && (
            <p className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              ⚠ 2FA enforcement requires TOTP integration (e.g. Google Authenticator). This setting saves the flag — you will need to add the verification flow before enforcing it.
            </p>
          )}
        </div>

        {status && (
          <p className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${status.ok ? "bg-green-500/10 text-green-300 border border-green-500/20" : "bg-red-500/10 text-red-300 border border-red-500/20"}`}>
            {status.text}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-black text-white hover:bg-indigo-500 disabled:opacity-50 transition"
        >
          {saving ? "Saving…" : "Save Security Settings"}
        </button>
      </form>
    </div>
  );
}
