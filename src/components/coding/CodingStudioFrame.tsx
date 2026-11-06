"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

export default function CodingStudioFrame({ year, learning, outputs, children, beginner = false }: { year: number; learning: ReactNode; outputs: ReactNode; children: ReactNode; beginner?: boolean }) {
  const [compact, setCompact] = useState(false), [width, setWidth] = useState(500), [tutorExpanded, setTutorExpanded] = useState(false);
  const frame = useRef<HTMLElement>(null);
  const tutorButton = useRef<HTMLButtonElement>(null), tutorId = useId(), guideId = useId();
  const closeTutor = useCallback(() => {
    setTutorExpanded(false);
    const tutor = frame.current?.querySelector<HTMLDetailsElement>("details[data-studio-tutor]");
    if (tutor) tutor.open = false;
    tutorButton.current?.focus();
  }, []);
  useEffect(() => {
    const tutor = frame.current?.querySelector<HTMLDetailsElement>("details[data-studio-tutor]");
    if (tutor) tutor.id = tutorId;
    if (!tutorExpanded || !tutor) return;
    tutor.open = true;
    tutor.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); closeTutor(); } };
    const toggle = () => { if (!tutor.open) closeTutor(); };
    window.addEventListener("keydown", escape); tutor.addEventListener("toggle", toggle);
    return () => { window.removeEventListener("keydown", escape); tutor.removeEventListener("toggle", toggle); };
  }, [tutorExpanded, tutorId, closeTutor]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 759px)");
    const collapse = () => { if (media.matches) frame.current?.querySelectorAll<HTMLDetailsElement>("details[data-studio-tutor]").forEach(tutor => { tutor.open = false; }); };
    collapse(); media.addEventListener("change", collapse); return () => media.removeEventListener("change", collapse);
  }, []);
  const band = year <= 2 ? "Explorers" : year <= 4 ? "Builders" : year <= 6 ? "Creators" : year <= 9 ? "Developers" : "Engineers";
  return <section ref={frame} className={`coding-studio ${compact ? "coding-studio-compact" : ""} ${year <= 2 ? "coding-studio-early" : ""} ${tutorExpanded ? "studio-tutor-expanded" : ""}`} aria-label={`${band} Coding Studio`} style={{ "--studio-results": `${width}px` } as React.CSSProperties}>
    <aside aria-label="Learn & Explore" className="studio-learning"><div className="studio-panel-bar"><h2>Learn & explore</h2><button type="button" aria-controls={guideId} aria-expanded={!compact} onClick={() => { if (tutorExpanded) closeTutor(); setCompact(!compact); }} className="min-h-11 rounded-lg border border-violet-200 px-3 text-sm font-semibold text-violet-900">{compact ? "Show Learn & Explore" : "Collapse Learn & Explore"}</button><button ref={tutorButton} type="button" aria-controls={tutorId} aria-expanded={tutorExpanded} onClick={() => { setCompact(false); setTutorExpanded(true); }} className="min-h-11 rounded-lg bg-violet-100 px-3 text-sm font-semibold text-violet-950">{beginner ? "Ask AI for help" : "Expand AI tutor"}</button></div><div id={guideId} className="studio-guide-content">{learning}</div></aside>
    <div className="studio-editor min-w-0 space-y-4"><div className="studio-panel-bar"><h2>My workspace</h2><span className="text-xs text-violet-700">{band} · Year {year}</span></div>{children}</div>
    <aside className="studio-results min-w-0 space-y-4">{beginner ? <p className="col-span-full text-sm font-semibold text-slate-600">Watch the example · then try your own</p> : <label className="studio-output-size text-sm font-semibold text-slate-600"><span>Compare your results</span><input aria-label="Results panel width" className="ml-2 accent-violet-600" type="range" min={440} max={620} step={20} value={width} onChange={event => setWidth(Number(event.target.value))} /></label>}{outputs}</aside>
    {tutorExpanded && <button type="button" className="studio-tutor-close min-h-11 rounded-lg border border-violet-300 bg-white px-3 font-semibold text-violet-950" onClick={closeTutor}>Close tutor</button>}
  </section>;
}
