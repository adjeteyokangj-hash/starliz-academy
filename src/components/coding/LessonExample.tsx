"use client";
import type { LocationId } from "@/lib/coding/world/model";

import { useState } from "react";
import type { Execution, Json, PracticalArtifact } from "@/lib/coding/learning/types";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import LearningExecution from "./LearningExecution";

type Example = { artifact: PracticalArtifact; input: Json; map?: { goal: { x: number; y: number } | null; stops: Json[] } };
function commandLabels(document: Json): string[] {
  const record = (value: Json | undefined): Record<string, Json> => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const start = record(record(document).handlers).start;
  if (!Array.isArray(start)) return [];
  const visit = (commands: Json[], depth = 0): string[] => depth > 8 ? [] : commands.slice(0, 40).flatMap(item => {
    const command = record(item), prefix = depth ? `${"↳ ".repeat(depth)}` : "";
    let label = String(command.op ?? "Action");
    if (command.op === "move") label = typeof command.x !== "number" || typeof command.y !== "number" ? "Move using the supplied x and y values"
      : command.x === 1 && command.y === 0 ? "Move right →" : command.x === -1 && command.y === 0 ? "Move left ←"
        : command.y === 1 && command.x === 0 ? "Move up ↑" : command.y === -1 && command.x === 0 ? "Move down ↓" : `Move by x=${command.x}, y=${command.y}`;
    if (command.op === "repeat") label = `Repeat ${typeof command.amount === "number" ? command.amount : "the supplied count"} times`;
    return [prefix + label, ...(Array.isArray(command.body) ? visit(command.body, depth + 1) : []), ...(Array.isArray(command.otherwise) && command.otherwise.length ? [prefix + "Otherwise", ...visit(command.otherwise, depth + 1)] : [])];
  });
  return visit(start);
}
export default function LessonExample({ example, endpoint, bookingId, activityId, predictionLocked, worldLocation, boundLearner }: { example: Example; endpoint: string; bookingId?: string; activityId: string; predictionLocked: boolean; worldLocation?: LocationId; boundLearner?: string }) {
  const [result, setResult] = useState<{ artifact: PracticalArtifact; input: Json; execution: Execution } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const labels = example.artifact.type === "visual" ? commandLabels(example.artifact.document) : [];
  async function run() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetchWithRefreshRetry(`${endpoint}${endpoint.includes("?") ? "&" : "?"}lessonExample=1`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", ...(boundLearner ? { "X-Coding-Learner": boundLearner } : {}) }, body: JSON.stringify({ bookingId }) });
      const data = await response.json();
      if (!response.ok || !data.lessonExample) throw new Error(data.error ?? "The example could not run. Your program is unchanged.");
      setResult(data.lessonExample);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The example could not run."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Lesson Example" tabIndex={0} className="min-w-0 overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm focus-visible:outline-2 focus-visible:outline-violet-600" data-lesson-example={activityId}>
    <div className="border-b border-indigo-100 bg-indigo-50/80 p-4"><div className="flex items-center justify-between gap-3"><h2 className="text-base font-bold text-indigo-950">Lesson Example</h2><span className="rounded-full border border-indigo-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-700">Read only</span></div><p className="mt-2 text-xs leading-5 text-slate-600">Your reference stays here while you build. Running it never changes your program.</p></div>
    <div className="space-y-3 p-4">

      <button type="button" onClick={() => void run()} disabled={busy || predictionLocked} className="min-h-11 w-full rounded-xl border border-indigo-200 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50">{busy ? "Running example…" : "Run lesson example"}</button>
      {predictionLocked && <p className="text-xs leading-5 text-slate-600">Record your prediction before replaying.</p>}
      {error && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{error}</p>}
      <details className="studio-example-source rounded-xl border border-slate-200 bg-slate-50 p-3"><summary className="min-h-11 cursor-pointer text-sm font-semibold text-slate-700">View example {example.artifact.type === "source" ? "code" : "instructions"}</summary>{labels.length ? <ol className="space-y-2" aria-label="Lesson example commands">{labels.map((label, index) => <li key={index} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-950">{index + 1}. {label}</li>)}</ol> : <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-3 text-xs leading-6 text-slate-100">{example.artifact.type === "source" ? [example.artifact.html, example.artifact.css, example.artifact.source].filter(Boolean).join("\n\n") : JSON.stringify(example.artifact.document, null, 2)}</pre>}</details>
      {result ? <LearningExecution worldLocation={worldLocation} replayContext="example" execution={result.execution} input={result.input} map={example.map} stylesheet={result.artifact.type === "source" ? result.artifact.css : ""} /> : <p className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-4 text-sm leading-6 text-indigo-950">Replay the teaching example, then compare it with your own result.</p>}
    </div>
  </section>;
}
