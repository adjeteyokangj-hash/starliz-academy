"use client";

import { useState } from "react";
import { personalInputSchema, type PersonalInput } from "@/lib/coding/learning/types";

export default function SourceTestInputs({ initial, defaults, stdin, disabled, onChange }: {
  initial: { input: PersonalInput; enabled: boolean } | null; defaults: PersonalInput; stdin: boolean; disabled: boolean;
  onChange: (value: PersonalInput | null, valid: boolean) => void;
}) {
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [text, setText] = useState(() => stdin ? initial?.input.stdin ?? defaults.stdin ?? "" : JSON.stringify(initial?.input.variables ?? defaults.variables ?? {}, null, 2));
  const [error, setError] = useState("");
  function update(next: string, active: boolean) {
    setText(next); setEnabled(active);
    if (!active) { setError(""); onChange(null, true); return; }
    try {
      const parsed = personalInputSchema.parse(stdin ? { stdin: next } : { variables: JSON.parse(next) });
      setError(""); onChange(parsed, true);
    } catch { setError(stdin ? "Keep test input within 8KiB." : "Enter a JSON object with valid variable names and values, within 8KiB."); onChange(null, false); }
  }
  return <fieldset disabled={disabled} className="min-w-0 space-y-3 rounded-xl border border-slate-300 p-4">
    <legend className="px-1 font-semibold">Personal test input</legend>
    <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={enabled} onChange={(event) => update(text, event.target.checked)} />Try your own input</label>
    <p className="text-sm text-slate-600">Run experiments with your own data. Assessment uses separate supplied tests. Saved files and assessment settings remain protected.</p>
    {enabled && <label className="block space-y-2 text-sm font-medium">{stdin ? "Console input (one response per line)" : "Input variables (JSON)"}<textarea className="block min-h-32 w-full rounded-lg border border-slate-400 p-3 font-mono text-sm text-slate-950" value={text} maxLength={8192} onChange={(event) => update(event.target.value, true)} spellCheck={false} aria-invalid={Boolean(error)} /></label>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
  </fieldset>;
}
