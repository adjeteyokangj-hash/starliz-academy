"use client";

import { useState } from "react";
import type { MediaDocument } from "@/lib/coding/learning/studio-engines";

const control = "min-h-11 rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm text-slate-950 disabled:opacity-50";
export default function MediaLayerTools({ document, onChange }: { document: MediaDocument; onChange: (shapes: MediaDocument["shapes"]) => void }) {
  const [selected, setSelected] = useState("");
  const index = Math.max(0, document.shapes.findIndex((shape) => shape.id === selected)), shape = document.shapes[index];
  if (!shape) return null;
  const correctTool = document.tool === "combined" || document.tool === (shape.kind === "text" ? "text" : "picture");
  const move = (x: number, y: number) => onChange(document.shapes.map((item, i) => i === index ? { ...item, x: Math.max(0, Math.min(600 - item.width, item.x + x)), y: Math.max(0, Math.min(400 - item.height, item.y + y)) } : item));
  const reorder = (direction: number) => { const shapes = [...document.shapes]; [shapes[index], shapes[index + direction]] = [shapes[index + direction]!, shapes[index]!]; onChange(shapes); };
  return <section className="space-y-3 rounded-xl border border-sky-300 bg-sky-50 p-3" aria-label="Move, paint and order your picture parts">
    <label className="block text-sm font-semibold">Picture part<select className={`${control} ml-2 max-w-full`} value={shape.id} onChange={(event) => setSelected(event.currentTarget.value)}>{document.shapes.map((shape, i) => <option key={shape.id} value={shape.id}>{i + 1}. {shape.alt || shape.kind}</option>)}</select></label>
    <div className="flex flex-wrap gap-2">{([['Left', -20, 0], ['Right', 20, 0], ['Up', 0, -20], ['Down', 0, 20]] as const).map(([name, x, y]) => <button type="button" key={name} className={control} disabled={!correctTool} onClick={() => move(x, y)}>Move part {name.toLowerCase()}</button>)}<button type="button" className={control} disabled={!correctTool || index >= document.shapes.length - 1} onClick={() => reorder(1)}>Bring part forward</button><button type="button" className={control} disabled={!correctTool || index === 0} onClick={() => reorder(-1)}>Send part backward</button></div>
    <div className="flex flex-wrap gap-2" aria-label="Paint colours">{([['Green', '#166534'], ['Blue', '#2563eb'], ['Red', '#b91c1c'], ['Yellow', '#facc15'], ['Brown', '#92400e'], ['White', '#ffffff']] as const).map(([name, colour]) => <button type="button" key={name} className={control} disabled={!correctTool} onClick={() => onChange(document.shapes.map((item, i) => i === index ? { ...item, fill: colour } : item))}><span aria-hidden="true" className="mr-2 inline-block h-4 w-4 rounded-full border border-slate-500 align-middle" style={{ backgroundColor: colour }} />Paint {name.toLowerCase()}</button>)}</div>
    {!correctTool && <p className="text-sm text-amber-950">Choose the matching picture or text tool before changing this part.</p>}
  </section>;
}
