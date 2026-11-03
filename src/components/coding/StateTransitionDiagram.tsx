"use client";
import { useId } from "react";
import type { StateDiagram } from "@/lib/coding/learning/state-diagram-contract";

export default function StateTransitionDiagram({ diagram }: { diagram: StateDiagram }) {
  const marker = `state-arrow-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const points = new Map(diagram.states.map((state, index) => { const angle = index * Math.PI * 2 / diagram.states.length - Math.PI / 2; return [state, { x: 320 + 210 * Math.cos(angle), y: 190 + 100 * Math.sin(angle) }]; }));
  return <figure className="min-w-0 space-y-3 rounded-xl border border-slate-300 bg-white p-4"><figcaption className="font-bold">{diagram.title}</figcaption><p className="text-sm text-slate-700">Declared instruction diagram. Initial state: <strong>{diagram.initial}</strong>. An unlisted signal keeps the current state. Compare this contract with your program&apos;s actual execution trace.</p>
    <p className="text-sm text-slate-700">On a narrow screen, scroll the diagram or use its complete transition table.</p><div role="region" aria-label="State diagram canvas" tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-sky-700"><svg viewBox="0 0 640 350" role="img" aria-label={diagram.title} className="mx-auto block w-full min-w-[600px] max-w-2xl"><title>{diagram.title}</title><desc>{diagram.transitions.map(transition => `${transition.from}, signal ${transition.event}, next ${transition.to}`).join(". ")}. Unlisted signals keep the current state.</desc><defs><marker id={marker} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#334155" /></marker></defs>
      {diagram.transitions.map((transition, index) => {
        const start = points.get(transition.from)!, end = points.get(transition.to)!;
        if (transition.from === transition.to) return <g key={index}><path d={`M${start.x - 35} ${start.y - 23}C${start.x - 90} ${start.y - 88},${start.x + 90} ${start.y - 88},${start.x + 35} ${start.y - 23}`} fill="none" stroke="#334155" strokeWidth="2" markerEnd={`url(#${marker})`} /><text x={start.x} y={start.y - 66} textAnchor="middle" fontSize="16" fill="#0f172a">{transition.event}</text></g>;
        const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy), ux = dx / length, uy = dy / length, offset = 13;
        const sx = start.x + ux * 65 - uy * offset, sy = start.y + uy * 32 + ux * offset, ex = end.x - ux * 65 - uy * offset, ey = end.y - uy * 32 + ux * offset;
        return <g key={index}><path d={`M${sx} ${sy}L${ex} ${ey}`} fill="none" stroke="#334155" strokeWidth="2" markerEnd={`url(#${marker})`} /><text x={(sx + ex) / 2 - uy * 15} y={(sy + ey) / 2 + ux * 15} textAnchor="middle" fontSize="16" fill="#0f172a" stroke="white" strokeWidth="5" paintOrder="stroke">{transition.event}</text></g>;
      })}
      {diagram.states.map(state => { const point = points.get(state)!; return <g key={state}><rect x={point.x - 64} y={point.y - 25} width="128" height="50" rx="16" fill={state === diagram.initial ? "#e0f2fe" : "#f8fafc"} stroke={state === diagram.initial ? "#0369a1" : "#475569"} strokeWidth={state === diagram.initial ? 3 : 2} /><text x={point.x} y={point.y + 6} textAnchor="middle" fontSize="18" fill="#0f172a">{state}</text></g>; })}
    </svg></div>
    <div className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-sky-700" tabIndex={0} role="region" aria-label="Declared state transition table"><table className="w-full text-left text-sm"><caption className="p-2 text-left font-semibold">Complete declared transitions</caption><thead><tr><th scope="col" className="p-2">Current state</th><th scope="col" className="p-2">Signal</th><th scope="col" className="p-2">Next state</th></tr></thead><tbody>{diagram.transitions.map((transition, index) => <tr key={index} className="border-t border-slate-200"><th scope="row" className="p-2">{transition.from}</th><td className="p-2">{transition.event}</td><td className="p-2">{transition.to}</td></tr>)}</tbody></table></div>
  </figure>;
}
