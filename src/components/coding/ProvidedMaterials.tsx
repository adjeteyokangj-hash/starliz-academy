/* eslint-disable @next/next/no-img-element -- Bounded original inline PNGs intentionally bypass an external image optimizer. */
import type { Json } from "@/lib/coding/learning/types";
const record = (value: Json | undefined): Record<string, Json> => value && typeof value === "object" && !Array.isArray(value) ? value : {};
export default function ProvidedMaterials({ input }: { input: Json }) {
  const fixture = record(input), materials = Array.isArray(fixture.materials) ? fixture.materials : [], assets = Array.isArray(fixture.assets) ? fixture.assets.map(record) : [];
  if (!materials.length) return null;
  return <details aria-label="Provided practice materials" className="min-w-0 rounded-2xl border border-sky-300 bg-sky-50 p-4"><summary className="min-h-11 cursor-pointer font-bold">Provided practice materials ({materials.length})</summary><p className="my-3 text-sm leading-6">Use these fictional records and permitted illustrations for this task. Their source details stay separate from your editable creation.</p><div className="grid min-w-0 gap-4 md:grid-cols-2">
    {materials.map((value, index) => { const material = record(value), asset = assets.find((asset) => asset.id === material.assetId), uri = typeof asset?.uri === "string" && asset.uri.length <= 20000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(asset.uri) ? asset.uri : null; return <article key={index} className="space-y-2 rounded-xl border border-sky-200 bg-white p-3"><h3 className="font-semibold">{String(material.title ?? `Material ${index + 1}`)}</h3><p className="whitespace-pre-wrap text-sm leading-7">{String(material.text ?? "")}</p>
      {uri && <figure><img src={uri} width={240} height={120} className="h-auto max-w-full rounded-lg" alt={String(material.alt ?? "Provided original illustration")} /><figcaption className="mt-2 text-xs">Project filename: <code>{String(material.assetId)}</code></figcaption></figure>}
      <p className="text-xs leading-6">Source: {String(material.source ?? "StarLiz fictional practice record")} · Permission: {String(material.licence ?? "original")}</p></article>; })}
  </div></details>;
}
