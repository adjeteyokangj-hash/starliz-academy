"use client";

import { FormEvent, useEffect, useState } from "react";

const TIMEZONES = [
  "Europe/London","Europe/Paris","Europe/Berlin","Europe/Madrid","Europe/Rome",
  "America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
  "America/Toronto","America/Vancouver","America/Sao_Paulo",
  "Africa/Lagos","Africa/Accra","Africa/Nairobi","Africa/Johannesburg",
  "Asia/Dubai","Asia/Kolkata","Asia/Singapore","Asia/Tokyo","Asia/Shanghai",
  "Australia/Sydney","Pacific/Auckland","UTC",
];

const LOCALES = [
  { value: "en-GB", label: "English (UK)" },
  { value: "en-US", label: "English (US)" },
  { value: "en-AU", label: "English (Australia)" },
  { value: "en-CA", label: "English (Canada)" },
  { value: "fr-FR", label: "French (France)" },
  { value: "de-DE", label: "German (Germany)" },
  { value: "es-ES", label: "Spanish (Spain)" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
  { value: "ar-SA", label: "Arabic (Saudi Arabia)" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
];

type Settings = {
  appName: string;
  timezone: string;
  locale: string;
  supportEmail: string;
  maintenanceMode: boolean;
};

const defaults: Settings = {
  appName: "StarLiz Academy",
  timezone: "Europe/London",
  locale: "en-GB",
  supportEmail: "",
  maintenanceMode: false,
};

const inputCls = "w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3.5 py-3 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 transition";
const selectCls = inputCls;

export default function GeneralSettingsPage() {
  const [form, setForm] = useState<Settings>(defaults);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings/general")
      .then((r) => r.json())
      .then((p: { settings?: Settings }) => { if (p.settings) setForm(p.settings); })
      .catch(() => null);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/settings/general", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await res.json() as { error?: string };
      if (!res.ok) { setStatus({ ok: false, text: payload.error ?? "Failed to save." }); return; }
      setStatus({ ok: true, text: "General settings saved." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-16">
      <div>
        <p className="mb-1 text-xs font-black uppercase tracking-widest text-indigo-400">Platform control</p>
        <h1 className="text-2xl font-black text-white">General Settings</h1>
        <p className="mt-1 text-sm text-slate-400">App name, timezone, locale, and platform configuration.</p>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6 space-y-6 backdrop-blur">
        <div className="space-y-4">
          <label className="block text-sm font-semibold text-slate-300">
            App Name
            <input
              className={`mt-1.5 ${inputCls}`}
              value={form.appName}
              onChange={(e) => setForm((c) => ({ ...c, appName: e.target.value }))}
              required
              maxLength={80}
            />
          </label>

          <label className="block text-sm font-semibold text-slate-300">
            Support Email
            <input
              type="email"
              className={`mt-1.5 ${inputCls}`}
              value={form.supportEmail}
              onChange={(e) => setForm((c) => ({ ...c, supportEmail: e.target.value }))}
              placeholder="support@yourdomain.com"
            />
          </label>

          <label className="block text-sm font-semibold text-slate-300">
            Timezone
            <select
              className={`mt-1.5 ${selectCls}`}
              value={form.timezone}
              onChange={(e) => setForm((c) => ({ ...c, timezone: e.target.value }))}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-semibold text-slate-300">
            Locale
            <select
              className={`mt-1.5 ${selectCls}`}
              value={form.locale}
              onChange={(e) => setForm((c) => ({ ...c, locale: e.target.value }))}
            >
              {LOCALES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </label>

          <div className="flex items-center justify-between rounded-xl border border-slate-700/60 bg-slate-950/60 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">Maintenance Mode</p>
              <p className="text-xs text-slate-500">Prevents parent and student logins. Admin access is unaffected.</p>
            </div>
            <button
              type="button"
              onClick={() => setForm((c) => ({ ...c, maintenanceMode: !c.maintenanceMode }))}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${form.maintenanceMode ? "bg-amber-500" : "bg-slate-700"}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${form.maintenanceMode ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
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
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </form>
    </div>
  );
}
