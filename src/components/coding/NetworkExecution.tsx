import type { Json } from "@/lib/coding/learning/types";
import NetworkDiagram from "./NetworkDiagram";
const record = (value: Json | undefined): Record<string, Json> => value && typeof value === "object" && !Array.isArray(value) ? value : {};
export default function NetworkExecution({ output }: { output: Record<string, Json> }) {
  if (!output.network || !Array.isArray(output.path)) return null;
  const network = record(output.network), nodes = Array.isArray(network.nodes) ? network.nodes.map(String) : [], links = Array.isArray(network.links) ? network.links.filter(Array.isArray).map((edge) => edge.map(String)) : [];
  const service = record(output.serviceResult), ranking = Array.isArray(output.ranking) ? output.ranking.map(record) : [];
  return <section className="min-w-0 space-y-4"><h3 className="font-bold">Calculated network result</h3>
    <p className={`rounded-xl p-3 text-sm ${output.connected ? "bg-sky-50 text-sky-950" : "bg-amber-50 text-amber-950"}`}>{output.connected ? `Delivery path: ${output.path.join(" → ")}` : "No connection reaches the requested destination. Inspect the diagram's missing links."}</p>
    <NetworkDiagram nodes={nodes} links={links} path={output.path.map(String)} />
    {output.serviceResult && <section className="space-y-2 rounded-xl border border-slate-300 p-3"><h4 className="font-semibold">{service.kind === "web-page" ? "Curated web page" : service.kind === "email-envelope" ? "Practice email envelope" : service.kind === "file-transfer" ? "Transferred practice file" : "Practice message"}</h4>
      {typeof service.title === "string" && <p className="font-semibold">{service.title}</p>}
      {typeof service.from === "string" && <p className="text-sm">From {service.from} to {String(service.to)}</p>}
      {service.kind === "file-transfer" && <p className="text-sm">{String(service.name)} · {String(service.byteLength)} UTF-8 bytes</p>}
      <p className="whitespace-pre-wrap break-words text-sm">{String(service.content ?? service.body ?? service.text ?? "")}</p><p className="text-xs text-slate-600">Offline model result. No external page, device or mail service was contacted.</p>
    </section>}
    {ranking.length > 0 && <section className="rounded-xl border border-slate-300 p-3"><h4 className="font-semibold">Actual ranking</h4><ol className="mt-3 list-inside list-decimal space-y-3 text-sm">{ranking.map((page) => <li key={String(page.id)} className="break-words"><strong>{String(page.id)}</strong> · score {String(page.score)} · {String(page.relevant)} matching terms{page.promoted ? " · promotion signal present" : ""}</li>)}</ol><p className="mt-3 text-xs text-slate-600">Ranking is calculated from the chosen signals. A high score does not establish reliability.</p></section>}
    {Array.isArray(output.citations) && output.citations.length > 0 && <section className="rounded-xl border border-slate-300 p-3"><h4 className="font-semibold">Your source credits</h4><ul className="mt-2 space-y-2 text-sm">{output.citations.map((item, index) => { const citation = record(item); return <li key={index}>{String(citation.id)}: {String(citation.credit || "Credit missing")} · {String(citation.licence)}</li>; })}</ul></section>}
    {typeof output.answer === "string" && output.answer && <section className="rounded-xl bg-sky-50 p-3"><h4 className="font-semibold">Your answer</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm">{output.answer}</p></section>}
    {output.packetLoss === true && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">The packet sequence is incomplete or duplicated. A complete message was not reconstructed.</p>}
    {Array.isArray(output.packetOrder) && output.packetOrder.length > 0 && <section className="space-y-2 rounded-xl border border-slate-300 p-3"><h4 className="font-semibold">Actual packet sequence evidence</h4><p className="break-words text-sm">Sorted received sequence: {output.packetOrder.join(", ")}</p><p className="break-words text-sm">Missing: {Array.isArray(output.missingSequences) && output.missingSequences.length ? output.missingSequences.join(", ") : "none"}. Duplicated: {Array.isArray(output.duplicateSequences) && output.duplicateSequences.length ? output.duplicateSequences.join(", ") : "none"}.</p></section>}
    {typeof output.reconstructed === "string" && output.reconstructed && <p className="rounded-xl bg-slate-50 p-3 text-sm">Reconstructed message: {output.reconstructed}</p>}
  </section>;
}
