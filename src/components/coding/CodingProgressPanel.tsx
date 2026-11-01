"use client";

import { useEffect, useState } from "react";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";

type Summary = {
  started: boolean;
  lessonTitle: string;
  pathwayTitle: string;
  skillStatus: string;
  evidence: Record<string, boolean>;
  skills: string[];
  project: string;
  supportNeeded: boolean;
  attempts: number;
  checksPassed: number;
  teacherFeedback: string | null;
  certificate: { title: string; body: string } | null;
  placement: { note: string } | null;
};

const STATUS: Record<string, string> = {
  not_started: "Not started",
  learning: "Learning",
  practising: "Practising",
  mastered: "Mastered",
};

const EVIDENCE = [
  ["prediction", "Prediction"],
  ["practical", "Practical task"],
  ["debugging", "Debugging"],
  ["explanation", "Explanation"],
  ["independent", "Independent challenge"],
] as const;

export default function CodingProgressPanel({ childId }: { childId: string | null }) {
  const [panel, setPanel] = useState<{ childId: string; summary: Summary | null; error: string | null } | null>(null);

  useEffect(() => {
    if (!childId) return;
    const requestedChildId = childId;
    let cancelled = false;
    void fetchWithRefreshRetry(`/api/parent/coding?studentId=${encodeURIComponent(requestedChildId)}`, {
      credentials: "include",
      cache: "no-store",
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (!response.ok) {
        setPanel({
          childId: requestedChildId,
          summary: null,
          error: typeof data.error === "string" ? data.error : "Coding progress could not be loaded.",
        });
        return;
      }
      setPanel({ childId: requestedChildId, summary: data.summary as Summary, error: null });
    });
    return () => {
      cancelled = true;
    };
  }, [childId]);

  if (!childId) return null;
  const summary = panel?.childId === childId ? panel.summary : null;
  const error = panel?.childId === childId ? panel.error : null;
  if (error) return <p className="text-sm text-rose-300">{error}</p>;
  if (!summary) return <p className="text-sm text-slate-400">Loading coding progress…</p>;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
      <p className="font-semibold text-white">Coding · {summary.pathwayTitle}</p>
      <p className="mt-1">{summary.lessonTitle} · {STATUS[summary.skillStatus] ?? summary.skillStatus}</p>
      <p className="mt-1 text-xs text-slate-400">Project: {summary.project}. The code stays private.</p>
      <ul className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
        {EVIDENCE.map(([id, label]) => (
          <li key={id}>{summary.evidence[id] ? "Shown" : "Not yet"} · {label}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-400">Attempts {summary.attempts} · Checks passed {summary.checksPassed}</p>
      {summary.supportNeeded ? <p className="mt-2 text-xs text-amber-200">Support need: several hints have been used and the skill is not mastered yet.</p> : null}
      {summary.teacherFeedback ? <p className="mt-2 text-xs">Teacher note: {summary.teacherFeedback}</p> : null}
      {summary.placement?.note ? <p className="mt-2 text-xs text-slate-400">{summary.placement.note}</p> : null}
      {summary.certificate ? (
        <p className="mt-3 text-xs text-emerald-200">
          <span className="font-semibold">{summary.certificate.title}.</span> {summary.certificate.body}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-slate-500">Skills: {summary.skills.join("; ")}</p>
    </div>
  );
}
