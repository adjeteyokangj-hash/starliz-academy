"use client";

import { useEffect, useState } from "react";
import { CODING_GRID_SIZE, type CodingBlock, type CodingProgram, type CodingRunResult } from "@/lib/coding/types";

function SavedBlocks({ blocks }: { blocks: CodingBlock[] }) {
  return <ol className="list-decimal space-y-1 pl-5 text-sm">{blocks.map(block => <li key={block.id}>
    {block.kind === "move" ? `Move ${block.direction}` : <>Repeat {block.times} times<SavedBlocks blocks={block.body} /></>}
  </li>)}</ol>;
}

export default function CodingProjectReplay({ project, audience = "parent" }: { project: { program: CodingProgram; run: CodingRunResult; updatedAt: string; evidenceStatus?: string }; audience?: "parent" | "learner" }) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (frame >= project.run.frames.length - 1) setPlaying(false);
      else setFrame(frame + 1);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [playing, frame, project.run.frames.length]);
  const point = project.run.frames[Math.min(frame, project.run.frames.length - 1)] ?? { x: 0, y: 0 };
  return <div className="mt-4 rounded-xl border border-white/15 p-4">
    <p className="font-bold">{audience === "learner" ? "Your saved project" : "Your child’s saved project"}</p>
    <p className="mt-1 text-xs text-slate-300">{project.evidenceStatus === "assessed-version" ? "This version supplied the independent mastery evidence." : "This is saved draft work. Mastery evidence is tracked separately."}</p>
    <p className="mt-1 text-xs text-slate-400">Saved {new Date(project.updatedAt).toLocaleString("en-GB")}. Private to your family and authorised teachers.</p>
    <div className="mt-3 grid max-w-xs grid-cols-6 gap-1" role="img" aria-label={`Saved program replay. Character at column ${point.x}, row ${point.y}.`}>
      {Array.from({ length: CODING_GRID_SIZE * CODING_GRID_SIZE }, (_, index) => {
        const x = index % CODING_GRID_SIZE;
        const y = CODING_GRID_SIZE - 1 - Math.floor(index / CODING_GRID_SIZE);
        return <span aria-hidden="true" key={index} className={`flex aspect-square items-center justify-center rounded ${x === point.x && y === point.y ? "bg-violet-600 text-white" : "bg-slate-800"}`}>{x === point.x && y === point.y ? "●" : "·"}</span>;
      })}
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className="rounded-lg bg-violet-600 px-3 py-2 font-bold" onClick={() => { setFrame(0); setPlaying(true); }}>Replay project</button>
      <button type="button" className="rounded-lg border border-white/20 px-3 py-2" disabled={!playing} onClick={() => setPlaying(false)}>Pause</button>
      <button type="button" className="rounded-lg border border-white/20 px-3 py-2" onClick={() => { setPlaying(false); setFrame((value) => Math.min(value + 1, project.run.frames.length - 1)); }}>Next step</button>
    </div>
    <p role="status" className="mt-2 text-xs">Step {frame} of {Math.max(0, project.run.frames.length - 1)}{project.run.error ? ` · ${project.run.error}` : ""}</p>
    <details className="mt-3"><summary className="cursor-pointer">Inspect saved blocks</summary>{audience === "learner" ? <div className="mt-2"><SavedBlocks blocks={project.program.blocks} /></div> : <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(project.program, null, 2)}</pre>}</details>
  </div>;
}
