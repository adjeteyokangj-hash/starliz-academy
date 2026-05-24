"use client";

import { useMemo, useState } from "react";
import CertificatePreview from "@/components/certificates/CertificatePreview";
import type { CertificateTemplateType } from "@/components/certificates/certificate-designs";
import {
  availableCertificateTemplates,
  buildCertificateTemplatePreviewData,
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

const THEMES: ReadonlyArray<{ value: CertificateThemeName; label: string }> = [
  { value: "classic_academic", label: "Classic Academic" },
  { value: "exam_honours", label: "Assessment Achievement" },
  { value: "subject_focus", label: "Modern Clean" },
  { value: "english_scholar", label: "English Learning" },
  { value: "mastery_prestige", label: "Mastery Premium" },
  { value: "award_prestige", label: "Gold Award" },
];

function labelForType(type: CertificateTemplateType): string {
  return CERTIFICATE_TYPES.find((item) => item.value === type)?.label ?? type;
}

export default function AdminCertificateTemplatesPage() {
  const [settings, setSettings] = useState<CertificateTemplateSettings>(defaultCertificateTemplateSettings);
  const [previewType, setPreviewType] = useState<CertificateTemplateType>("term_completion");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

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
    setSaveMessage(null);
  }

  return (
    <main className="space-y-6">
      <section>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Admin certificates</p>
        <h1 className="mt-2 text-3xl font-black text-white">Certificate Template Controls</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">
          Configure preview defaults by certificate type using safe demo data. This phase is preview-only and does not change certificate issuing, award review, or verification rules.
        </p>
      </section>

      <section className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
        Template persistence can be connected to admin settings in a later phase.
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white">Default Template Map</h2>
          <button
            type="button"
            onClick={() => setSaveMessage("Preview-only mode: settings are not persisted in this phase.")}
            className="rounded-xl border border-slate-500 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-100 hover:bg-slate-800"
          >
            Save Settings
          </button>
        </div>

        {saveMessage ? (
          <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200">{saveMessage}</p>
        ) : null}

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
                    onChange={(event) => updateTypeSetting(type.value, { template: event.target.value as CertificateTemplateSetting["template"] })}
                  >
                    {availableCertificateTemplates.map((template) => (
                      <option key={template.value} value={template.value}>{template.label}</option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                  Theme / accent
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm font-semibold text-white"
                    value={settings[type.value].theme}
                    onChange={(event) => updateTypeSetting(type.value, { theme: event.target.value as CertificateThemeName })}
                  >
                    {THEMES.map((theme) => (
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
