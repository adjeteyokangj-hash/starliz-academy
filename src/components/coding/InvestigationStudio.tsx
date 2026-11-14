"use client";
import { useState } from "react";
import { investigationDocumentSchema, investigationFixtureSchema } from "@/lib/coding/learning/investigation-engine";
import { executeData } from "@/lib/coding/learning/studio-engines";
import type { Json } from "@/lib/coding/learning/types";
import DataStudio from "./DataStudio";
import ClassifierStudio from "./ClassifierStudio";
export default function InvestigationStudio({ value, input, readOnly, onChange }: { value: Json; input: Json; readOnly: boolean; onChange: (value: Json) => void }) {
  const [error, setError] = useState("");
  const parsed = investigationDocumentSchema.safeParse(value), fixture = investigationFixtureSchema.safeParse(input);
  if (!parsed.success || !fixture.success) return <p role="alert">Restore a supported data-investigation starter to edit this project.</p>;
  const document = parsed.data, update = (patch: Partial<typeof document>) => onChange({ ...document, ...patch } as Json);
  function prepareTraining() {
    const run = executeData(document.data, fixture.success && fixture.data.rows ? { rows: fixture.data.rows } : {});
    const output = run.output && typeof run.output === "object" && !Array.isArray(run.output) ? run.output : {};
    if (!run.ok || !Array.isArray(output.rows) || !output.rows.length || output.rows.some((row) => !row || typeof row !== "object" || Array.isArray(row) || typeof row.id !== "string" || typeof row.category !== "string" || typeof row.amount !== "number")) { setError("Prepare non-empty cleaned records with id, category and numeric amount first. Inspect the actual table before using it for training."); return; }
    const training = output.rows.map((value) => { const row = value as Record<string, Json>; return { id: String(row.id), features: [Number(row.amount)], label: String(row.category), group: "fictional cleaned sample" }; });
    const candidate = investigationDocumentSchema.safeParse({ ...document, classifier: { ...document.classifier, training } });
    if (!candidate.success) { setError("The cleaned records exceed the classifier's example limits. Review identifiers, categories and measurement ranges."); return; }
    update({ classifier: candidate.data.classifier }); setError("");
  }
  return <section aria-label="Data investigation studio" className="min-w-0 space-y-6"><section className="min-w-0 rounded-xl border border-slate-300 p-3"><h3 className="mb-3 font-bold">1. Prepare and explain the evidence</h3><DataStudio value={document.data as Json} input={fixture.data.rows ? { rows: fixture.data.rows } : {}} readOnly={readOnly} advancedPreparation onChange={(data) => update({ data: data as typeof document.data })} /></section><section className="min-w-0 space-y-3 rounded-xl border border-slate-300 p-3"><h3 className="font-bold">2. Train and test a small classifier</h3><p className="text-sm">Use the cleaned record identifiers, amounts and categories as training examples. Assessment checks their connection with the actual prepared data and uses separate test measurements.</p><button type="button" disabled={readOnly} className="min-h-11 rounded-lg border border-slate-400 bg-white px-3 py-2 disabled:opacity-50" onClick={prepareTraining}>Use cleaned records as training</button>{error && <p role="alert" className="text-sm text-red-800">{error}</p>}<ClassifierStudio value={document.classifier as Json} readOnly={readOnly} onChange={(classifier) => update({ classifier: classifier as typeof document.classifier })} /></section><label className="block text-sm font-semibold">3. Interpret the evidence and its limits<textarea className="mt-2 min-h-32 w-full rounded-lg border border-slate-400 p-3 font-normal" maxLength={2000} value={document.interpretation} disabled={readOnly} onChange={(event) => update({ interpretation: event.target.value })} /></label></section>;
}
