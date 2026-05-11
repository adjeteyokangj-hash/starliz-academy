"use client";

import { FormEvent, useEffect, useState } from "react";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import Link from "next/link";

type Settings = {
  frustrationThreshold: number;
  lowConfidenceThreshold: number;
  adaptationEnabled: boolean;
  warmupRequired: boolean;
  shortSessionMins: number;
  normalSessionMins: number;
};

const defaults: Settings = {
  frustrationThreshold: 3,
  lowConfidenceThreshold: 40,
  adaptationEnabled: true,
  warmupRequired: true,
  shortSessionMins: 5,
  normalSessionMins: 15,
};

const inputCls =
  "w-full rounded-xl border border-slate-700/80 bg-slate-950 px-3.5 py-3 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 transition";

export default function AIAdaptationSettingsPage() {
  const [form, setForm] = useState<Settings>(defaults);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings/adaptation")
      .then((r) => r.json())
      .then((p: { settings?: Settings }) => {
        if (p.settings) setForm({ ...defaults, ...p.settings });
      })
      .catch(() => null);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/settings/adaptation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setStatus({ ok: false, text: payload.error ?? "Failed to save." });
        return;
      }
      setStatus({ ok: true, text: "AI adaptation settings saved." });
    } finally {
      setSaving(false);
    }
  }

  function numField(
    key: keyof Pick<Settings, "frustrationThreshold" | "lowConfidenceThreshold" | "shortSessionMins" | "normalSessionMins">,
    label: string,
    hint: string,
    min: number,
    max: number,
  ) {
    return (
      <div>
        <label className="mb-1.5 block text-sm font-bold text-slate-300">{label}</label>
        <p className="mb-2 text-xs text-slate-500">{hint}</p>
        <input
          type="number"
          min={min}
          max={max}
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: Math.max(min, Math.min(max, Number(e.target.value))) }))}
          className={inputCls}
        />
      </div>
    );
  }

  function toggle(key: keyof Pick<Settings, "adaptationEnabled" | "warmupRequired">, label: string, hint: string) {
    return (
      <div className="flex items-start gap-4 rounded-xl border border-slate-700/60 bg-slate-900 p-4">
        <div className="flex-1">
          <p className="text-sm font-bold text-slate-200">{label}</p>
          <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
        </div>
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, [key]: !f[key] }))}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${form[key] ? "bg-indigo-500" : "bg-slate-700"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form[key] ? "translate-x-5" : "translate-x-0.5"}`}
          />
          <span className="sr-only">{form[key] ? "On" : "Off"}</span>
        </button>
      </div>
    );
  }

  return (
    <AdminSectionCard
      title="AI Adaptation Settings"
      eyebrow="Learning AI"
      action={
        <Link href="/admin/settings" className="text-sm font-bold text-slate-400 hover:text-white">
          ← Back to Settings
        </Link>
      }
    >
      <p className="mb-6 text-sm text-slate-400">
        Configure how the AI tutor adapts to student emotional signals. These thresholds control when interventions are triggered and how sessions are adjusted.
      </p>

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          {numField(
            "frustrationThreshold",
            "Frustration Alert Threshold",
            "Number of high-frustration sessions in 7 days before a red alert badge appears on the student list.",
            1, 20,
          )}
          {numField(
            "lowConfidenceThreshold",
            "Low Confidence Threshold (%)",
            "Sessions below this confidence score trigger gentle hint mode and slower pacing.",
            0, 100,
          )}
          {numField(
            "shortSessionMins",
            "Short Session Length (minutes)",
            "Used when a student signals tiredness or frustration — session is capped at this length.",
            1, 60,
          )}
          {numField(
            "normalSessionMins",
            "Normal Session Length (minutes)",
            "Standard target session length for balanced or happy moods.",
            1, 120,
          )}
        </div>

        <div className="space-y-3">
          {toggle(
            "adaptationEnabled",
            "Adaptive Session Mode",
            "When enabled, the AI tutor adjusts pacing, hints, and session length based on the student's mood signals.",
          )}
          {toggle(
            "warmupRequired",
            "Require Pre-Lesson Warmup",
            "When enabled, students must complete the voice warmup check-in before starting a lesson.",
          )}
        </div>

        {status ? (
          <p className={`rounded-xl px-4 py-3 text-sm font-bold ${status.ok ? "bg-emerald-900/40 text-emerald-300" : "bg-red-900/40 text-red-300"}`}>
            {status.text}
          </p>
        ) : null}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-indigo-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-indigo-400 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </form>
    </AdminSectionCard>
  );
}
