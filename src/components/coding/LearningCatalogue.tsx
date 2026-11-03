"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";
import type { codingActivityProgress } from "@/lib/coding/learning/workspace-store";
type Activity = Awaited<ReturnType<typeof codingActivityProgress>>[number];
const kindLabel = { lesson: "Core lesson", consolidation: "Consolidation", project: "Portfolio project" };
export default function LearningCatalogue({ yearGroup }: { yearGroup: string | null }) {
  const [activities, setActivities] = useState<Activity[]>([]), [error, setError] = useState(""), [year, setYear] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    fetchWithRefreshRetry("/api/student/coding/activities", { signal: abort.signal, credentials: "same-origin", cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("The curriculum could not be opened. Your saved work remains safe.");
      const payload = await response.json();
      if (!abort.signal.aborted && Array.isArray(payload.activities)) setActivities(payload.activities);
    }).catch((failure) => { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : "The curriculum is unavailable."); });
    return () => abort.abort();
  }, []);
  if (!activities.length) return error ? <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">{error}</p> : null;
  const years = [...new Set(activities.map((activity) => activity.year))].sort((a, b) => a - b);
  const enrolled = Number(yearGroup?.match(/\d+/)?.[0]), activeYear = years.includes(year) ? year : years.includes(enrolled) ? enrolled : years[0]!;
  const selected = activities.filter((activity) => activity.year === activeYear), modules = [...new Set(selected.map((activity) => activity.moduleId))];
  const completed = selected.filter((activity) => activity.status === "mastered").length;
  return <section className="min-w-0 space-y-5 rounded-2xl border border-slate-300 bg-white p-4 sm:p-6" aria-label="StarLiz Coding curriculum"><header className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-bold text-slate-950">Your Coding learning journey</h2><p className="mt-2 text-sm text-slate-600">Build skills through lessons, consolidation and independently assessed portfolio projects.</p></div><label className="text-sm font-semibold text-slate-800">Year<select className="ml-2 min-h-11 rounded-xl border border-slate-400 bg-white px-3" value={activeYear} onChange={(event) => setYear(Number(event.target.value))}>{years.map((year) => <option value={year} key={year}>Year {year}</option>)}</select></label></header><div><label htmlFor="coding-course-progress" className="text-sm font-semibold text-slate-800">{completed} of {selected.length} activities independently mastered</label><progress id="coding-course-progress" max={selected.length} value={completed} className="mt-2 block h-3 w-full accent-sky-700" /></div>{modules.map((moduleId, moduleIndex) => {
    const contents = selected.filter((activity) => activity.moduleId === moduleId).sort((a, b) => (a.kind === "lesson" ? 0 : a.kind === "consolidation" ? 1 : 2) - (b.kind === "lesson" ? 0 : b.kind === "consolidation" ? 1 : 2) || a.inventoryId.localeCompare(b.inventoryId, "en", { numeric: true }));
    return <details key={moduleId} open={moduleIndex === 0} className="min-w-0 rounded-xl border border-slate-300 p-4"><summary className="min-h-11 cursor-pointer font-semibold text-slate-950">Module {moduleIndex + 1} · {contents.filter((activity) => activity.status === "mastered").length}/{contents.length} mastered</summary><ol className="mt-3 grid gap-3 lg:grid-cols-2">{contents.map((activity) => <li key={activity.id} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold text-sky-800">{kindLabel[activity.kind]} · {activity.inventoryId}</p><h3 className="mt-2 font-bold text-slate-950">{activity.title}</h3><p className="mt-2 text-sm leading-6 text-slate-700">{activity.objective}</p><p className="mt-3 text-sm font-semibold text-slate-700">{activity.status === "mastered" ? "Independently mastered" : activity.unlocked ? activity.status === "not_started" ? "Ready to begin" : "Saved work ready to resume" : "Complete the prerequisite activities to unlock"}</p>{activity.unlocked && <Link className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-sky-800 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700" href={`/student/coding/activities/${encodeURIComponent(activity.id)}`}>{activity.status === "not_started" ? "Begin activity" : "Open saved activity"}</Link>}</li>)}</ol></details>;
  })}</section>;
}
