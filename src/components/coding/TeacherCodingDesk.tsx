"use client";

import { useEffect, useState } from "react";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import TeacherActivityDesk, { type TeacherActivity, type TeacherActivityIndex } from "./TeacherActivityDesk";

type Student = { id: string; name: string; yearGroup: string | null };
type Workspace = {
  id: string;
  childId: string;
  learnerName: string;
  yearGroup: string | null;
  stage: string;
  skillStatus: string;
  assignmentStatus: string;
  attemptCount: number;
  checksPassed: number;
  hintCount: number;
  feedback: string | null;
  teacherFeedback: string | null;
  evidence: Array<{ id: string; label: string; met: boolean }>;
  program: { blocks: unknown[] };
  supportHandoff: string | null;
};

export default function TeacherCodingDesk() {
  const [students, setStudents] = useState<Student[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activities, setActivities] = useState<TeacherActivity[]>([]), [activityRows, setActivityRows] = useState<TeacherActivityIndex>([]), [assistanceEnabled, setAssistanceEnabled] = useState(false);
  const [lessonTitle, setLessonTitle] = useState("Understanding Loops");
  const [childId, setChildId] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetchWithRefreshRetry("/api/teacher/coding", { credentials: "include", cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(typeof data.error === "string" ? data.error : "Coding desk could not be loaded.");
      return;
    }
    setError(null);
    setStudents(data.students ?? []);
    setWorkspaces(data.workspaces ?? []);
    setActivities(data.activities ?? []); setActivityRows(data.activityWorkspaces ?? []); setAssistanceEnabled(data.humanAssistanceEnabled === true);
    if (data.lesson?.title) setLessonTitle(data.lesson.title);
  }

  useEffect(() => {
    let cancelled = false;
    void fetchWithRefreshRetry("/api/teacher/coding", { credentials: "include", cache: "no-store" }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "Coding desk could not be loaded.");
        return;
      }
      setError(null);
      setStudents(data.students ?? []);
      setWorkspaces(data.workspaces ?? []);
      setActivities(data.activities ?? []); setActivityRows(data.activityWorkspaces ?? []); setAssistanceEnabled(data.humanAssistanceEnabled === true);
      if (data.lesson?.title) setLessonTitle(data.lesson.title);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function assign() {
    setMessage(null);
    const response = await fetchWithRefreshRetry("/api/teacher/coding", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign", childId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(typeof data.error === "string" ? data.error : "Assignment failed.");
      return;
    }
    setMessage(`${lessonTitle} is assigned.`);
    await load();
  }

  async function sendFeedback(workspaceId: string) {
    const feedback = notes[workspaceId]?.trim();
    if (!feedback) return;
    const response = await fetchWithRefreshRetry("/api/teacher/coding", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "feedback", workspaceId, feedback }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      setError(typeof data.error === "string" ? data.error : "Feedback could not be saved.");
      return;
    }
    setMessage("Feedback saved for the learner.");
    await load();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Coding</h1>
        <p className="text-sm text-foreground/70">Assign {lessonTitle}, review private projects, and watch mastery evidence. Working code alone is not mastery.</p>
      </header>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      <TeacherActivityDesk students={students} activities={activities} rows={activityRows} humanAssistanceEnabled={assistanceEnabled} onSaved={load} />
      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-4">
        <label className="text-sm">
          Learner
          <select value={childId} onChange={(event) => setChildId(event.target.value)} className="mt-1 block rounded-lg border border-border bg-background px-3 py-2">
            <option value="">Choose</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>{student.name}{student.yearGroup ? ` · ${student.yearGroup}` : ""}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void assign()} disabled={!childId} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          Assign lesson
        </button>
      </section>
      <section className="space-y-4">
        {workspaces.length === 0 ? <p className="text-sm text-foreground/60">No coding work from your classes yet.</p> : null}
        {workspaces.map((row) => (
          <article key={row.id} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">{row.learnerName}</h2>
              <p className="text-xs uppercase tracking-wide text-foreground/50">{row.skillStatus} · {row.assignmentStatus}</p>
            </div>
            <p className="mt-1 text-sm text-foreground/70">{row.yearGroup ?? "Year not set"} · stage {row.stage} · attempts {row.attemptCount} · hints {row.hintCount}</p>
            <ul className="mt-2 flex flex-wrap gap-2 text-xs">
              {row.evidence.map((item) => (
                <li key={item.id} className="rounded-full bg-muted px-2 py-1">{item.met ? "Met" : "Open"} · {item.label}</li>
              ))}
            </ul>
            <pre className="mt-3 overflow-auto rounded-lg bg-muted/50 p-3 text-xs">{JSON.stringify(row.program, null, 2)}</pre>
            {row.feedback ? <p className="mt-2 text-sm">Latest check: {row.feedback}</p> : null}
            {row.supportHandoff ? <p className="mt-2 text-xs text-foreground/60">A human-support handoff is saved for this project.</p> : null}
            <label className="mt-3 block text-sm">
              Feedback
              <textarea
                disabled={!assistanceEnabled}
                maxLength={2000}
                value={notes[row.id] ?? row.teacherFeedback ?? ""}
                onChange={(event) => setNotes((current) => ({ ...current, [row.id]: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background p-2"
                rows={3}
              />
            </label>
            <button type="button" disabled={!assistanceEnabled} onClick={() => void sendFeedback(row.id)} className="mt-2 min-h-11 text-sm font-semibold text-primary disabled:opacity-50">Save feedback</button>
          </article>
        ))}
      </section>
    </div>
  );
}
