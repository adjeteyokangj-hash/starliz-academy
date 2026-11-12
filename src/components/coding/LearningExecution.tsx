"use client";
import type { LocationId } from "@/lib/coding/world/model";
import WorldRouteView from "./world/WorldRouteView";
import EngineeringExecution from "./EngineeringExecution";
import SqlExecution from "./SqlExecution";
import FixtureServiceExecution from "./FixtureServiceExecution";
import LearningGameControls from "./LearningGameControls";
import WebInspection from "./WebInspection";
import ClassifierExecution from "./ClassifierExecution";
import SystemsExecution from "./SystemsExecution";
import InvestigationExecution from "./InvestigationExecution";

import { useEffect, useState } from "react";
import ProjectPreview, { type ProjectInteraction } from "./ProjectPreview";
import ScenarioReplay from "./ScenarioReplay";
import DataExecution from "./DataExecution";
import DataRepresentationExecution from "./DataRepresentationExecution";
import StoryExecution from "./StoryExecution";
import NetworkExecution from "./NetworkExecution";
import GameState from "./GameState";
import EvidenceControls from "./EvidenceControls";
import type { Execution, Json } from "@/lib/coding/learning/types";
import type { EvidenceManifest } from "@/lib/coding/learning/evidence-links";

const record = (value: Json | undefined): Record<string, Json> => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const points = (value: Json | undefined) => Array.isArray(value) ? value.flatMap((item) => {
  const point = record(item);
  return typeof point.x === "number" && Number.isFinite(point.x) && typeof point.y === "number" && Number.isFinite(point.y) ? [{ x: point.x, y: point.y }] : [];
}) : [];

function Values({ values, caption }: { values: Record<string, Json>; caption: string }) {
  return <div className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-sky-700" tabIndex={0} role="region" aria-label={`${caption} table`}><table className="w-full border-collapse text-left text-sm"><caption className="mb-2 text-left font-semibold text-slate-800">{caption}</caption><thead><tr className="bg-slate-100"><th scope="col" className="p-2">Name</th><th scope="col" className="p-2">Actual value</th><th scope="col" className="p-2">Type</th></tr></thead><tbody>{Object.entries(values).map(([name, value]) => <tr key={name} className="border-b border-slate-200"><th scope="row" className="p-2 font-mono">{name}</th><td className="max-w-xs break-words p-2 font-mono">{JSON.stringify(value)}</td><td className="p-2">{value === null ? "null" : Array.isArray(value) ? "list" : typeof value}</td></tr>)}</tbody></table></div>;
}

function VariableTrace({ trace }: { trace: Json[] }) {
  const frames = trace.map(record).filter((frame) => typeof frame.line === "number" && frame.variables && typeof frame.variables === "object"), [selected, setSelected] = useState(0);
  if (!frames.length) return null;
  const index = Math.min(selected, frames.length - 1), frame = frames[index]!;
  return <section className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-4"><h3 className="font-bold text-slate-900">Interpreter debugger</h3><p className="text-sm text-slate-700">State before Python line {String(frame.line)}. Move forward to see the effect of the statement that just ran.</p><div className="flex flex-wrap items-center gap-2"><button type="button" className="min-h-11 rounded-lg border border-slate-400 bg-white px-3 text-sm disabled:opacity-50" disabled={index === 0} onClick={() => setSelected(index - 1)}>Previous step</button><label className="flex min-w-36 flex-1 items-center gap-2 text-sm">Trace step {index + 1} / {frames.length}<input className="min-w-20 flex-1" type="range" min={0} max={frames.length - 1} value={index} aria-label="Interpreter trace step" onChange={(event) => setSelected(Number(event.currentTarget.value))} /></label><button type="button" className="min-h-11 rounded-lg border border-slate-400 bg-white px-3 text-sm disabled:opacity-50" disabled={index === frames.length - 1} onClick={() => setSelected(index + 1)}>Next step</button></div><Values values={record(frame.variables)} caption={`Values before line ${String(frame.line)}`} /></section>;
}

