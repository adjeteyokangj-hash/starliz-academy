import type { Json } from "@/lib/coding/learning/types";

export default function GameState({ variables }: { variables: Record<string, Json> }) {
  const fields = [["score", "Score"], ["lives", "Lives"], ["time", "Clock units"], ["question", "Question"], ["status", "Game status"], ["feedback", "Answer feedback"]].filter(([name]) => Object.hasOwn(variables, name!));
  if (!fields.length) return null;
  return <section className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-4" aria-label="Game state after execution"><h3 className="font-bold text-slate-950">Game state after execution</h3><dl className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-live="polite">{fields.map(([name, label]) => <div key={name} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3"><dt className="text-sm font-semibold text-slate-600">{label}</dt><dd className="mt-2 break-words text-xl font-bold text-slate-950">{String(variables[name!] ?? "")}</dd></div>)}</dl></section>;
}
