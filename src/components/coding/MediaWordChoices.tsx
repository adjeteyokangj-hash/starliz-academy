"use client";

import type { Json } from "@/lib/coding/learning/types";
import type { MediaDocument } from "@/lib/coding/learning/studio-engines";

export default function MediaWordChoices({ input, document, onChange }: { input: Json; document: MediaDocument; onChange: (patch: Partial<MediaDocument>) => void }) {
  const fixture = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const words = (field: string, limit: number) => Array.isArray(fixture[field]) ? fixture[field].filter((value): value is string => typeof value === "string" && value.length <= 500).slice(0, limit) : [];
  const captions = words("captions", 8), steps = words("stepChoices", 12);
  return <div className="space-y-3">
    {captions.length > 0 && <fieldset className="rounded-xl border border-slate-300 p-3"><legend className="text-sm font-semibold">Choose words that match your picture</legend><div className="flex flex-wrap gap-2">{captions.map((caption) => <button type="button" key={caption} disabled={document.tool === "picture"} className="min-h-11 rounded-lg border border-slate-400 bg-white px-3 py-2 text-left text-sm text-slate-950 disabled:opacity-50" onClick={() => onChange({ caption })}>{caption}</button>)}</div></fieldset>}
    {steps.length > 0 && <fieldset className="space-y-3 rounded-xl border border-slate-300 p-3"><legend className="text-sm font-semibold">Build your instructions in order</legend><div className="flex flex-wrap gap-2">{steps.map((step) => <button key={step} type="button" disabled={document.steps.length >= 12} className="min-h-11 rounded-lg border border-slate-400 bg-white px-3 py-2 text-left text-sm text-slate-950 disabled:opacity-50" onClick={() => onChange({ steps: [...document.steps, step] })}>Add step: {step}</button>)}</div><ol className="list-decimal space-y-2 pl-5">{document.steps.map((step, index) => <li key={index} className="text-sm text-slate-800"><span>{step}</span><button type="button" className="ml-2 min-h-11 rounded-lg border border-slate-400 bg-white px-3" aria-label={`Remove instruction step ${index + 1}`} onClick={() => onChange({ steps: document.steps.filter((_, i) => i !== index) })}>Remove</button><button type="button" disabled={index === 0} className="ml-2 min-h-11 rounded-lg border border-slate-400 bg-white px-3 disabled:opacity-50" aria-label={`Move instruction step ${index + 1} earlier`} onClick={() => { const steps = [...document.steps]; [steps[index - 1], steps[index]] = [steps[index]!, steps[index - 1]!]; onChange({ steps }); }}>↑</button></li>)}</ol></fieldset>}
  </div>;
}
