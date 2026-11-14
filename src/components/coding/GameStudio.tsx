"use client";
import { learningGameSchema } from "@/lib/coding/learning/game-engine";
import type { Json } from "@/lib/coding/learning/types";
import VisualProgramEditor from "./VisualProgramEditor";
const control = "min-h-11 max-w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-slate-950";
export default function GameStudio({ value, readOnly, onChange, year }: { year: number; value: Json; readOnly: boolean; onChange: (value: Json) => void }) {
  const parsed = learningGameSchema.safeParse(value);
  if (!parsed.success) return <p role="alert">Restore a supported learning-game starter.</p>;
  const document = parsed.data, update = (patch: Partial<typeof document>) => onChange({ ...document, ...patch } as Json);
  return <section aria-label="Learning game studio" className="min-w-0 space-y-4"><fieldset disabled={readOnly} className="space-y-4"><legend className="font-bold">Game presentation and audience</legend>
    {(["title", "learningGoal", "instructions", "testNotes"] as const).map((field) => <label key={field} className="block">{({ title: "Title", learningGoal: "Learning goal", instructions: "Player instructions", testNotes: "Observed finding, repair and retest notes" })[field]}<textarea className={`${control} mt-1 w-full`} maxLength={field === "title" ? 200 : field === "learningGoal" ? 1000 : field === "instructions" ? 2000 : 4000} value={document[field]} onChange={(event) => update({ [field]: event.target.value })} /></label>)}
    <label className="block">Text size<input className={`${control} ml-2 w-24`} type="number" min={10} max={48} value={document.fontSize} onChange={(event) => { const size = Number(event.target.value); if (Number.isInteger(size) && size >= 10 && size <= 48) update({ fontSize: size }); }} /></label>
    <label className="block">Audience<select className={`${control} ml-2`} value={document.audience} onChange={(event) => update({ audience: event.target.value as typeof document.audience })}>{["private", "classroom", "public"].map((audience) => <option key={audience}>{audience}</option>)}</select></label>
    {document.controls.map((button, index) => <fieldset key={button.id} className="space-y-2 rounded-xl border p-3"><legend className="font-semibold">Control {index + 1}: {button.id}</legend><label className="block">Button label<input className={`${control} mt-1 w-full`} maxLength={200} value={button.label} onChange={(event) => update({ controls: document.controls.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /></label><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={button.keyboard} onChange={(event) => update({ controls: document.controls.map((item, i) => i === index ? { ...item, keyboard: event.target.checked } : item) })} />Include in keyboard Tab order</label><p className="text-sm">Runs event {button.event} with value {JSON.stringify(button.value)}.</p></fieldset>)}
  </fieldset><VisualProgramEditor year={year} value={document.program as unknown as Json} readOnly={readOnly} onChange={(program) => update({ program: program as unknown as typeof document.program })} /></section>;
}
