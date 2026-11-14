"use client";
import { useEffect, useState } from "react";
import type { Json } from "@/lib/coding/learning/types";
const record = (value: Json | undefined): Record<string, Json> => value && typeof value === "object" && !Array.isArray(value) ? value : {};
function Story({ name, events, width, height }: { name: string; events: Json[]; width: number; height: number }) {
  const [index, setIndex] = useState(0), [playing, setPlaying] = useState(false);
  const current = Math.min(index, Math.max(0, events.length - 1)), event = record(events[current]);
  const speech = events.slice(0, current + 1).map(record).filter((event) => event.type === "say").at(-1)?.text;
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => { if (current >= events.length - 1) setPlaying(false); else setIndex((index) => index + 1); }, 650);
    return () => clearInterval(timer);
  }, [playing, current, events.length]);
  return <figure className="space-y-3 rounded-xl border border-sky-300 bg-sky-50 p-4"><figcaption className="font-bold text-sky-950">{name} · speech and movement in actual execution order</figcaption><div className="rounded-lg border border-sky-300 bg-white p-3 text-lg text-slate-950" aria-live="polite">{typeof speech === "string" ? speech : "No speech has happened yet."}</div><svg viewBox={`0 0 ${width * 40} ${height * 40}`} role="img" aria-label={`${name} at column ${Number(event.x) + 1}, row ${Number(event.y) + 1}`} className="mx-auto block w-full max-w-sm rounded-xl bg-white"><rect width={width * 40} height={height * 40} fill="white" stroke="#94a3b8" /><g transform={`translate(${(Number(event.x) + 0.5) * 40} ${(height - Number(event.y) - 0.5) * 40})`}><circle r="14" fill="#0369a1" /><circle cx="-5" cy="-3" r="2" fill="white" /><circle cx="5" cy="-3" r="2" fill="white" /><path d="M-5 5Q0 11 5 5" stroke="white" strokeWidth="2" fill="none" /></g></svg><p className="text-sm text-sky-950">Step {current + 1} of {events.length}: {event.type === "say" ? "speech" : "movement"} · column {Number(event.x) + 1}, row {Number(event.y) + 1}</p><label className="block text-sm">Story step<input className="block min-h-11 w-full" type="range" min={0} max={Math.max(0, events.length - 1)} value={current} aria-label={`${name} story step`} onChange={(event) => { setPlaying(false); setIndex(Number(event.target.value)); }} /></label><div className="flex flex-wrap gap-2"><button className="min-h-11 rounded-lg bg-sky-800 px-4 py-2 text-sm font-semibold text-white" type="button" onClick={() => { if (!playing && current >= events.length - 1) setIndex(0); setPlaying(!playing); }}>{playing ? "Pause story" : "Replay story"}</button><button className="min-h-11 rounded-lg border border-sky-800 bg-white px-4 py-2 text-sm text-sky-950" type="button" onClick={() => { setPlaying(false); setIndex(0); }}>Restart story replay</button></div></figure>;
}
export default function StoryExecution({ output, input }: { output: Record<string, Json>; input: Record<string, Json> }) {
  const actors = output.actors ? Object.entries(record(output.actors)) : output.left ? [["Program A", output.left], ["Program B", output.right]] as const : [["Your character", output] as const];
  const stories = actors.flatMap(([name, value]) => { const events = record(value).storyEvents; return Array.isArray(events) && events.some((event) => record(event).type === "say") ? [{ name, events }] : []; });
  if (!stories.length) return null;
  return <section className="space-y-4" aria-label="Executed story replay">{stories.map((story) => <Story key={story.name + JSON.stringify(story.events)} {...story} width={Math.max(2, Math.min(20, Number(input.width) || 6))} height={Math.max(2, Math.min(20, Number(input.height) || 6))} />)}</section>;
}
