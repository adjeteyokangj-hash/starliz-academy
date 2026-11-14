"use client";
import { useEffect, useRef, useState } from "react";
import type { EvidenceManifest } from "@/lib/coding/learning/evidence-links";
import type { SavedEvidenceEntry } from "@/lib/coding/learning/saved-evidence";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import SavedValues from "./SavedValues";
import LearningExecution from "./LearningExecution";
import SourceEditor from "./SourceEditor";
import ProjectFilesEditor from "./ProjectFilesEditor";

export default function EvidencePreview({ binding, audience = "learner", childId, bookingId, portfolioView = false }: { binding: EvidenceManifest[number]; audience?: "learner" | "parent"; childId?: string; bookingId?: string; portfolioView?: boolean }) {
  const [loaded, setLoaded] = useState<{ key: string; project?: SavedEvidenceEntry; error?: string } | null>(null), [expanded, setExpanded] = useState(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const key = `${audience}:${childId ?? "active"}:${binding.versionId}:${binding.artifactHash}`;
  const query = new URLSearchParams(audience === "parent" ? { studentId: childId ?? "", evidenceVersionId: binding.versionId } : { versionId: binding.versionId });
  if (audience === "learner" && bookingId) query.set("bookingId", bookingId);
  const endpoint = `${audience === "parent" ? "/api/parent/coding" : "/api/student/coding/evidence"}?${query}`;
  const activityId = binding.activityId, artifactHash = binding.artifactHash, versionId = binding.versionId;
  useEffect(() => {
    const abort = new AbortController();
    fetchWithRefreshRetry(endpoint, { signal: abort.signal, cache: "no-store" }).then(async (response) => {
      const body = await response.json(), project = body.project as SavedEvidenceEntry | undefined;
      if (!response.ok || !project?.artifact || project.versionId !== versionId || project.activity.id !== activityId || project.artifactHash !== artifactHash || project.status !== "practical-verified") throw new Error(body.error ?? "This frozen creation no longer matches the selected evidence. Reselect an available version.");
      if (!abort.signal.aborted) setLoaded({ key, project });
    }).catch((failure) => { if (!abort.signal.aborted) setLoaded({ key, error: failure instanceof Error ? failure.message : "The selected evidence is unavailable." }); });
    return () => abort.abort();
  }, [endpoint, key, activityId, artifactHash, versionId]);
  const current = loaded?.key === key ? loaded : null, project = current?.project;
  useEffect(() => { if (expanded && current) heading.current?.focus(); }, [expanded, current]);
  return <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)} className="min-w-0 space-y-3 rounded-xl border-2 border-sky-500 bg-sky-50 p-4" aria-label="Selected private creation evidence">
    <summary className="min-h-11 cursor-pointer font-bold">Saved creation: {binding.title}</summary>
    {expanded && <div className="space-y-4"><h4 ref={heading} tabIndex={-1} className="font-semibold outline-offset-4">{portfolioView ? "Saved work" : "Actual frozen creation"} · {binding.title}</h4>{!portfolioView && <p className="text-sm">This reads the selected private snapshot. It does not execute source or change the current workspace.</p>}
      {!current && <p role="status">Opening the authorised saved version…</p>}{current?.error && <p role="alert" className="text-sm text-amber-950">{current.error}</p>}
      {project?.artifact && <><LearningExecution portfolioView={portfolioView} execution={project.execution ?? null} input={project.input ?? {}} stylesheet={project.artifact.type === "source" ? project.artifact.css : ""} />
        <details className="rounded-lg border border-slate-300 bg-white p-3"><summary className="min-h-11 cursor-pointer font-semibold">Inspect linked source and files</summary>{project.artifact.type === "source" ? <div className="space-y-3"><SourceEditor value={project.artifact.source} language={project.artifact.language} label="Linked creation source" readOnly />{project.artifact.html && <SourceEditor value={project.artifact.html} language="html" label="Linked creation HTML" readOnly />}{project.artifact.css && <SourceEditor value={project.artifact.css} language="css" label="Linked creation stylesheet" readOnly />}{Object.keys(project.artifact.projectFiles ?? {}).length > 0 && <ProjectFilesEditor artifact={project.artifact} readOnly onChange={() => {}} />}</div> : portfolioView ? <div className="max-h-80 overflow-auto text-sm"><SavedValues value={project.artifact.document} /></div> : <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(project.artifact.document, null, 2)}</pre>}{Object.entries(project.files ?? {}).map(([name, content]) => <div key={name}><h5 className="mt-3 font-mono text-sm">{name}</h5><pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs">{content}</pre></div>)}</details></>}
    </div>}
  </details>;
}
