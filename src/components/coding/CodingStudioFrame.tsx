"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

export default function CodingStudioFrame({ year, learning, outputs, children, beginner = false }: { year: number; learning: ReactNode; outputs: ReactNode; children: ReactNode; beginner?: boolean }) {
  const [tutorExpanded, setTutorExpanded] = useState(false);
  const frame = useRef<HTMLElement>(null);
  const tutorButton = useRef<HTMLButtonElement>(null), tutorId = useId();
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
  return <section ref={frame} className={`coding-studio ${year <= 2 ? "coding-studio-early" : ""} ${tutorExpanded ? "studio-tutor-expanded" : ""}`} aria-label={`${band} Coding Studio`}>
    <aside className="studio-learning">
      <div className="studio-panel-bar items-start">
        <details data-coding-instructions className="min-w-0 flex-1">
          <summary data-guide-target="lesson-instructions" className="min-h-11 cursor-pointer py-2 font-bold text-violet-950">Instructions</summary>
          <div className="studio-guide-content">{learning}</div>
        </details>
        <button ref={tutorButton} data-guide-target="existing-tutor" type="button" aria-controls={tutorId} aria-expanded={tutorExpanded} onClick={() => {
          const instructions = frame.current?.querySelector<HTMLDetailsElement>("[data-coding-instructions]");
          if (instructions) instructions.open = true;
          setTutorExpanded(true);
        }} className="min-h-11 rounded-lg bg-violet-100 px-3 text-sm font-semibold text-violet-950">{beginner ? "Ask AI for help" : "Expand AI tutor"}</button>
      </div>
    </aside>
    <div className="studio-editor min-w-0 space-y-4"><div className="studio-panel-bar items-start"><h2 data-guide-target="coding-workspace">My Workspace</h2><span className="text-xs text-violet-700">{band} · Year {year}</span></div>{children}</div>
    <details open className="min-w-0 rounded-xl border border-violet-200 p-3">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">Compare lesson example and your program</summary>
      <aside className="studio-results min-w-0">{outputs}</aside>
    </details>
    {tutorExpanded && <button type="button" className="studio-tutor-close min-h-11 rounded-lg border border-violet-300 bg-white px-3 font-semibold text-violet-950" onClick={closeTutor}>Close tutor</button>}
  </section>;
}
