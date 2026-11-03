import type { Json } from "@/lib/coding/learning/types";

export default function ScenarioDetails({ output }: { output: Record<string, Json> }) {
  const profile = output.profile && typeof output.profile === "object" && !Array.isArray(output.profile) ? output.profile : {};
  const versions = Array.isArray(output.availableVersions) ? output.availableVersions.filter((name): name is string => typeof name === "string") : [];
  return <div className="space-y-3 text-sm">
    {Object.keys(profile).length > 0 && <dl className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">{Object.entries(profile).map(([field, value]) => <div key={field} className="min-w-0"><dt className="font-semibold">{field === "nickname" ? "Fictional character" : field === "favouriteColour" ? "Favourite colour" : field === "favouriteAnimal" ? "Favourite animal" : field}</dt><dd className="break-words">{String(value)}</dd></div>)}</dl>}
    {typeof output.restoredVersion === "string" && output.restoredVersion && <p className="rounded-lg bg-sky-50 p-3">Retrieved source: <strong>{output.restoredVersion}</strong>. Original sources still available: {versions.join(", ")}.</p>}
    {typeof output.reportRoute === "string" && output.reportRoute !== "none" && <section className="rounded-xl border border-slate-200 p-3" aria-label="Practice report"><h4 className="font-semibold">Practice report · {output.reportRoute}</h4><p className="mt-2 whitespace-pre-wrap break-words">{String(output.reportDescription ?? "No description added.")}</p><p className="mt-2 text-slate-600">This report is saved in the practice result. No real report was sent.</p></section>}
    {typeof output.explanation === "string" && output.explanation && <section className="rounded-xl border border-slate-200 p-3"><h4 className="font-semibold">Guide and purpose notes</h4><p className="mt-2 whitespace-pre-wrap break-words">{output.explanation}</p></section>}
  </div>;
}
