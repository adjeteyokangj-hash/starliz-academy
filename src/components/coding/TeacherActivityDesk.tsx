"use client";
import { useEffect, useState } from "react";
import type { teacherActivityIndex, teacherActivityDetail } from "@/lib/coding/teacher-activities";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import LearningExecution from "./LearningExecution";
import SourceEditor from "./SourceEditor";
import ProjectFilesEditor from "./ProjectFilesEditor";

export type TeacherActivity = { id: string; title: string; year: number; kind: string; objective: string };
export type TeacherActivityIndex = Awaited<ReturnType<typeof teacherActivityIndex>>;
type Detail = NonNullable<Awaited<ReturnType<typeof teacherActivityDetail>>>;
const control = "min-h-11 max-w-full rounded-xl border border-slate-400 bg-white px-3 py-2 text-slate-950 disabled:opacity-50";
export default function TeacherActivityDesk({ students, activities, rows, humanAssistanceEnabled, onSaved }: { students: Array<{ id: string; name: string; yearGroup: string | null }>; activities: TeacherActivity[]; rows: TeacherActivityIndex; humanAssistanceEnabled: boolean; onSaved: () => Promise<void> }) {
  const [childId, setChildId] = useState(""), [year, setYear] = useState(1), [activityId, setActivityId] = useState(""), [selected, setSelected] = useState("");
  const [loaded, setLoaded] = useState<Detail | null>(null), [note, setNote] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const visible = rows.filter((row) => !childId || row.childId === childId), active = visible.find((row) => row.id === selected), detail = loaded?.id === active?.id ? loaded : null;
  const activeId = active?.id;
  useEffect(() => {
    if (!activeId) return;
    const abort = new AbortController();
    fetchWithRefreshRetry(`/api/teacher/coding?activityWorkspaceId=${encodeURIComponent(activeId)}`, { cache: "no-store", signal: abort.signal }).then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.activityWorkspace) throw new Error(result.error ?? "The saved activity could not be opened.");
      if (!abort.signal.aborted) { setLoaded(result.activityWorkspace); setNote(result.activityWorkspace.teacherFeedback ?? ""); setError(""); }
    }).catch((error) => { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : "The saved activity could not be opened."); });
    return () => abort.abort();
  }, [activeId]);
  async function send(body: Record<string, string>) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetchWithRefreshRetry("/api/teacher/coding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "This action could not be saved.");
      setMessage(body.action === "assign" ? "Activity assigned. Existing progress has been preserved." : detail && !detail.workspace.mastered && ["create", "review"].includes(detail.workspace.stage) ? "Feedback saved. Independent-task assistance has been recorded." : "Feedback saved for the learner.");
      if (body.action === "feedback") setLoaded((previous) => previous ? { ...previous, teacherFeedback: note } : previous);
      await onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : "This action could not be saved."); }
    finally { setBusy(false); }
  }
  const workspace = detail?.workspace, artifact = workspace?.artifact;
  return <section aria-label="Coding curriculum teaching desk" className="min-w-0 space-y-5 rounded-2xl border border-slate-300 bg-white p-4 text-slate-950 sm:p-6">
    <header><h2 className="text-xl font-bold">Curriculum activities and actual learner work</h2><p className="mt-2 text-sm leading-6 text-slate-600">Assign released activities and inspect saved work in your classes. AI remains the primary teacher. Human feedback is {humanAssistanceEnabled ? "enabled" : "disabled by the administrator"}.</p></header>
    <label className="block text-sm font-semibold">Learner<select className={`${control} mt-2 w-full`} value={childId} onChange={(event) => { setChildId(event.target.value); setSelected(""); }}><option value="">Choose a learner</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.yearGroup ?? "Year not set"}</option>)}</select></label>
    <fieldset disabled={busy} className="space-y-3 rounded-xl border border-slate-300 p-3"><legend className="font-semibold">Assign a curriculum activity</legend><label className="block text-sm">Year<select className={`${control} ml-3`} value={year} onChange={(event) => { setYear(Number(event.target.value)); setActivityId(""); }}>{Array.from({ length: 11 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>
      <label className="block text-sm">Activity<select className={`${control} mt-2 w-full`} value={activityId} onChange={(event) => setActivityId(event.target.value)}><option value="">Choose an activity</option>{activities.filter((activity) => activity.year === year).map((activity) => <option key={activity.id} value={activity.id}>{activity.title} · {activity.kind}</option>)}</select></label>
      {!activities.length && <p className="text-sm text-slate-600">Curriculum activities will appear here when released.</p>}
      {activities.find((activity) => activity.id === activityId)?.objective && <p className="text-sm leading-6">{activities.find((activity) => activity.id === activityId)!.objective}</p>}
      <button type="button" className={control} disabled={!childId || !activityId} onClick={() => void send({ action: "assign", childId, activityId })}>Assign selected activity</button><p className="text-xs text-slate-600">Assignments retain the learner’s prerequisite and school-access requirements.</p>
    </fieldset>
    <label className="block text-sm font-semibold">Inspect saved activity<select className={`${control} mt-2 w-full`} value={active?.id ?? ""} onChange={(event) => setSelected(event.target.value)}><option value="">Choose saved work</option>{visible.map((row) => <option key={row.id} value={row.id}>{students.find((student) => student.id === row.childId)?.name ?? "Learner"} · {row.activity.title} · {row.stage}</option>)}</select></label>
    <p className="text-xs text-slate-600">Showing up to 100 recently updated curriculum workspaces from your authorised classes.</p>
    <div aria-live="polite">{error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-amber-950">{error}</p>}{message && <p className="rounded-xl bg-sky-50 p-3 text-sky-950">{message}</p>}{active && !detail && !error && <p role="status">Opening saved learner work…</p>}</div>
    {detail && workspace && artifact && <article className="min-w-0 space-y-4 rounded-xl border border-slate-300 p-4"><h3 className="font-bold">{workspace.activity.title}</h3><p className="text-sm">Stage: {workspace.stage} · {workspace.completedStages.length} of 7 stages verified · {workspace.mastered ? "Independent achievement recorded" : "Mastery pending"}</p>
      <LearningExecution execution={workspace.lastExecution} input={workspace.input} stylesheet={artifact.type === "source" ? artifact.css : ""} />
      <details className="rounded-xl border p-3"><summary className="min-h-11 cursor-pointer font-semibold">Inspect actual saved source</summary>{artifact.type === "source" ? <div className="space-y-3"><SourceEditor value={artifact.source} language={artifact.language} label="Saved learner source" readOnly />{artifact.html && <SourceEditor value={artifact.html} language="html" label="Saved HTML" readOnly />}{artifact.css && <SourceEditor value={artifact.css} language="css" label="Saved stylesheet" readOnly />}<ProjectFilesEditor artifact={artifact} readOnly onChange={() => {}} /></div> : <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(artifact.document, null, 2)}</pre>}</details>
      {workspace.explanation && <section><h4 className="font-semibold">Learner explanation</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{workspace.explanation}</p></section>}
      <label className="block text-sm font-semibold">Teacher feedback<textarea className={`${control} mt-2 min-h-28 w-full`} value={note} maxLength={2000} disabled={busy || !humanAssistanceEnabled} onChange={(event) => setNote(event.target.value)} /></label>
      <button type="button" className={control} disabled={busy || !humanAssistanceEnabled || !note.trim()} onClick={() => void send({ action: "feedback", workspaceId: detail.id, feedback: note.trim() })}>Save teacher feedback</button>
      <p className="text-xs leading-6 text-slate-600">Feedback on an unfinished independent task requires a fresh variation for independent credit. Existing achievements remain preserved.</p>
    </article>}
  </section>;
}
