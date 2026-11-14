"use client";

import { useState } from "react";
import { executeMediaLibrary, mediaLibrarySchema, type MediaLibraryProgram } from "@/lib/coding/learning/media-library";
import { mediaDocumentSchema, type MediaDocument } from "@/lib/coding/learning/studio-engines";
import type { Json } from "@/lib/coding/learning/types";
import LearningExecution from "./LearningExecution";
import MediaLayerTools from "./MediaLayerTools";
import MediaWordChoices from "./MediaWordChoices";

const control = "min-h-11 rounded-lg border border-slate-400 bg-white px-3 py-2 text-slate-950 disabled:opacity-50";
export default function MediaLibraryEditor({ value, onChange, onCommit, input = {}, readOnly = false }: { value: Json; onChange: (value: Json) => void; onCommit?: (value: Json) => void; input?: Json; readOnly?: boolean }) {
  const [fileName, setFileName] = useState(""), [selected, setSelected] = useState(""), [reason, setReason] = useState("");
  const parsed = mediaLibrarySchema.safeParse(value);
  if (!parsed.success) return <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-950">Keep this saved version and restore a supported card-library starter before editing.</p>;
  const program = parsed.data, result = executeMediaLibrary(value, input), output = result.output && typeof result.output === "object" && !Array.isArray(result.output) ? result.output : {};
  const working = mediaDocumentSchema.safeParse(output.document), document = working.success ? working.data : null;
  const savedNames = Array.isArray(output.savedNames) ? output.savedNames.filter((name): name is string => typeof name === "string") : [];
  const currentFile = typeof output.openFile === "string" ? output.openFile : "";
  const openName = savedNames.includes(selected) ? selected : savedNames.includes(currentFile) ? currentFile : savedNames[0] ?? "";
  const emit = (next: MediaLibraryProgram, commit = false) => { const artifact = next as unknown as Json; onChange(artifact); if (commit) onCommit?.(artifact); };
  const append = (action: MediaLibraryProgram["actions"][number], commit = false) => {
    if (action.op === "save" || action.op === "open") setSelected(action.name);
    else if (action.op === "close" && currentFile) setSelected(currentFile);
    emit({ ...program, actions: [...program.actions, action] }, commit);
  };
  const patch = (change: Partial<MediaDocument>) => {
    const last = program.actions.at(-1);
    if (last?.op === "edit") emit({ ...program, actions: [...program.actions.slice(0, -1), { ...last, patch: { ...last.patch, ...change }, reason }] });
    else append({ op: "edit", patch: change, reason });
  };
  const addShape = (kind: "rectangle" | "circle" | "text") => {
    if (!document) return;
    patch({ shapes: [...document.shapes, { id: `layer-${crypto.randomUUID().slice(0, 8)}`, kind, x: 40, y: 40, width: 120, height: 90, fill: "#166534", text: kind === "text" ? "My instruction" : "", alt: kind === "text" ? "Instruction text" : "A new picture mark" }] });
  };
  return <section className="min-w-0 space-y-5" aria-label="Picture and instruction card studio">
    <div className="rounded-xl border border-slate-300 bg-slate-50 p-3"><h3 className="font-bold">Your card library</h3><div className="mt-3 flex flex-wrap gap-2"><label className="text-sm">Save with a meaningful name<input className={`${control} ml-2 max-w-full`} value={fileName} maxLength={60} disabled={readOnly} placeholder="For example: Seed card" onChange={(event) => setFileName(event.currentTarget.value)} /></label><button type="button" className={control} disabled={readOnly || !document || !/^[\p{L}\p{N} _-]{3,60}$/u.test(fileName) || program.actions.length >= 32} onClick={() => append({ op: "save", name: fileName }, true)}>Save card</button><button type="button" className={control} disabled={readOnly || !document || program.actions.length >= 32} onClick={() => append({ op: "close" }, true)}>Close card</button></div>
      <div className="mt-3 flex flex-wrap gap-2"><label className="text-sm">Saved cards<select aria-label="Saved cards" className={`${control} ml-2 max-w-full`} value={openName} disabled={readOnly || !savedNames.length} onChange={(event) => setSelected(event.currentTarget.value)}>{!savedNames.length && <option value="">No card saved yet</option>}{savedNames.map((name) => <option key={name}>{name}</option>)}</select></label><button type="button" className={control} disabled={readOnly || !openName || program.actions.length >= 32} onClick={() => append({ op: "open", name: openName }, true)}>Open selected card</button></div>
      <p className="mt-3 text-xs leading-5 text-slate-600">Saving a card retains earlier card versions. Closing removes it from the work area; opening retrieves its saved content.</p>
    </div>
    {!result.ok && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-amber-950">{result.error}</p>}
    {document ? <fieldset className="min-w-0 space-y-4" disabled={readOnly || program.actions.length >= 32}>
      <legend className="font-bold text-slate-900">Create and edit your card</legend><div className="flex flex-wrap gap-3"><label className="text-sm">Card title<input className={`${control} ml-2 max-w-full`} value={document.name} maxLength={100} onChange={(event) => patch({ name: event.currentTarget.value })} /></label><label className="text-sm">Tool<select aria-label="Tool" className={`${control} ml-2`} value={document.tool} onChange={(event) => patch({ tool: event.currentTarget.value as MediaDocument["tool"] })}><option value="picture">Picture tool</option><option value="text">Text tool</option><option value="combined">Picture and text tools</option></select></label></div>
      <div className="flex flex-wrap gap-2"><button type="button" className={control} disabled={document.tool === "text" || document.shapes.length >= 100} onClick={() => addShape("rectangle")}>Draw rectangle</button><button type="button" className={control} disabled={document.tool === "text" || document.shapes.length >= 100} onClick={() => addShape("circle")}>Draw circle</button><button type="button" className={control} disabled={document.tool === "picture" || document.shapes.length >= 100} onClick={() => addShape("text")}>Add text mark</button></div>
      <MediaLayerTools document={document} onChange={(shapes) => patch({ shapes })} />
      <MediaWordChoices input={input} document={document} onChange={patch} />
      {document.shapes.map((shape, index) => <details key={shape.id} className="rounded-xl border border-slate-300 p-3"><summary className="min-h-8 cursor-pointer text-sm font-semibold">Layer {index + 1}: {shape.kind} · {shape.alt}</summary><div className="mt-3 flex flex-wrap gap-3">{(["x", "y", "width", "height"] as const).map((field) => <label key={field} className="text-sm">{field}<input type="number" className={`${control} ml-2 w-24`} min={field === "width" || field === "height" ? 1 : 0} max={field === "y" || field === "height" ? 400 : 600} value={shape[field]} onChange={(event) => { const entered = Number(event.currentTarget.value); const number = Math.max(field === "width" || field === "height" ? 1 : 0, Math.min(field === "y" || field === "height" ? 400 : 600, entered)); if (Number.isFinite(number)) patch({ shapes: document.shapes.map((old, i) => i === index ? { ...old, [field]: number } : old) }); }} /></label>)}<label className="text-sm">Colour<input type="color" className={`${control} ml-2 w-16`} value={shape.fill} onChange={(event) => patch({ shapes: document.shapes.map((old, i) => i === index ? { ...old, fill: event.currentTarget.value } : old) })} /></label><label className="text-sm">Describe this mark<input className={`${control} ml-2 max-w-full`} value={shape.alt} maxLength={200} onChange={(event) => patch({ shapes: document.shapes.map((old, i) => i === index ? { ...old, alt: event.currentTarget.value } : old) })} /></label>{shape.kind === "text" && <label className="text-sm">Words<input className={`${control} ml-2 max-w-full`} value={shape.text} maxLength={200} onChange={(event) => patch({ shapes: document.shapes.map((old, i) => i === index ? { ...old, text: event.currentTarget.value } : old) })} /></label>}</div></details>)}
      <label className="block text-sm font-semibold">Caption<input className={`${control} mt-2 w-full font-normal`} value={document.caption} maxLength={500} disabled={document.tool === "picture"} onChange={(event) => patch({ caption: event.currentTarget.value })} /></label><label className="block text-sm font-semibold">Read-aloud description<textarea rows={2} className={`${control} mt-2 w-full font-normal`} value={document.narration} maxLength={1000} onChange={(event) => patch({ narration: event.currentTarget.value })} /></label>
      <label className="block text-sm font-semibold">Instruction steps, one per line<textarea rows={4} className={`${control} mt-2 w-full font-normal`} value={document.steps.join("\n")} onChange={(event) => patch({ steps: event.currentTarget.value.split("\n").slice(0, 12) })} /></label>
      <div className="flex flex-wrap gap-3"><label className="text-sm">Text size<input type="number" className={`${control} ml-2 w-24`} min={10} max={80} value={document.fontSize} onChange={(event) => patch({ fontSize: Math.max(10, Math.min(80, Number(event.currentTarget.value))) })} /></label><label className="text-sm">Text colour<input type="color" className={`${control} ml-2 w-16`} value={document.foreground} onChange={(event) => patch({ foreground: event.currentTarget.value })} /></label><label className="text-sm">Background<input type="color" className={`${control} ml-2 w-16`} value={document.background} onChange={(event) => patch({ background: event.currentTarget.value })} /></label></div>
      <label className="block text-sm font-semibold">Why are you making this change?<input className={`${control} mt-2 w-full font-normal`} value={reason} maxLength={500} onChange={(event) => { const next = event.currentTarget.value; setReason(next); const last = program.actions.at(-1); if (last?.op === "edit") emit({ ...program, actions: [...program.actions.slice(0, -1), { ...last, reason: next }] }); }} /></label>
    </fieldset> : <p className="rounded-xl border border-dashed border-slate-400 p-5 text-slate-700">The work area is closed. Choose a saved card and open it.</p>}
    <LearningExecution execution={result} />
    {program.actions.length > 0 && <details className="rounded-xl border border-slate-300 p-3"><summary className="min-h-8 cursor-pointer font-semibold">Your actual editing and file actions</summary><ol className="mt-3 list-decimal space-y-2 pl-6 text-sm">{program.actions.map((action, i) => <li key={i}>{action.op}{"name" in action ? `: ${action.name}` : action.op === "edit" && action.reason ? `: ${action.reason}` : ""}</li>)}</ol><button type="button" className={`${control} mt-3`} disabled={readOnly} onClick={() => emit({ ...program, actions: program.actions.slice(0, -1) })}>Undo last library action</button></details>}
  </section>;
}
