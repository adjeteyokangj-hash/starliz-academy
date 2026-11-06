"use client";
import { useEffect, useState } from "react";
import type { learnerSavedEvidence } from "@/lib/coding/learning/saved-evidence";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import LearningExecution from "./LearningExecution";
import SourceEditor from "./SourceEditor";
import EvidencePreview from "./EvidencePreview";
import PrivateDemonstrationPlayer from "./PrivateDemonstrationPlayer";
import { evidenceManifestSchema } from "@/lib/coding/learning/evidence-links";

type Entry = Awaited<ReturnType<typeof learnerSavedEvidence>>[number];
export default function SavedEvidenceLibrary({ audience = "learner", childId }: { audience?: "learner" | "parent"; childId?: string } = {}) {
  if (audience === "parent" && !childId) return null;
  return <ScopedEvidenceLibrary key={`${audience}:${childId ?? "own"}`} audience={audience} childId={childId} />;
}
function ScopedEvidenceLibrary({ audience, childId }: { audience: "learner" | "parent"; childId?: string }) {
  const indexUrl = audience === "parent" ? `/api/parent/coding?studentId=${encodeURIComponent(childId!)}&evidenceList=1` : "/api/student/coding/evidence";
  const [entries, setEntries] = useState<Entry[] | null>(null), [selected, setSelected] = useState("");
  const [loaded, setLoaded] = useState<{ id: string; project?: Entry; error?: string } | null>(null), [error, setError] = useState("");
  const [opened, setOpened] = useState<{ id: string; slot: "first" | "second" } | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetchWithRefreshRetry(indexUrl, { signal: abort.signal, cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.projects)) throw new Error(body.error ?? "Your saved versions could not be opened.");
      if (!abort.signal.aborted) setEntries(body.projects);
    }).catch((failure) => { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : "Your saved versions are unavailable."); });
    return () => abort.abort();
  }, [indexUrl]);
  const active = entries?.find((entry) => entry.versionId === selected)?.versionId ?? entries?.[0]?.versionId;
  useEffect(() => {
    if (!active) return;
    const abort = new AbortController();
    const detailUrl = audience === "parent" ? `/api/parent/coding?studentId=${encodeURIComponent(childId!)}&evidenceVersionId=${encodeURIComponent(active)}` : `/api/student/coding/evidence?versionId=${encodeURIComponent(active)}`;
    fetchWithRefreshRetry(detailUrl, { signal: abort.signal, cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok || !body.project?.artifact) throw new Error(body.error ?? "This saved version could not be opened.");
      if (!abort.signal.aborted) setLoaded({ id: active, project: body.project });
    }).catch((failure) => { if (!abort.signal.aborted) setLoaded({ id: active, error: failure instanceof Error ? failure.message : "This saved version is unavailable." }); });
    return () => abort.abort();
  }, [active, audience, childId]);
  const current = loaded?.id === active ? loaded : null, project = current?.project;
  const input = project?.input && typeof project.input === "object" && !Array.isArray(project.input) ? project.input : {};
  const parsedEvidence = evidenceManifestSchema.safeParse(input.savedEvidence);
  const evidence = parsedEvidence.success ? parsedEvidence.data : [], openedSlot = opened?.id === active ? opened?.slot : null;
  const binding = openedSlot ? evidence.find(item => item.slot === openedSlot) : null;
  return <section className="min-w-0 space-y-4 rounded-2xl border border-slate-300 bg-white p-4 text-slate-950 sm:p-6" aria-label="Private saved work evidence">
    <header><h2 className="text-xl font-bold">{audience === "parent" ? "Your child’s saved work and practical bridges" : "Your saved work evidence"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">Inspect the latest 100 saved versions, including work in progress and practical bridges. A saved draft is not an independent achievement. Opening a snapshot keeps the current working copy unchanged.</p></header>
    {error && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">{error}</p>}
    {!entries && !error && <p role="status">Opening saved versions…</p>}
    {entries?.length === 0 && <p className="text-sm text-slate-600">Save a version in your learning workspace to keep evidence here.</p>}
    {Boolean(entries?.length) && <label className="block text-sm font-semibold">Choose saved evidence<select className="mt-2 min-h-11 w-full rounded-xl border border-slate-400 bg-white p-3" value={active} onChange={(event) => setSelected(event.target.value)}>{entries!.map((entry) => <option key={entry.versionId} value={entry.versionId}>{entry.activity.title} · {entry.readinessEvidence ? "Practical bridge · " : ""}{entry.stage} · {entry.status === "practical-verified" ? "Practical checks passed" : entry.status === "saved-version" ? "Saved version" : "Saved draft"} · {new Date(entry.createdAt).toLocaleString("en-GB")}</option>)}</select></label>}
    {active && !current && <p role="status">Opening the frozen saved version…</p>}
    {current?.error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">{current.error}</p>}
    {project?.artifact && <article className="min-w-0 space-y-4"><h3 className="font-bold">{project.activity.title} · {project.readinessEvidence ? "Practical bridge · " : ""}{project.status === "practical-verified" ? "Practical checks passed" : "Saved draft"}</h3>
      {project.demonstration && <PrivateDemonstrationPlayer attachment={project.demonstration} activityId={project.activity.id} audience={audience} childId={childId} />}
      {project.execution ? <LearningExecution execution={project.execution} input={project.input ?? {}} evidence={evidence} onEvidence={slot => setOpened({ id: active!, slot })} stylesheet={project.artifact.type === "source" ? project.artifact.css : ""} /> : <p className="rounded-xl bg-slate-50 p-3 text-sm">This version retains its source and files but has no matching replay snapshot. Open your learning workspace to run a working copy.</p>}
      {binding && <EvidencePreview key={`${audience}:${childId ?? "own"}:${binding.versionId}:${binding.artifactHash}`} binding={binding} audience={audience} childId={childId} />}
      <details className="rounded-xl border p-3"><summary className="min-h-11 cursor-pointer font-semibold">Inspect this frozen source and files</summary>{project.artifact.type === "source" ? <div className="space-y-3"><SourceEditor value={project.artifact.source} language={project.artifact.language} label="Saved evidence program source" readOnly />{project.artifact.html && <SourceEditor value={project.artifact.html} language="html" label="Saved evidence HTML" readOnly />}{project.artifact.css && <SourceEditor value={project.artifact.css} language="css" label="Saved evidence stylesheet" readOnly />}</div> : <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(project.artifact.document, null, 2)}</pre>}{Object.entries(project.files ?? {}).map(([name, content]) => <div key={name}><h4 className="mt-3 font-mono text-sm">{name}</h4><pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs">{content}</pre></div>)}</details>
    </article>}
  </section>;
}
