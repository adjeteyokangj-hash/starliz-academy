"use client";

import { useEffect, useState } from "react";
import type { parentActivityPortfolio, parentActivityProject } from "@/lib/coding/learning/parent-portfolio";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import LearningExecution from "./LearningExecution";
import SourceEditor from "./SourceEditor";
import ProjectFilesEditor from "./ProjectFilesEditor";
import EvidencePreview from "./EvidencePreview";
import PrivateDemonstrationPlayer from "./PrivateDemonstrationPlayer";
import { evidenceManifestSchema } from "@/lib/coding/learning/evidence-links";

export type ParentPortfolio = Awaited<ReturnType<typeof parentActivityPortfolio>>;
type Project = NonNullable<Awaited<ReturnType<typeof parentActivityProject>>>;
export default function ParentProjectPortfolio({ childId, projects, audience = "parent" }: { childId: string; projects: ParentPortfolio; audience?: "parent" | "learner" }) {
  const [selected, setSelected] = useState("");
  const [openedEvidence, setOpenedEvidence] = useState<{ versionId: string; slot: "first" | "second" } | null>(null);
  const [loaded, setLoaded] = useState<{ childId: string; versionId: string; audience: "parent" | "learner"; project?: Project; error?: string } | null>(null);
  const activeVersion = (projects.find((item) => item.versionId === selected) ?? projects[0])?.versionId;
  useEffect(() => {
    if (!activeVersion) return;
    const abort = new AbortController();
    const endpoint = audience === "learner" ? `/api/student/coding/portfolio?versionId=${encodeURIComponent(activeVersion)}` : `/api/parent/coding?studentId=${encodeURIComponent(childId)}&versionId=${encodeURIComponent(activeVersion)}`;
    fetchWithRefreshRetry(endpoint, { signal: abort.signal, cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok || !data.project) throw new Error(data.error ?? "This saved project could not be opened.");
      if (!abort.signal.aborted) setLoaded({ childId, versionId: activeVersion, audience, project: data.project });
    }).catch((error) => { if (!abort.signal.aborted) setLoaded({ childId, versionId: activeVersion, audience, error: error instanceof Error ? error.message : "This project is unavailable." }); });
    return () => abort.abort();
  }, [childId, activeVersion, audience]);
  if (!projects.length) return null;
  const current = loaded?.childId === childId && loaded.versionId === activeVersion && loaded.audience === audience ? loaded : null, project = current?.project;
  const input = project?.input && typeof project.input === "object" && !Array.isArray(project.input) ? project.input : {};
  const parsedEvidence = evidenceManifestSchema.safeParse(input.savedEvidence);
  const evidence = project?.activity.workbench === "web" && parsedEvidence.success ? parsedEvidence.data : [];
  return <section className="space-y-5 rounded-2xl border border-slate-300 bg-white p-4 text-slate-950 sm:p-6" aria-label="Private project portfolio">
    <header><h2 className="text-xl font-bold">{audience === "learner" ? "Your assessed curriculum creations" : "Your child’s actual work"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">These are the saved versions that passed independent practical assessments. Later edits retain these achievements. Access follows family and school permissions.</p></header>
    <label className="block text-sm font-semibold">Choose an achievement<select className="mt-2 min-h-11 w-full rounded-xl border border-slate-400 bg-white p-3" value={activeVersion} onChange={(event) => setSelected(event.currentTarget.value)}>{projects.map((item) => <option key={item.versionId} value={item.versionId}>Year {item.activity.year} · {item.activity.title} · {item.activity.kind}</option>)}</select></label>
    {!current && <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">Opening the assessed saved project…</p>}
    {current?.error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">{current.error}</p>}
    {project && <article key={project.versionId} className="space-y-5"><div><h3 className="text-lg font-bold">{project.activity.title}</h3><p className="mt-1 text-sm text-slate-600">{project.activity.objective}</p><p className="mt-2 text-xs text-slate-500">Assessed version saved {new Date(project.createdAt).toLocaleString("en-GB")} · {project.activity.pathwayId}</p></div>
      {project.demonstration && <PrivateDemonstrationPlayer attachment={project.demonstration} activityId={project.activity.id} audience={audience} childId={childId} />}
      <LearningExecution execution={project.execution} input={project.input ?? {}} evidence={evidence} onEvidence={(slot) => setOpenedEvidence({ versionId: project.versionId, slot })} stylesheet={project.artifact.type === "source" ? project.artifact.css : ""} />
      {openedEvidence?.versionId === project.versionId && evidence.filter((entry) => entry.slot === openedEvidence.slot).map((entry) => <EvidencePreview key={`${audience}:${childId}:${entry.versionId}`} binding={entry} audience={audience} childId={childId} />)}
      {project.artifact.type === "source" && Object.keys(project.artifact.projectFiles ?? {}).length > 0 && <details className="rounded-xl border border-slate-300 p-4"><summary className="min-h-8 cursor-pointer font-semibold">Inspect supporting source files</summary><div className="mt-3"><ProjectFilesEditor artifact={project.artifact} readOnly onChange={() => {}} /></div></details>}
      <div className="rounded-xl bg-sky-50 p-4"><h4 className="font-semibold">{audience === "learner" ? "Your explanation" : "Your child’s explanation"}</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-800">{project.explanation}</p></div>
      <details className="rounded-xl border border-slate-300 p-4"><summary className="min-h-8 cursor-pointer font-semibold">Inspect the saved source and project files</summary><div className="mt-4 min-w-0 space-y-4">{project.artifact.type === "source" ? <><SourceEditor value={project.artifact.source} language={project.artifact.language} label="Assessed program source" readOnly />{project.artifact.html && <SourceEditor value={project.artifact.html} language="html" label="Assessed HTML source" readOnly />}{project.artifact.css && <SourceEditor value={project.artifact.css} language="css" label="Assessed stylesheet" readOnly />}</> : <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(project.artifact.document, null, 2)}</pre>}{Object.entries(project.files).map(([name, contents]) => <div key={name}><h4 className="mb-2 text-sm font-semibold">{name}</h4><pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-100 p-3 text-xs">{contents}</pre></div>)}</div></details>
      <details className="rounded-xl border border-slate-300 p-4"><summary className="min-h-8 cursor-pointer font-semibold">View the verified assessment criteria</summary><ul className="mt-3 space-y-2 text-sm text-green-900">{project.checks.map((check, i) => <li key={i}>✓ {check.description}</li>)}</ul><p className="mt-4 text-xs text-slate-500">This achievement verifies this activity. A complete course or pathway requires all of its learning activities.</p></details>
    </article>}
  </section>;
}