function RoutePlayback({ output, input, goal, stops, replayContext, worldLocation }: { output: Record<string, Json>; input: Record<string, Json>; goal?: { x: number; y: number } | null; stops?: Json[]; replayContext?: "example" | "program"; worldLocation?: LocationId }) {
  const actors = output.actors ? Object.entries(record(output.actors)) : output.left ? [["Program A", output.left], ["Program B", output.right]] as const : [["Your character", output]] as const;
  const paths = actors.map(([name, actor]) => ({ name, visits: points(record(actor as Json).visits), headings: Array.isArray(record(actor as Json).headings) ? record(actor as Json).headings as Json[] : [] }));
  const maximum = Math.max(0, ...paths.map((path) => path.visits.length - 1));
  const [position, setPosition] = useState(maximum), [playing, setPlaying] = useState(false);
  const current = Math.min(position, maximum);
  const width = Math.max(2, Math.min(20, Number(input.width) || 6)), height = Math.max(2, Math.min(20, Number(input.height) || 6));
  const cell = 48, colours = ["#0369a1", "#a21caf", "#15803d", "#b45309"];
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => { if (current >= maximum) setPlaying(false); else setPosition((value) => Math.min(maximum, value + 1)); }, 500);
    return () => clearInterval(timer);
  }, [playing, maximum, current]);
  return <div className="space-y-3">{worldLocation ? <WorldRouteView location={worldLocation} width={width} height={height} actors={paths.map(path => ({ name: path.name, visits: path.visits.slice(0, current + 1) }))} goal={goal} obstacles={points(input.obstacles)} track={points(input.track)} stops={points(stops as Json)}/> : <svg viewBox={`0 0 ${width * cell} ${height * cell}`} role="img" aria-label={`Executed movement trail at movement ${current} of ${maximum}`} className="mx-auto rounded-xl border border-slate-300 bg-white" style={{ display: "block", width: "100%", maxWidth: 480, height: "auto" }}>
    {Array.from({ length: width * height }, (_, index) => <rect key={index} x={index % width * cell} y={Math.floor(index / width) * cell} width={cell} height={cell} fill="none" stroke="#cbd5e1" />)}
    {points(input.track).length > 0 && <polyline points={points(input.track).map((point) => `${(point.x + .5) * cell},${(height - point.y - .5) * cell}`).join(" ")} fill="none" stroke="#86efac" strokeWidth={16}><title>Supplied marked robot path</title></polyline>}
    {points(input.obstacles).map((point, i) => <rect key={`wall-${i}`} x={point.x * cell + 3} y={(height - point.y - 1) * cell + 3} width={cell - 6} height={cell - 6} rx={5} fill="#475569" />)}
    {goal && <g><rect x={goal.x * cell + 5} y={(height - goal.y - 1) * cell + 5} width={cell - 10} height={cell - 10} rx={8} fill="#fef08a" stroke="#a16207" /><text x={(goal.x + .5) * cell} y={(height - goal.y - .4) * cell} textAnchor="middle" fontSize={22}>★</text></g>}
    {points(stops as Json).map((point, i) => <text key={`stop-${i}`} x={(point.x + .5) * cell} y={(height - point.y - .4) * cell} textAnchor="middle" fill="#92400e" fontSize={20}>{i + 1}</text>)}
    {paths.map((path, index) => {
      const visited = path.visits.slice(0, current + 1), here = visited.at(-1), colour = colours[index % colours.length];
      return <g key={path.name}><polyline points={visited.map((p) => `${(p.x + .5) * cell},${(height - p.y - .5) * cell}`).join(" ")} fill="none" stroke={colour} strokeWidth={4} opacity={.7} />{here && <g transform={`translate(${(here.x + .5) * cell} ${(height - here.y - .5) * cell})`}><circle r={12} fill={colour}><title>{path.name}: column {here.x + 1}, row {here.y + 1}</title></circle>{typeof path.headings[Math.min(current, path.headings.length - 1)] === "number" && <path d="M-5-5L7 0L-5 5Z" fill="white" transform={`rotate(${Number(path.headings[Math.min(current, path.headings.length - 1)]) * 90})`} />}</g>}</g>;
    })}
  </svg>}<div className="flex flex-wrap items-center gap-3"><button type="button" className="min-h-11 rounded-lg bg-sky-800 px-4 py-2 font-semibold text-white" onClick={() => { if (!playing && current >= maximum) setPosition(0); setPlaying(!playing); }}>{replayContext === "example" ? playing ? "Pause Example" : "Replay Example" : replayContext === "program" ? playing ? "Pause My Program" : "Replay My Program" : playing ? "Pause replay" : "Replay actual movements"}</button><label className="flex min-w-36 flex-1 items-center gap-2 text-sm text-slate-700">Movement {current} / {maximum}<input className="min-w-20 flex-1" type="range" min={0} max={maximum} value={current} aria-label="Replay movement" onChange={(event) => { setPlaying(false); setPosition(Number(event.currentTarget.value)); }} /></label></div>
    <ul className="space-y-1 text-sm text-slate-700">{paths.map((path) => { const here = path.visits[Math.min(current, path.visits.length - 1)]; return <li key={path.name}>{path.name}: {here ? `column ${here.x + 1}, row ${here.y + 1} (x=${here.x}, y=${here.y})` : "no movement recorded"}</li>; })}</ul>
  </div>;
}

