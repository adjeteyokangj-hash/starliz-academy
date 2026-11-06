"use client";
import { useState } from "react";
import { evidenceDocumentSchema, evidenceAssetSchema } from "@/lib/coding/learning/evidence-engine";
import type { Json } from "@/lib/coding/learning/types";
import DataStudio from "./DataStudio";
import MediaLibraryEditor from "./MediaLibraryEditor";

const control = "min-h-11 max-w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-slate-950";
export default function EvidenceStudio({ value, input, readOnly, onChange, onCommit }: { value: Json; input: Json; readOnly: boolean; onChange: (document: Json) => void; onCommit: (document: Json) => void }) {
  const [tool, setTool] = useState<"data" | "picture" | "controls">("data");
  const parsed = evidenceDocumentSchema.safeParse(value);
  if (!parsed.success) return <p role="alert">Restore a supported evidence-poster starter to edit this project.</p>;
  const document = parsed.data, fixture = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const assets = Array.isArray(fixture.assets) ? fixture.assets.flatMap((asset) => { const parsed = evidenceAssetSchema.safeParse(asset); return parsed.success ? [parsed.data] : []; }) : [];
  const selectedAsset = assets.find((asset) => asset.id === document.assetId);
  const update = (patch: Partial<typeof document>, commit = false) => { const value = { ...document, ...patch } as Json; onChange(value); if (commit) onCommit(value); };
  return <section className="min-w-0 space-y-4" aria-label="Evidence poster studio">
    <nav className="flex flex-wrap gap-2" aria-label="Poster tools">{(["data", "picture", "controls"] as const).map((name) => <button type="button" key={name} className={`${control} ${tool === name ? "border-sky-700 bg-sky-50 font-semibold" : ""}`} aria-pressed={tool === name} onClick={() => setTool(name)}>{name === "data" ? "Data and chart" : name === "picture" ? "Editable picture" : "Sources and controls"}</button>)}</nav>
    {tool === "data" ? <DataStudio value={document.data as Json} input={fixture.data ?? {}} readOnly={readOnly} onChange={(data) => update({ data: data as typeof document.data })} />
      : tool === "picture" ? <><p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-950">Create and save your original editable picture here. A selected provided asset is added to the combined poster when you preview it.</p><MediaLibraryEditor value={document.picture as unknown as Json} input={fixture.picture ?? {}} readOnly={readOnly} onChange={(picture) => update({ picture: picture as unknown as typeof document.picture })} onCommit={(picture) => update({ picture: picture as unknown as typeof document.picture }, true)} /></>
        : <fieldset disabled={readOnly} className="min-w-0 space-y-5"><legend className="font-bold">Source permissions and interactive controls</legend>
          <label className="block text-sm">Provided source picture<select aria-label="Provided source picture" className={`${control} mt-2 block w-full`} value={document.assetId} onChange={(event) => update({ assetId: event.target.value })}><option value="">Use only my original drawing</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.title}</option>)}</select></label>
          {selectedAsset && <p className="rounded-xl bg-slate-50 p-3 text-sm">Creator: <strong>{selectedAsset.creator}</strong>. Licence: <strong>{selectedAsset.licence}</strong>. {selectedAsset.licence === "restricted" ? "No reuse permission is provided. Choose a permitted source or original work." : selectedAsset.licence === "CC-BY" ? "Reuse requires an accurate creator credit." : "This source permits reuse under the stated terms."}</p>}
          <label className="block text-sm">Credit the provided picture’s creator<input className={`${control} mt-2 block w-full`} value={document.assetCredit} maxLength={1000} onChange={(event) => update({ assetCredit: event.target.value })} /></label>
          <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-950">Each control runs one declared action using the actual calculated data. Keep it in the keyboard Tab order and give it a meaningful label.</p>
          {document.controls.map((button, index) => <fieldset key={button.id} className="space-y-3 rounded-xl border border-slate-300 p-3"><legend className="font-semibold">Control {index + 1}</legend>
            <label className="block text-sm">Control label<input aria-label={`Control ${index + 1} label`} className={`${control} mt-2 block w-full`} value={button.label} maxLength={200} onChange={(event) => update({ controls: document.controls.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /></label>
            <label className="block text-sm">Keyboard access<select aria-label={`Control ${index + 1} keyboard access`} className={`${control} mt-2 block w-full`} value={button.element} onChange={(event) => update({ controls: document.controls.map((item, i) => i === index ? { ...item, element: event.target.value as typeof item.element } : item) })}><option value="button">Button in the Tab order</option><option value="skip-tab">Removed from the Tab order</option></select></label>
            <label className="block text-sm">Action<select aria-label={`Control ${index + 1} action`} className={`${control} mt-2 block w-full`} value={button.action} onChange={(event) => update({ controls: document.controls.map((item, i) => i === index ? { ...item, action: event.target.value as typeof item.action } : item) })}><option value="describe-largest">Explain the actual largest group</option><option value="describe-total">Explain the actual response total</option><option value="show-table">Show the recorded table</option><option value="show-chart">Show the calculated chart</option></select></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={button.disabled} onChange={(event) => update({ controls: document.controls.map((item, i) => i === index ? { ...item, disabled: event.target.checked } : item) })} />Disable this control</label>
            <button type="button" className={control} onClick={() => update({ controls: document.controls.filter((_, i) => i !== index) })}>Remove control {index + 1}</button>
          </fieldset>)}
          <button type="button" className={control} disabled={document.controls.length >= 8} onClick={() => { let index = 1; while (document.controls.some((control) => control.id === `control${index}`)) index++; update({ controls: [...document.controls, { id: `control${index}`, label: "Explain the data", element: "button", action: "describe-largest", disabled: false }] }); }}>Add interactive control</button>
        </fieldset>}
  </section>;
}
