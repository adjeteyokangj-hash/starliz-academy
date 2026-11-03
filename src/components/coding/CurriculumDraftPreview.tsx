"use client";

import { useEffect, useState } from "react";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import { CODING_STAGES, type CodingProgram, type CodingDirection, type CodingStage } from "@/lib/coding/types";

type Point = { x: number; y: number };
type Stage = { id: CodingStage; instruction: string; starter: CodingProgram; scene: { start: Point; goal: Point | null; checkpoints: Point[] } };
type Draft = { id: string; title: string; objective: string; stages: Stage[];
  independentChallenges: Array<{ id: string; task: string; scene: Stage["scene"] }> };

export default function CurriculumDraftPreview({ lessonId }: { lessonId: string }) {
  const [lesson, setLesson] = useState<Draft | null>(null);
  const [stageId, setStageId] = useState<CodingStage>("discover");
  const [program, setProgram] = useState<CodingProgram>({ blocks: [] });
  const [frames, setFrames] = useState<Point[]>([]);
  const [frame, setFrame] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [prediction, setPrediction] = useState({ x: "", y: "" });
  const [variantId, setVariantId] = useState("");
  useEffect(() => {
    let cancelled = false;
    void fetchWithRefreshRetry(`/api/admin/coding/preview/${lessonId}`).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Preview could not be opened.");
      if (!cancelled) { setLesson(data.lesson); setProgram(data.lesson.stages[0].starter); }
    }).catch((error) => { if (!cancelled) setMessage(error.message); });
    return () => { cancelled = true; };
  }, [lessonId]);
  const stage = lesson?.stages.find((value) => value.id === stageId);
  const independent = stageId === "create" ? lesson?.independentChallenges.find((variant) => variant.id === variantId) : null;
  function open(next: CodingStage) {
    const chosen = lesson?.stages.find((value) => value.id === next);
    if (!chosen) return;
    setStageId(next); setProgram(chosen.starter); setFrames([]); setFrame(0); setMessage(""); setPrediction({ x: "", y: "" });
    setVariantId(next === "create" ? lesson?.independentChallenges[0]?.id ?? "" : "");
  }
  async function run() {
    setBusy(true);
    try {
      const response = await fetchWithRefreshRetry(`/api/admin/coding/preview/${lessonId}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: stageId, program,
          ...(stageId === "create" && variantId ? { variantId } : {}),
          ...(stageId === "predict" && prediction.x !== "" && prediction.y !== "" ? { prediction: { x: Number(prediction.x), y: Number(prediction.y) } } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Program could not run.");
      setFrames(data.run.frames); setFrame(0);
      setMessage(data.assessment.passed ? stageId === "predict" ? "Your prediction matches the final square. Step through the arrows to explain why." : "The route meets this stage’s destination, stops and movement budget."
        : data.assessment.failureCode === "prediction-mismatch" ? "Your prediction differs from the final square. Step through each arrow and compare it with your prediction."
          : data.run.error || `Check failed: ${data.assessment.failureCode}. Inspect the trace and repair your commands.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Program could not run."); }
    finally { setBusy(false); }
  }
  if (!lesson || !stage) return <p role="status" className="p-6">{message || "Opening executable draft…"}</p>;
  const scene = independent?.scene ?? stage.scene;
  const position = frames[frame] ?? scene.start;
  return <main className="mx-auto max-w-6xl space-y-5 p-4 text-slate-100">
    <p className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm">Author preview · This draft is not published. Runs do not award learner progress or achievements.</p>
    <h1 className="text-3xl font-bold">{lesson.title}</h1><p>{lesson.objective}</p>
    <nav aria-label="Lesson preview stages" className="flex flex-wrap gap-2">{CODING_STAGES.map((id) => <button type="button" key={id} aria-pressed={stageId === id} disabled={busy} onClick={() => open(id)} className={`rounded-xl px-4 py-3 ${id === stageId ? "bg-sky-600" : "bg-slate-800"}`}>{id}</button>)}</nav>
    <p className="rounded-2xl bg-slate-800 p-5 text-lg">{independent?.task ?? stage.instruction}</p>
    {stageId === "create" && <label className="flex flex-wrap items-center gap-3">Independent challenge
      <select disabled={busy} value={variantId} onChange={(event) => { setVariantId(event.target.value); setProgram({ blocks: [] }); setFrames([]); setFrame(0); setMessage(""); }} className="rounded-xl bg-slate-800 p-3">
        {lesson.independentChallenges.map((variant, index) => <option key={variant.id} value={variant.id}>Challenge {index + 1}</option>)}
      </select></label>}
    <div className="grid gap-5 md:grid-cols-2">
      <section className="rounded-2xl border border-slate-700 p-4"><h2 className="mb-3 font-bold">Delivery map</h2>
        {stageId === "predict" && <fieldset disabled={busy} className="mb-4 space-y-3 rounded-xl bg-sky-950 p-3"><legend className="px-1 font-bold">Choose the final square before running</legend>
          <p className="text-sm">Count columns from the left and rows from the bottom.</p>
          <div className="flex flex-wrap gap-3">{(["x", "y"] as const).map((axis) => <label key={axis} className="flex items-center gap-2">{axis === "x" ? "Column" : "Row"}
            <select aria-label={axis === "x" ? "Column" : "Row"} value={prediction[axis]} onChange={(event) => { const selected = event.target.value; setPrediction((value) => ({ ...value, [axis]: selected })); }} className="rounded-lg bg-slate-800 p-3">
              <option value="">Choose</option>{Array.from({ length: 6 }, (_, index) => <option key={index} value={index}>{index + 1}</option>)}
            </select></label>)}</div>
        </fieldset>}
        <div className="grid grid-cols-6 gap-1" role="img" aria-label={`Character at ${position.x}, ${position.y}.`}>
          {Array.from({ length: 36 }, (_, index) => {
            const x = index % 6, y = 5 - Math.floor(index / 6);
            const stop = scene.checkpoints.findIndex((point) => point.x === x && point.y === y);
            return <span aria-hidden="true" key={index} className="flex aspect-square items-center justify-center rounded bg-slate-800 text-xl">{position.x === x && position.y === y ? "●" : scene.goal?.x === x && scene.goal?.y === y ? "★" : stop >= 0 ? stop + 1 : "·"}</span>;
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setFrame(Math.max(0, frame - 1))} disabled={frame === 0} className="rounded-lg border p-3 disabled:opacity-40">Previous step</button><button type="button" onClick={() => setFrame(Math.min(frames.length - 1, frame + 1))} disabled={frame >= frames.length - 1} className="rounded-lg border p-3 disabled:opacity-40">Next step</button></div>
        <p className="mt-2 text-sm">Trace step {frame} of {Math.max(0, frames.length - 1)}</p>
      </section>
      <section className="rounded-2xl border border-slate-700 p-4"><h2 className="mb-3 font-bold">Your commands</h2>
        <fieldset disabled={busy || stageId === "review"}><legend className="sr-only">Edit the delivery route</legend>
          <div className="flex flex-wrap gap-2">{(["right", "up", "left", "down"] as CodingDirection[]).map((direction) => <button type="button" key={direction} disabled={stageId === "predict"} onClick={() => setProgram((value) => ({ blocks: [...value.blocks, { id: crypto.randomUUID(), kind: "move", direction }] }))} className="rounded-xl bg-violet-700 px-4 py-3 disabled:opacity-40">Move {direction}</button>)}</div>
          <ol className="my-4 space-y-2">{program.blocks.map((block, index) => <li key={block.id} className="flex items-center justify-between rounded-xl bg-slate-800 p-3"><span>{index + 1}. {block.kind === "move" ? `Move ${block.direction}` : `Repeat ${block.times}`}</span><button type="button" disabled={stageId === "predict"} aria-label={`Remove command ${index + 1}`} onClick={() => setProgram((value) => ({ blocks: value.blocks.filter((_, i) => i !== index) }))} className="rounded-lg border px-3 py-2 disabled:opacity-40">Remove</button></li>)}</ol>
          <div className="flex gap-2"><button type="button" disabled={stageId === "predict" && (prediction.x === "" || prediction.y === "")} onClick={() => void run()} className="rounded-xl bg-emerald-700 px-5 py-3 font-bold disabled:opacity-40">Run commands</button><button type="button" disabled={stageId === "predict"} onClick={() => { setProgram({ blocks: [] }); setFrames([]); setFrame(0); }} className="rounded-xl border px-4 py-3 disabled:opacity-40">Clear</button></div>
        </fieldset>
      </section>
    </div><p role="status" className="rounded-xl bg-slate-800 p-4">{message || "Build a route, run it, then inspect each step."}</p>
  </main>;
}