export default function LearningExecution({ execution, input = {}, map, onInteraction, evidence = [], onEvidence, stylesheet = "", resizablePreview = false, previewBusy = false, previewError = "", replayContext, worldLocation }: {
  execution: Execution | null; input?: Json; map?: { goal: { x: number; y: number } | null; stops: Json[] }; onInteraction?: (interaction: ProjectInteraction) => void; stylesheet?: string; resizablePreview?: boolean; previewBusy?: boolean; previewError?: string;
  evidence?: EvidenceManifest; onEvidence?: (slot: "first" | "second") => void; replayContext?: "example" | "program"; worldLocation?: LocationId;
}) {
  if (!execution) return <p className="rounded-xl border-2 border-dashed border-slate-300 p-6 text-slate-600">Run your work to see what it actually does. Your result and trace will appear here.</p>;
  const output = record(execution.output), result = record(output.result), media = record(output.document);
  const resolved = Array.isArray(result.resolvedEvidence) ? result.resolvedEvidence.map(record) : [];
  const allowedEvidence = evidence.filter((entry) => resolved.some((link) => link.valid === true && link.slot === entry.slot && link.versionId === entry.versionId && link.artifactHash === entry.artifactHash));
  const openEvidence = onEvidence ? (slot: "first" | "second") => { if (allowedEvidence.some((entry) => entry.slot === slot)) onEvidence(slot); } : undefined;
  const poster = output.evidencePoster === true, interaction = record(output.interaction), posterData = record(output.data);
  const route = Array.isArray(output.visits) || output.actors || output.left;
  return <section aria-label="Execution result" className="min-w-0 space-y-4">
    {output.variables && <GameState variables={record(output.variables)} />}
    <EvidenceControls output={output} onInteraction={onInteraction} />
    <LearningGameControls output={output} onInteraction={onInteraction} />
    {!execution.ok && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">{execution.error ?? "The program stopped. Inspect its output and repair the cause."}</p>}
    {route && <RoutePlayback key={execution.sourceHash ?? JSON.stringify(output)} output={output} input={record(input)} goal={map?.goal} stops={map?.stops} replayContext={replayContext} worldLocation={worldLocation} />}
    <StoryExecution output={output} input={record(input)} />
    <NetworkExecution output={output} />
    <EngineeringExecution output={output} />
    <ClassifierExecution output={output} />
    <SystemsExecution output={output} trace={execution.trace} />
    <InvestigationExecution output={output} />
    {output.sensors && <Values values={record(output.sensors)} caption="Sensor readings after execution" />}
    {Array.isArray(output.powers) && output.powers.length > 0 && <section className="space-y-2 rounded-xl border border-slate-300 p-3"><h3 className="font-bold">Applied motor power</h3><p className="text-sm text-slate-700">Zero means no applied power. Final actuator state: {output.stopped === true ? "stopped" : "not stopped"}.</p><ol className="flex max-h-64 list-inside list-decimal flex-wrap gap-3 overflow-y-auto text-sm" aria-label="Actuator power sequence">{output.powers.map((power, index) => <li key={index} className="rounded-lg bg-slate-100 p-2 font-mono">{String(power)}</li>)}</ol></section>}
    {typeof result.html === "string" && <ProjectPreview html={result.html} css={result.styleInspection ? "" : stylesheet} title="Executed web project" onInteraction={onInteraction} onEvidence={openEvidence} resizable={resizablePreview} busy={previewBusy} resetKey={execution.sourceHash} retryToken={previewError} />}
    {output.result !== undefined && typeof result.html !== "string" && <Values values={output.result !== null && typeof output.result === "object" && !Array.isArray(output.result) ? result : { result: output.result }} caption="Returned values" />}
    {openEvidence && allowedEvidence.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Open actual linked creations">{allowedEvidence.map((entry) => <button key={entry.slot} type="button" className="min-h-11 rounded-xl border border-sky-700 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-950" onClick={() => openEvidence(entry.slot)}>Open saved creation: {entry.title}</button>)}</div>}
    <WebInspection result={result} />
    {output.variables && Object.keys(record(output.variables)).length > 0 && <Values values={record(output.variables)} caption="Final variable values" />}
    {output.visual && output.python && <section className="space-y-3 rounded-xl border border-violet-300 bg-violet-50 p-4"><h3 className="font-bold">Compare both representations</h3><p className="text-sm">{output.equivalent === true ? "Both programs produced the same final values and output." : "The programs differ. Compare their states and the order of their statements."}</p><div className="grid gap-4 lg:grid-cols-2"><Values values={record(record(output.visual).variables)} caption="Visual program" /><Values values={record(record(output.python).variables)} caption="Python program" /></div><VariableTrace trace={Array.isArray(record(output.python).trace) ? record(output.python).trace as Json[] : []} /></section>}
    <VariableTrace trace={execution.trace} />
    <ScenarioReplay output={output} />
    {(!poster || interaction.view !== "explanation") && <DataExecution output={poster ? interaction.view === "table" ? { ...posterData, chart: { ...record(posterData.chart), type: "none" } } : posterData : output} />}
    <DataRepresentationExecution output={output} />
    {Array.isArray(result.representations) && result.representations.slice(0, 2).map((representation, index) => {
      const values = record(representation);
      return values.representationMode === "pixels" || values.representationMode === "sound" ? <DataRepresentationExecution key={index} output={values} /> : null;
    })}
    {Array.isArray(media.shapes) && <figure><svg viewBox="0 0 600 400" className="w-full rounded-xl border border-slate-300" role="img" aria-label={String(media.narration || media.caption || "Your picture")} style={{ backgroundColor: /^#[a-f\d]{6}$/i.test(String(media.background)) ? String(media.background) : "white" }}>
      {media.shapes.map((value, index) => { const shape = record(value), x = Number(shape.x), y = Number(shape.y), width = Number(shape.width), height = Number(shape.height), fill = /^#[a-f\d]{6}$/i.test(String(shape.fill)) ? String(shape.fill) : "#0f172a";
        return shape.kind === "text" ? <text key={index} x={x} y={y + Number(media.fontSize || 20)} fill={fill} fontSize={Number(media.fontSize || 20)}>{String(shape.text)}</text> : shape.kind === "circle" ? <ellipse key={index} cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} fill={fill}><title>{String(shape.alt)}</title></ellipse> : <rect key={index} x={x} y={y} width={width} height={height} fill={fill}><title>{String(shape.alt)}</title></rect>;
      })}</svg><figcaption className="mt-2 rounded-lg p-3" style={{ fontSize: Math.max(10, Math.min(80, Number(media.fontSize) || 18)), color: /^#[a-f\d]{6}$/i.test(String(media.foreground)) ? String(media.foreground) : "#0f172a", backgroundColor: /^#[a-f\d]{6}$/i.test(String(media.background)) ? String(media.background) : "#ffffff" }}>{String(media.caption ?? "")}</figcaption>
      {Array.isArray(media.steps) && media.steps.length > 0 && <ol aria-label="Instruction steps" className="mt-3 list-decimal space-y-2 rounded-lg p-4 pl-10" style={{ fontSize: Math.max(10, Math.min(80, Number(media.fontSize) || 18)), color: /^#[a-f\d]{6}$/i.test(String(media.foreground)) ? String(media.foreground) : "#0f172a", backgroundColor: /^#[a-f\d]{6}$/i.test(String(media.background)) ? String(media.background) : "#ffffff" }}>{media.steps.map((step, index) => <li key={index}>{String(step)}</li>)}</ol>}</figure>}
    {Array.isArray(output.results) && <SqlExecution results={output.results} />}
    {output.service && typeof output.service === "object" && !Array.isArray(output.service) && <FixtureServiceExecution service={output.service} />}
    {execution.stdout && <div><h3 className="mb-2 text-sm font-semibold text-slate-800">Program output</h3><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-4 font-mono text-sm text-slate-100">{execution.stdout}</pre></div>}
    {execution.stderr && <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-xl bg-amber-50 p-3 text-sm text-amber-950">{execution.stderr}</pre>}
    <details className="rounded-xl border border-slate-300 p-3"><summary className="min-h-8 cursor-pointer font-semibold text-slate-800">Inspect returned values and execution trace</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-800">{JSON.stringify({ output: execution.output, trace: execution.trace }, null, 2)}</pre></details>
  </section>;
}
