import type { Json } from "@/lib/coding/learning/types";
import type { ProjectInteraction } from "./ProjectPreview";
const record = (value: Json | undefined) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
export default function EvidenceControls({ output, onInteraction }: { output: Record<string, Json>; onInteraction?: (event: ProjectInteraction) => void }) {
  if (output.evidencePoster !== true) return null;
  const interaction = record(output.interaction), reuse = record(output.reuse);
  return <section className="space-y-4 rounded-xl border border-sky-200 bg-sky-50 p-4" aria-label="Interactive evidence poster"><h3 className="font-bold">Try your poster’s controls</h3>
    <div className="flex flex-wrap gap-2">{Array.isArray(output.controls) && output.controls.map((value) => { const control = record(value); return <button key={String(control.id)} type="button" className="min-h-11 max-w-full rounded-xl border border-sky-700 bg-white px-4 py-2 text-left font-semibold text-sky-950 disabled:opacity-50" tabIndex={control.element === "skip-tab" ? -1 : 0} disabled={!onInteraction || control.disabled === true} onClick={() => onInteraction?.({ type: "click", target: String(control.id) })}>{String(control.label || "Unlabelled control")}</button>; })}</div>
    {typeof interaction.explanation === "string" && interaction.explanation && <p className="rounded-lg bg-white p-3 text-sm leading-6" aria-live="polite">{interaction.explanation}</p>}
    {reuse.assetId && <p className="text-sm">Provided picture: {String(reuse.creator)} · {String(reuse.licence)} · Your credit: {String(reuse.credit || "missing")}{reuse.permitted !== true || reuse.credited !== true ? " · Check the permission and credit before sharing this work." : ""}</p>}
  </section>;
}
