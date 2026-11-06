"use client";

import { dualDocumentSchema } from "@/lib/coding/learning/dual-contract";
import type { Json } from "@/lib/coding/learning/types";
import VisualProgramEditor from "./VisualProgramEditor";
import SourceEditor from "./SourceEditor";

export default function DualProgramEditor({ value, onChange, year, readOnly = false, onValidityChange }: { value: Json; onChange: (value: Json) => void; year: number; readOnly?: boolean; onValidityChange?: (valid: boolean) => void }) {
  const parsed = dualDocumentSchema.safeParse(value);
  if (!parsed.success) return <p role="alert" className="rounded-xl bg-amber-50 p-3 text-amber-950">Keep the saved version and restore a supported dual-view starter.</p>;
  // Preserve original optional fields and serialization, rather than schema defaults.
  const { dual } = value as unknown as typeof parsed.data;
  return <div className="space-y-5"><p className="text-sm leading-6 text-slate-600">Both programs receive the same starting values. Run and compare their actual final values and output. Editing one view does not silently rewrite the other.</p><section className="rounded-xl border border-sky-300 p-3"><h3 className="mb-3 font-bold text-slate-900">Visual program</h3><VisualProgramEditor value={dual.visual as Json} year={year} readOnly={readOnly} onValidityChange={onValidityChange} onChange={(visual) => onChange({ dual: { ...dual, visual } } as Json)} /></section><section className="min-w-0"><h3 className="mb-3 font-bold text-slate-900">Python translation</h3><SourceEditor value={dual.python.source} language="python" label="Python translation" readOnly={readOnly} onChange={(source) => onChange({ dual: { ...dual, python: { ...dual.python, source } } } as Json)} /></section></div>;
}
