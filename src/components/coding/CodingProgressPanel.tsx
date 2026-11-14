"use client";
import type { WorldPracticeSummary } from "@/lib/coding/world/oversight";

import { useEffect, useState } from "react";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import CodingProjectReplay from "@/components/coding/CodingProjectReplay";
import ParentProjectPortfolio, { type ParentPortfolio } from "./ParentProjectPortfolio";
import SavedEvidenceLibrary from "./SavedEvidenceLibrary";
import type { readinessOverview } from "@/lib/coding/learning/readiness";
import type { CodingProgram, CodingRunResult } from "@/lib/coding/types";

type Summary = {
  projectPreview?: { program: CodingProgram; run: CodingRunResult; updatedAt: string; evidenceStatus?: string } | null;
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
  const [panel, setPanel] = useState<{ childId: string; summary: Summary | null; error: string | null; worldPractice?: WorldPracticeSummary | null; portfolio?: ParentPortfolio; readiness?: Awaited<ReturnType<typeof readinessOverview>>; curriculum?: { available: number; started: number; mastered: number; lessons: number; consolidations: number; projects: number } } | null>(null);

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
      setPanel({ childId: requestedChildId, summary: data.summary as Summary, portfolio: data.portfolio ?? [], readiness: data.readiness, curriculum: data.curriculum, worldPractice: data.worldPractice, error: null });
    }).catch(() => {
      if (!cancelled) setPanel({ childId: requestedChildId, summary: null, error: "Coding progress could not be loaded. Please try again." });
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
      {panel?.childId === childId && Boolean(panel.curriculum?.started) && <section className="mb-4 rounded-xl border border-sky-700 bg-sky-950 p-4"><h3 className="font-bold text-white">Coding Learning progress</h3><p className="mt-2 text-sky-50">{panel.curriculum!.mastered} of {panel.curriculum!.available} learning activities independently verified.</p><p className="mt-2 text-xs text-sky-100">{panel.curriculum!.lessons} core lessons · {panel.curriculum!.consolidations} consolidation sessions · {panel.curriculum!.projects} portfolio projects. Practical entry bridges are reported separately.</p></section>}
      {panel?.childId === childId && panel.worldPractice && <section className="mb-4 rounded-xl border border-emerald-700 bg-emerald-950 p-4"><h3 className="font-bold text-white">Coding Game World · Free Practice</h3>{panel.worldPractice.recoveryRequired ? <p>The saved world needs recovery. Its original data has been retained.</p> : <><p className="mt-2 text-emerald-50">{panel.worldPractice.completed} inventions completed · {panel.worldPractice.stars} practice stars · {panel.worldPractice.hints} hints used.</p><p className="mt-2 text-xs text-emerald-100">{panel.worldPractice.locations.map(location => `${location.title}: ${location.completed}`).join(" · ")}</p></>}<p className="mt-2 text-xs text-emerald-100">Practice progress is separate from formal lesson mastery and teacher assessment.</p></section>}
      <details open={!panel?.curriculum?.started}><summary className="min-h-11 cursor-pointer font-semibold">Earlier Coding lesson record</summary>
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
      {summary.projectPreview ? <CodingProjectReplay key={childId + summary.projectPreview.updatedAt} project={summary.projectPreview} /> : null}
      </details>
      {panel?.childId === childId && panel.portfolio?.length ? <div className="mt-5"><ParentProjectPortfolio childId={childId} projects={panel.portfolio} /></div> : null}
      {childId && <div className="mt-5"><SavedEvidenceLibrary key={childId} audience="parent" childId={childId} /></div>}
      {panel?.childId === childId && panel.readiness && panel.readiness.entryYear > 1 && <p className="mt-4 rounded-xl bg-sky-950 p-4 text-sm text-sky-50">Practical entry readiness is verified for Year {panel.readiness.entryYear}. Inspect the actual bridge work above. Earlier lessons and courses retain their separate completion history.</p>}
    </div>
  );
}
