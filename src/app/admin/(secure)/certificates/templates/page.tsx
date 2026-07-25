"use client";

import { useEffect, useMemo, useState } from "react";
import CertificatePreview from "@/components/certificates/CertificatePreview";
import type { CertificateTemplateType } from "@/components/certificates/certificate-designs";
import {
  availableCertificateTemplates,
  availableCertificateThemes,
  buildCertificateTemplatePreviewData,
  validateCertificateTemplateSettings,
  defaultCertificateTemplateSettings,
  type CertificateTemplateSettings,
  type CertificateTemplateSetting,
} from "@/lib/certificate-template-settings";
import type { CertificateThemeName } from "@/components/certificates/certificate-theme";

const CERTIFICATE_TYPES: ReadonlyArray<{ value: CertificateTemplateType; label: string }> = [
  { value: "term_completion", label: "Term Completion" },
  { value: "end_of_term_exam", label: "End of Term Exam" },
  { value: "subject_achievement", label: "Subject Achievement" },
  { value: "english_achievement", label: "English Achievement" },
  { value: "mastery_certificate", label: "Mastery Certificate" },
  { value: "award_certificate", label: "Award Certificate" },
];

type PersistenceMode = "audit_log" | "preview_only";

type SettingsResponse = {
  settings?: unknown;
  availableTemplates?: ReadonlyArray<{ value: CertificateTemplateSetting["template"]; label: string; description: string }>;
  availableThemes?: ReadonlyArray<{ value: CertificateThemeName; label: string; description: string }>;
  persistenceMode?: PersistenceMode;
  updatedAt?: string | null;
  updatedBy?: string | null;
  error?: string;
};

function labelForType(type: CertificateTemplateType): string {
  return CERTIFICATE_TYPES.find((item) => item.value === type)?.label ?? type;
}

export default function AdminCertificateTemplatesPage() {
  const [settings, setSettings] = useState<CertificateTemplateSettings>(defaultCertificateTemplateSettings);
  const [templates, setTemplates] = useState(availableCertificateTemplates);
  const [themes, setThemes] = useState(availableCertificateThemes);
  const [previewType, setPreviewType] = useState<CertificateTemplateType>("term_completion");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [persistenceMode, setPersistenceMode] = useState<PersistenceMode>("preview_only");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [updatedBy, setUpdatedBy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      setIsLoading(true);
      setStatusMessage(null);
      try {
        const response = await fetch("/api/admin/certificates/templates/settings", { cache: "no-store" });
        const payload = await response.json() as SettingsResponse;
        if (!active) return;

        if (!response.ok) {
          setStatusMessage(payload.error ?? "Failed to load certificate template settings.");
          setPersistenceMode(payload.persistenceMode ?? "preview_only");
          return;
        }

        setSettings(validateCertificateTemplateSettings(payload.settings ?? null));
        setTemplates(payload.availableTemplates ?? availableCertificateTemplates);
        setThemes(payload.availableThemes ?? availableCertificateThemes);
        setPersistenceMode(payload.persistenceMode ?? "preview_only");
        setUpdatedAt(payload.updatedAt ?? null);
        setUpdatedBy(payload.updatedBy ?? null);
      } catch {
        if (!active) return;
        setStatusMessage("Unable to load certificate template settings.");
        setPersistenceMode("preview_only");
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadSettings();

    return () => {
      active = false;
    };
  }, []);

  const previewData = useMemo(() => {
    return buildCertificateTemplatePreviewData({
      certificateType: previewType,
      settings,
    });
  }, [previewType, settings]);

  function updateTypeSetting(type: CertificateTemplateType, updates: Partial<CertificateTemplateSetting>) {
    setSettings((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        ...updates,
      },
    }));
    setStatusMessage(null);
  }

  async function saveSettings() {
    setIsSaving(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/admin/certificates/templates/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const payload = await response.json() as SettingsResponse;

      if (!response.ok) {
        setStatusMessage(payload.error ?? "Failed to save settings.");
        if (payload.persistenceMode === "preview_only") {
          setPersistenceMode("preview_only");
        }
        return;
      }

      setSettings(validateCertificateTemplateSettings(payload.settings ?? null));
      setPersistenceMode(payload.persistenceMode ?? "audit_log");
      setUpdatedAt(payload.updatedAt ?? null);
      setUpdatedBy(payload.updatedBy ?? null);
      setStatusMessage(payload.persistenceMode === "preview_only"
        ? "Saved in preview-only mode for this environment."
        : "Template settings saved successfully.");
    } catch {
      setStatusMessage("Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  }

  const modeLabel = persistenceMode === "audit_log" ? "Persisted" : "Preview-only";
  const modeClass = persistenceMode === "audit_log"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
    : "border-amber-500/30 bg-amber-500/10 text-amber-200";

  return (
    <main className="space-y-6">
      <section>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Admin certificates</p>
        <h1 className="mt-2 text-3xl font-black text-white">Certificate Template Controls</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">
          Configure template defaults by certificate type using safe demo data. This page does not change certificate issuing, award review, or verification rules.
        </p>
      </section>

      <section className={`rounded-2xl border p-4 text-sm ${modeClass}`}>
        <p className="font-semibold">Persistence mode: {modeLabel}</p>
        {updatedAt ? <p className="mt-1">Last saved: {new Date(updatedAt).toLocaleString("en-GB")}{updatedBy ? ` by ${updatedBy}` : ""}</p> : null}
        {persistenceMode === "preview_only" ? <p className="mt-1">Settings fallback defaults are active if persistence storage is unavailable.</p> : null}
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white">Default Template Map</h2>
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={isSaving || isLoading}
            className="rounded-xl border border-slate-500 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-100 hover:bg-slate-800"
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </button>
        </div>

        {statusMessage ? (
          <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200">{statusMessage}</p>
        ) : null}

        {isLoading ? <p className="mb-3 text-xs text-slate-400">Loading saved settings...</p> : null}

        <div className="space-y-3">
          {CERTIFICATE_TYPES.map((type) => (
            <article key={type.value} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-end">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Certificate type</p>
                  <p className="mt-1 text-sm font-semibold text-white">{type.label}</p>
                </div>

                <label className="block text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                  Template style
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm font-semibold text-white"
                    value={settings[type.value].template}
                    disabled={isLoading}
                    onChange={(event) => updateTypeSetting(type.value, { template: event.target.value as CertificateTemplateSetting["template"] })}
                  >
                    {templates.map((template) => (
                      <option key={template.value} value={template.value}>{template.label}</option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                  Theme / accent
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm font-semibold text-white"
                    value={settings[type.value].theme}
                    disabled={isLoading}
                    onChange={(event) => updateTypeSetting(type.value, { theme: event.target.value as CertificateThemeName })}
                  >
                    {themes.map((theme) => (
                      <option key={theme.value} value={theme.value}>{theme.label}</option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => setPreviewType(type.value)}
                  className="rounded-lg border border-cyan-400/50 bg-cyan-500/20 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-500/30"
                >
                  Preview Certificate
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Template preview</p>
            <h3 className="text-base font-bold text-white">{labelForType(previewType)}</h3>
          </div>
          <div className="text-xs text-slate-300">
            <p>Template: <span className="font-semibold text-white">{settings[previewType].template}</span></p>
            <p>Theme: <span className="font-semibold text-white">{settings[previewType].theme}</span></p>
            <p className="text-amber-200">Demo preview data only (no real student record).</p>
          </div>
        </div>

        <CertificatePreview
          {...previewData}
          showPrintAction={false}
        />
      </section>
    </main>
  );
}
