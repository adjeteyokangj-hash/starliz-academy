"use client";
import { useState } from "react";
import { classifierDocumentSchema, classifierExampleSchema, type ClassifierDocument } from "@/lib/coding/learning/classifier-contract";
import type { Json } from "@/lib/coding/learning/types";
const control = "min-h-11 max-w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-slate-950";

export default function ClassifierStudio({ value, readOnly, onChange }: { value: Json; readOnly: boolean; onChange: (value: Json) => void }) {
  const [id, setId] = useState("example-1"), [features, setFeatures] = useState("0, 0"), [label, setLabel] = useState("A"), [group, setGroup] = useState("fictional sample"), [error, setError] = useState("");
  const parsed = classifierDocumentSchema.safeParse(value);
  if (!parsed.success) return <p role="alert">Restore a supported classifier starter to edit this project.</p>;
  const document = parsed.data;
  const update = (patch: Partial<ClassifierDocument>) => onChange({ ...document, ...patch } as Json);
  function add(part: "training" | "test") {
    const numbers = features.split(",").map((number) => number.trim());
    const example = classifierExampleSchema.safeParse({ id, features: numbers.map(Number), label, group });
    if (!example.success || numbers.some((number) => !number) || document[part].length >= 100) { setError("Use a name, a category and one to eight comma-separated measurements from -1000 to 1000. Each collection supports at most 100 examples."); return; }
    if (document[part].some((item) => item.id === example.data.id)) { setError("Use a distinct example identifier within this collection."); return; }
    update({ [part]: [...document[part], example.data] }); setError("");
  }
  return <section aria-label="Classifier studio" className="min-w-0 space-y-5">
    <p className="rounded-xl bg-sky-50 p-3 text-sm">This is a real nearest-neighbour classifier over fictional numeric examples. Training examples determine its predictions; test labels measure the predictions afterwards. Vote share is not a probability of being correct. Keep personal data out of both collections.</p>
    <fieldset disabled={readOnly} className="min-w-0 space-y-4"><legend className="font-bold">Examples and model choices</legend>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">{([['Example identifier', id, setId], ['Measured features, separated by commas', features, setFeatures], ['Known category', label, setLabel], ['Fictional evaluation group', group, setGroup]] as const).map(([caption, text, setter]) => <label key={caption} className="min-w-0 text-sm">{caption}<input className={`${control} mt-1 w-full`} maxLength={caption.includes("features") ? 120 : caption.includes("group") ? 1000 : 120} value={text} onChange={(event) => setter(event.target.value)} /></label>)}</div>
      <div className="flex flex-wrap gap-2"><button type="button" className={control} onClick={() => add("training")}>Add training example</button><button type="button" className={control} onClick={() => add("test")}>Add test example</button></div>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      {document.ruleTest && <section className="rounded-xl border border-amber-300 bg-amber-50 p-3"><h3 className="font-semibold">Separate rule-comparison examples</h3><p className="my-2 text-sm">The rule currently uses a separate list. A fair comparison needs the same examples, measurements and expected labels as the model test.</p><ul className="space-y-1 text-sm">{document.ruleTest.map((example, index) => <li key={index}>{example.id} · [{example.features.join(", ")}] → {example.label}</li>)}</ul><button type="button" className={`${control} mt-3`} onClick={() => { const next = { ...document }; delete next.ruleTest; onChange(next as Json); }}>Use the same test examples for both methods</button></section>}
      {(["training", "test"] as const).map((part) => <section key={part} className="min-w-0 rounded-xl border p-3"><h3 className="font-bold capitalize">{part} examples ({document[part].length})</h3><p className="my-2 text-sm">{part === "test" ? "Assessment may supply additional unseen examples. Editing these visible labels does not change held-out checks." : "The model finds the closest measured examples in this collection."}</p><ol className="max-h-80 space-y-2 overflow-y-auto">{document[part].map((example, index) => <li key={`${example.id}-${index}`} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2"><span className="min-w-0 break-words text-sm"><strong>{example.id}</strong> · [{example.features.join(", ")}] → {example.label} · {example.group}</span><button type="button" className={control} onClick={() => update({ [part]: document[part].filter((_, i) => i !== index) })}>Remove {part} {example.id}</button></li>)}</ol></section>)}
      <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Neighbours (k)<select className={`${control} mt-1 w-full`} value={document.k} onChange={(event) => update({ k: Number(event.target.value) })}>{Array.from({ length: 9 }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}</select></label><label className="text-sm">Abstain below vote share<select className={`${control} mt-1 w-full`} value={document.abstainBelow} onChange={(event) => update({ abstainBelow: Number(event.target.value) })}>{[...new Set([0, .5, .6, .75, 1, document.abstainBelow])].sort((a, b) => a - b).map((number) => <option key={number} value={number}>{number}</option>)}</select></label><label className="text-sm">Rule comparison threshold<input className={`${control} mt-1 w-full`} type="number" value={document.ruleThreshold} onChange={(event) => { if (event.target.value.trim() && Number.isFinite(Number(event.target.value))) update({ ruleThreshold: Number(event.target.value) }); }} /></label></div>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={document.humanReview} onChange={(event) => update({ humanReview: event.target.checked })} />Flag every prediction for a fictional human decision</label>
      {([['modelVersion', 'Model version'], ['source', 'Data source'], ['limitation', 'What the test cannot establish']] as const).map(([field, caption]) => <label key={field} className="block text-sm">{caption}<textarea className={`${control} mt-1 w-full`} maxLength={field === "modelVersion" ? 120 : 1000} value={document[field]} onChange={(event) => update({ [field]: event.target.value })} /></label>)}
    </fieldset>
  </section>;
}
